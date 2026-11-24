"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, verifiedEmploymentAt } from "@/lib/auth";
import { notify, notifyAdmins } from "@/lib/notify";
import { revokeCrossCompanyPendingApplications } from "@/lib/membership";
import { audienceOfUserOrAdmin, canAccessFaction } from "@/lib/scope";
import { syncGroupMembership } from "@/lib/groupchat";
import { saveProofFile } from "@/lib/upload";
import { checkUserText, submitUserImageCheck } from "@/lib/sec";
import { CATEGORIES, type CategoryKey } from "@/lib/constants";
import { parseCapacity, shortId } from "@/lib/utils";
import { buildLinkSnapshot, normalizeLinkUrl } from "@/lib/link-preview";
import {
  extractRichImagePaths,
  looksRichText,
  richTextToPlainText,
  sanitizeRichText,
} from "@/lib/rich-text";
import type { ActionState } from "@/lib/types";

function back(path: string, key: "ok" | "error", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${key}=${encodeURIComponent(message)}`);
}

async function membershipOf(factionId: string, userId: string) {
  return prisma.factionMember.findUnique({
    where: { factionId_userId: { factionId, userId } },
  });
}

async function requireFactionManager(factionId: string, userId: string) {
  const membership = await membershipOf(factionId, userId);
  if (!membership || membership.status !== "ACTIVE") return null;
  if (membership.role !== "LEADER" && membership.role !== "ADMIN") return null;
  return membership;
}

/** 派主 / 副派主可管理本派全部活动，普通成员只能管理自己发起的活动 */
async function canManageActivity(
  activity: { factionId: string; creatorId: string },
  userId: string,
) {
  if (activity.creatorId === userId) return true;
  return Boolean(await requireFactionManager(activity.factionId, userId));
}

/* ------------------------------- 加入 / 退出 ------------------------------ */

export async function joinFactionAction(formData: FormData) {
  const factionId = String(formData.get("factionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const path = `/factions/${slug}`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);

  const faction = await prisma.faction.findUnique({
    where: { id: factionId },
    include: { company: true },
  });
  if (!faction) back("/discover", "error", "该派不存在");

  // 页面层已把跨阵营的派渲染成 404，这里拦的是直接 POST 与历史链接：进不去的派也不能申请加入
  const joinAudience = await audienceOfUserOrAdmin(user);
  if (!(await canAccessFaction(factionId, joinAudience, user.id))) back("/discover", "error", "该派不存在");

  if (faction.status !== "ACTIVE") back(path, "error", "该派还在筹备审核中");

 // 查用户所有已认证的公司身份
  const allVerified = await prisma.employment.findMany({
    where: { userId: user.id, status: "VERIFIED" },
    include: { company: true },
  });
  if (!allVerified.length) {
    back(path, "error", "请先完成任一公司的身份认证，再申请加入兴趣派");
  }

  const sameCompany = allVerified.find((e) => e.companyId === faction.companyId) ?? null;
  const isCrossCompany = !sameCompany;

  // 已是成员 / 待审者优先短路：跨公司门禁只拦"尚未加入"的人，
  // 否则开关关闭后保留的跨公司 ACTIVE 成员会被 action 侧拦截，退出流程无从触发
  const existing = await membershipOf(factionId, user.id);
  if (existing?.status === "ACTIVE") back(path, "ok", "你已经是本派成员");
  if (existing?.status === "PENDING") back(path, "ok", `申请已提交，等待${faction.leaderId ? "派主" : "运营"}审批`);

  if (isCrossCompany && !faction.allowCrossCompany) {
    back(path, "error", `该派仅对${faction.company.shortName}认证成员开放`);
  }

  // 全局策略：所有派点击加入即直接通过，不再走审批流程；派主保留剔除成员权利
  const needApproval = false;

  // 每次进入 PENDING 都刷新 appliedAt，避免被拒/退出后重新申请时审批卡片显示陈旧时间；
  // 直接 ACTIVE（自由加入且同公司）无申请动作，置 null 保持字段语义干净。
  // 重新加入（update 分支）必须复位 role：被移出的副派主不能靠自助申请恢复管理权（派主除外）
  const now = new Date();
  const nextRole = faction.leaderId === user.id ? "LEADER" : "MEMBER";
  await prisma.$transaction(async (tx) => {
    await tx.factionMember.upsert({
      where: { factionId_userId: { factionId, userId: user.id } },
      create: {
        factionId,
        userId: user.id,
        role: "MEMBER",
        status: needApproval ? "PENDING" : "ACTIVE",
        appliedAt: needApproval ? now : null,
      },
      update: {
        status: needApproval ? "PENDING" : "ACTIVE",
        appliedAt: needApproval ? now : null,
        role: nextRole,
      },
    });

    // 状态迁移与计数同一事务，避免计数漂移
    if (!needApproval) {
      await tx.faction.update({
        where: { id: factionId },
        data: { memberCount: { increment: 1 } },
      });
    }
  });

  // 需审批的申请必须有受理人：有派主通知派主；无派主（招募派主中）通知运营代批，避免通知黑洞
  if (needApproval) {
    if (faction.leaderId && faction.leaderId !== user.id) {
      const bodyText = isCrossCompany
        ? `跨公司申请 · 已认证：${allVerified.map((e) => `${e.company.shortName}(${e.kind === "ALUMNI" ? "离职" : "在职"})`).join("、")}`
        : sameCompany!.kind === "ALUMNI"
          ? "身份：离职校友"
          : "身份：在职员工";
      await notify({
        userId: faction.leaderId,
        type: "POST",
        title: `${user.nickname} 申请加入「${faction.name}」`,
        body: bodyText,
        link: `/factions/${faction.slug}/manage?tab=members`,
      });
    } else if (!faction.leaderId) {
      // 运营代批入口统一指向后台「加入申请」队列，避免通知落到无法操作的用户端页面
      const adminQueueLink = `/admin/joins?factionId=${faction.id}`;
      // 防止重复通知：先清除同一申请人+同一派 的旧未读待代批通知
      await prisma.notification.deleteMany({
        where: {
          type: "SYSTEM",
          link: adminQueueLink,
          title: { contains: "加入申请待代批" },
          body: { contains: user.nickname },
          readAt: null,
        },
      });
      await notifyAdmins({
        type: "SYSTEM",
        title: `「${faction.name}」有加入申请待代批`,
        body: `该派暂无认证派主，${user.nickname} 的${isCrossCompany ? "跨公司" : ""}加入申请需运营代批`,
        link: adminQueueLink,
      });
    }
  } else if (faction.leaderId && faction.leaderId !== user.id) {
    await notify({
      userId: faction.leaderId,
      type: "POST",
      title: `${user.nickname} 加入了「${faction.name}」`,
      body: sameCompany!.kind === "ALUMNI" ? "身份：离职校友" : "身份：在职员工",
      link: `/factions/${faction.slug}`,
    });
  }

  revalidatePath(path);
  revalidatePath("/");
  revalidatePath("/discover");
  const successMsg = isCrossCompany
    ? `已提交跨公司加入申请，等待${faction.leaderId ? "派主" : "运营"}审批`
    : needApproval
      ? "已提交加入申请"
      : `欢迎加入${faction.name}`;
  back(path, "ok", successMsg);
}

export async function leaveFactionAction(formData: FormData) {
  const factionId = String(formData.get("factionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const path = `/factions/${slug}`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);

  const membership = await membershipOf(factionId, user.id);
  if (!membership || membership.status === "LEFT" || membership.status === "REMOVED") {
    back(path, "error", "你还没有加入本派");
  }
  if (membership.role === "LEADER") back(path, "error", "派主不能直接退出，请先联系运营");

  // 仅 ACTIVE 退出才减计数；PENDING 是“撤回申请”语义（从未计入 memberCount），不能 decrement 致下溢
  const wasActive = membership.status === "ACTIVE";
  await prisma.$transaction(async (tx) => {
    await tx.factionMember.update({
      where: { id: membership.id },
      data: { status: "LEFT" },
    });
    if (wasActive) {
      await tx.faction.update({
        where: { id: factionId },
        data: { memberCount: { decrement: 1 } },
      });
    }
  });
  
  // 撤回 PENDING 申请时，清除对应的管理员待代批通知（避免运营看到已无效的申请）
  if (!wasActive) {
    await prisma.notification.deleteMany({
      where: {
        type: "SYSTEM",
        link: `/admin/factions/${factionId}`,
        title: { contains: "加入申请待代批" },
        body: { contains: user.nickname },
        readAt: null,
      },
    });
  }

  revalidatePath(path);
  revalidatePath("/");
  back(path, "ok", wasActive ? "已退出该派" : "已撤回加入申请");
}

/* ------------------------------- 发帖 / 互动 ----------------------------- */

export async function createPostAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  const factionId = String(formData.get("factionId") ?? "");
  // 正文升级为富文本：含标签则白名单净化后入库，纯文本老路径原样；字数/送检按剥标签后的纯文本
  const rawContent = String(formData.get("content") ?? "");
  const plainContent = richTextToPlainText(rawContent).trim();
  const content = looksRichText(rawContent) ? sanitizeRichText(rawContent) : rawContent.trim();
  const title = String(formData.get("title") ?? "").trim();
  const image = formData.get("image");
  // 公众号文章/外站链接：入库前抓一份标题封面摘要作卡片快照
  const linkRaw = String(formData.get("link") ?? "").trim();
  const linkUrl = linkRaw ? normalizeLinkUrl(linkRaw) : null;
  if (linkRaw && !linkUrl) return { error: "链接格式不正确，请粘贴网页链接（支持公众号文章）" };

  if (plainContent.length < 2) return { error: "写点什么再发布吧" };
  if (plainContent.length > 2000) return { error: "内容请控制在 2000 字以内" };

  const faction = await prisma.faction.findUnique({ where: { id: factionId } });
  if (!faction || faction.status !== "ACTIVE") return { error: "该派当前不可发帖" };

  const membership = await membershipOf(factionId, user.id);
  if (!membership || membership.status !== "ACTIVE") {
    return { error: "加入本派后才能发言" };
  }
  // 置顶与公告是派主/副派主的治理权：表单只对他们渲染勾选框，这里再兜一层防伪造 FormData
  const isManager = membership.role !== "MEMBER";
  const wantPinned = isManager && formData.get("pinned") === "1";
  const wantAnnounce = isManager && formData.get("announce") === "1";
  // 首页公开招募不限角色（表单对全员渲染），这里只收正常发布的帖
  const wantRecruit = formData.get("recruit") === "1";

  const textCheck = await checkUserText(user.id, `${title} ${plainContent} ${linkUrl ?? ""}`.trim(), 4);
  if (!textCheck.ok) return { error: "内容涉及违规信息，请调整后重新发布" };

  let imagePath: string | null = null;
  if (image instanceof File && image.size > 0) {
    try {
      imagePath = await saveProofFile(image);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "图片上传失败" };
    }
  }

  const linkSnapshot = linkUrl ? await buildLinkSnapshot(linkUrl) : null;

  const post = await prisma.post.create({
    data: {
      factionId,
      authorId: user.id,
      title: title || null,
      content,
      images: imagePath,
      ...(linkSnapshot ?? {}),
      kind: wantAnnounce ? "ANNOUNCE" : "POST",
      pinned: wantPinned,
      recruit: wantRecruit,
    },
  });

  if (imagePath) await submitUserImageCheck(user.id, imagePath, { type: "POST", id: post.id });
  // 正文内联图（粘贴上传）同样逐张媒体送检，回调命中后整帖隐藏
  for (const richImage of extractRichImagePaths(content)) {
    if (richImage !== imagePath) {
      await submitUserImageCheck(user.id, richImage, { type: "POST", id: post.id });
    }
  }

  await prisma.faction.update({
    where: { id: factionId },
    data: { postCount: { increment: 1 } },
  });

  revalidatePath(`/factions/${faction.slug}`);
  revalidatePath("/");
  redirect(`/posts/${post.id}`);
}

export async function createCommentAction(formData: FormData) {
  const postId = String(formData.get("postId") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  const path = `/posts/${postId}`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (!content) back(path, "error", "评论不能为空");

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { faction: true },
  });
  if (!post || post.status !== "PUBLISHED") back("/discover", "error", "帖子不存在");

  // 登录即可评论：未加入的派也开放互动（回帖/点赞），发帖仍限派内成员
  const textCheck = await checkUserText(user.id, content, 2);
  if (!textCheck.ok) back(path, "error", "评论涉及违规信息，请调整后重新发送");

  await prisma.comment.create({
    data: { postId, authorId: user.id, content: content.slice(0, 500) },
  });
  await prisma.post.update({
    where: { id: postId },
    data: { commentCount: { increment: 1 } },
  });

  if (post.authorId !== user.id) {
    await notify({
      userId: post.authorId,
      type: "POST",
      title: `${user.nickname} 评论了你的帖子`,
      body: content.slice(0, 50),
      link: path,
    });
  }

  revalidatePath(path);
  redirect(path);
}

export async function toggleLikeAction(formData: FormData) {
  const postId = String(formData.get("postId") ?? "");
  const path = String(formData.get("redirectTo") ?? `/posts/${postId}`);

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);

  const existing = await prisma.postLike.findUnique({
    where: { postId_userId: { postId, userId: user.id } },
  });

  if (existing) {
    await prisma.$transaction([
      prisma.postLike.delete({ where: { id: existing.id } }),
      prisma.post.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.postLike.create({ data: { postId, userId: user.id } }),
      prisma.post.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } }),
    ]);
  }

  revalidatePath(path);
  redirect(path);
}

/* ------------------------------- 派主管理 -------------------------------- */

export async function reviewMemberAction(formData: FormData) {
  const factionId = String(formData.get("factionId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const path = `/factions/${slug}/manage?tab=members`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (!(await requireFactionManager(factionId, user.id))) {
    back(path, "error", "只有派主/副派主可以审批成员");
  }

  const member = await prisma.factionMember.findUnique({
    where: { id: memberId },
    include: { faction: true },
  });
  if (!member || member.factionId !== factionId) back(path, "error", "成员记录不存在");
  // decision 白名单：非法值直接报错，避免"非 approve 即 reject"的隐式语义
  if (decision !== "approve" && decision !== "reject") back(path, "error", "未知的审批操作");
  // 派主记录不可被审批，防止副派主把派主置 REMOVED 造成失权死锁
  if (member.role === "LEADER") back(path, "error", "不能审批派主记录");
  if (member.status !== "PENDING") back(path, "error", "该申请已被处理");
  
  if (decision === "approve") {
    // 条件更新（仅命中仍 PENDING 的行）+ 计数同事务：重复提交不会重复 increment
    const approved = await prisma.$transaction(async (tx) => {
      const updated = await tx.factionMember.updateMany({
        where: { id: memberId, status: "PENDING" },
        // (status, role) 原子迁移：批准即复位角色，被移出的副派主不能借重新申请复权（派主除外）
        data: {
          status: "ACTIVE",
          role: member.faction.leaderId === member.userId ? "LEADER" : "MEMBER",
        },
      });
      if (updated.count !== 1) return false;
      await tx.faction.update({
        where: { id: factionId },
        data: { memberCount: { increment: 1 } },
      });
      return true;
    });
    if (!approved) back(path, "error", "该申请已被处理");
    await notify({
      userId: member.userId,
      type: "POST",
      title: `你已加入「${member.faction.name}」`,
      body: "派主通过了你的加入申请，去和大家打个招呼吧。",
      link: `/factions/${slug}`,
    });
  } else {
    const rejected = await prisma.factionMember.updateMany({
      where: { id: memberId, status: "PENDING" },
      data: { status: "REMOVED" },
    });
    if (rejected.count !== 1) back(path, "error", "该申请已被处理");
    await notify({
      userId: member.userId,
      type: "POST",
      title: `「${member.faction.name}」的加入申请未通过`,
      body: "你可以看看其他兴趣派，或补充该公司的身份认证后再申请",
      link: "/discover",
    });
  }

  revalidatePath(path);
  back(path, "ok", decision === "approve" ? "已通过申请" : "已拒绝申请");
}

/* --------------------------- 成员列表查看权限 --------------------------- */

export async function requestMemberViewAction(formData: FormData) {
  const factionId = String(formData.get("factionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const path = `/factions/${slug}?tab=members`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);

  const faction = await prisma.faction.findUnique({ where: { id: factionId } });
  if (!faction) back("/discover", "error", "该派不存在");

  const membership = await membershipOf(factionId, user.id);
  const isManager = Boolean(
    membership && membership.status === "ACTIVE" && membership.role !== "MEMBER",
  );
  if (isManager) back(path, "error", "你是本派管理者，可直接查看成员列表");

  const existing = await prisma.memberViewRequest.findUnique({
    where: { factionId_userId: { factionId, userId: user.id } },
  });
  if (existing?.status === "APPROVED") back(path, "ok", "你已获得成员列表查看权限");
  if (existing?.status === "PENDING")
    back(path, "ok", `申请已提交，等待${faction.leaderId ? "派主" : "运营"}审核`);

  // 被拒后重新申请：复位为 PENDING 并清掉审核痕迹
  await prisma.memberViewRequest.upsert({
    where: { factionId_userId: { factionId, userId: user.id } },
    create: { factionId, userId: user.id, status: "PENDING" },
    update: { status: "PENDING", reviewedAt: null, reviewerId: null },
  });

  // 受理人与入派申请同口径：有派主通知派主；无派主通知运营代批
  if (faction.leaderId) {
    await notify({
      userId: faction.leaderId,
      type: "POST",
      title: `${user.nickname} 申请查看「${faction.name}」成员列表`,
      body: "审核通过后该用户可查看本派成员列表",
      link: `/factions/${faction.slug}/manage?tab=members`,
    });
  } else {
    const adminQueueLink = `/admin/joins?factionId=${faction.id}`;
    // 防止重复通知：先清除同一申请人+同一派的旧未读待代批通知
    await prisma.notification.deleteMany({
      where: {
        type: "SYSTEM",
        link: adminQueueLink,
        title: { contains: "成员列表查看申请待代批" },
        body: { contains: user.nickname },
        readAt: null,
      },
    });
    await notifyAdmins({
      type: "SYSTEM",
      title: `「${faction.name}」有成员列表查看申请待代批`,
      body: `该派暂无认证派主，${user.nickname} 的成员列表查看申请需运营审核`,
      link: adminQueueLink,
    });
  }

  revalidatePath(path);
  back(path, "ok", `已提交查看申请，等待${faction.leaderId ? "派主" : "运营"}审核`);
}

export async function reviewMemberViewAction(formData: FormData) {
  const factionId = String(formData.get("factionId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const path = `/factions/${slug}/manage?tab=members`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (!(await requireFactionManager(factionId, user.id))) {
    back(path, "error", "只有派主/副派主可以审核查看申请");
  }

  const request = await prisma.memberViewRequest.findUnique({
    where: { id: requestId },
    include: { faction: true },
  });
  if (!request || request.factionId !== factionId) back(path, "error", "查看申请不存在");
  // decision 白名单：与 reviewMemberAction 同口径
  if (decision !== "approve" && decision !== "reject") back(path, "error", "未知的审批操作");

  const updated = await prisma.memberViewRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: {
      status: decision === "approve" ? "APPROVED" : "REJECTED",
      reviewedAt: new Date(),
      reviewerId: user.id,
    },
  });
  if (updated.count !== 1) back(path, "error", "该申请已被处理");

  await notify({
    userId: request.userId,
    type: "POST",
    title:
      decision === "approve"
        ? `你已获准查看「${request.faction.name}」成员列表`
        : `「${request.faction.name}」成员列表查看申请未通过`,
    body:
      decision === "approve"
        ? "派主已通过你的查看申请，现在可以看到成员列表了。"
        : "你可以重新提交申请，或联系派主了解详情。",
    link: `/factions/${slug}?tab=members`,
  });

  revalidatePath(path);
  revalidatePath(`/factions/${slug}`);
  back(path, "ok", decision === "approve" ? "已通过查看申请" : "已拒绝查看申请");
}

export async function cancelMemberViewAction(formData: FormData) {
  const factionId = String(formData.get("factionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const path = `/factions/${slug}?tab=members`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);

  const updated = await prisma.memberViewRequest.updateMany({
    where: { factionId, userId: user.id, status: "PENDING" },
    data: { status: "REJECTED", reviewedAt: new Date() },
  });
  if (updated.count !== 1) back(path, "error", "没有可撤回的查看申请");

  revalidatePath(path);
  back(path, "ok", "已撤回成员列表查看申请");
}

export async function removeMemberAction(formData: FormData) {
  const factionId = String(formData.get("factionId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const path = `/factions/${slug}/manage?tab=members`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (!(await requireFactionManager(factionId, user.id))) {
    back(path, "error", "只有派主/副派主可以管理成员");
  }

  const member = await prisma.factionMember.findUnique({ where: { id: memberId } });
  if (!member || member.factionId !== factionId) back(path, "error", "成员记录不存在");
  if (member.userId === user.id) back(path, "error", "不能移出自己");
  if (member.role === "LEADER") back(path, "error", "不能移出派主");

  // 移出保留原 role（权限一律以 status ACTIVE 为前提，role 仅表达历史身份）：
  // 审批卡片可据此展示「曾任副派主」徽章；重新加入时由 joinFactionAction 复位 role（C2）；状态与计数同事务
  await prisma.$transaction(async (tx) => {
    await tx.factionMember.update({
      where: { id: memberId },
      data: { status: "REMOVED" },
    });
    if (member.status === "ACTIVE") {
      await tx.faction.update({
        where: { id: factionId },
        data: { memberCount: { decrement: 1 } },
      });
    }
  });

  revalidatePath(path);
  back(path, "ok", "已移出该成员");
}

export async function setMemberRoleAction(formData: FormData) {
  const factionId = String(formData.get("factionId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const role = String(formData.get("role") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const path = `/factions/${slug}/manage?tab=members`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);

  const faction = await prisma.faction.findUnique({ where: { id: factionId } });
  if (!faction) back(path, "error", "该派不存在");
  // 副派主任免只开放给派主本人，避免副派主互相提权
  if (faction.leaderId !== user.id) back(path, "error", "只有派主可以设置副派主");

  if (role !== "ADMIN" && role !== "MEMBER") back(path, "error", "角色参数不正确");

  const member = await prisma.factionMember.findUnique({ where: { id: memberId } });
  if (!member || member.factionId !== factionId) back(path, "error", "成员记录不存在");
  if (member.status !== "ACTIVE") back(path, "error", "该成员还未正式加入");
  if (member.role === "LEADER") back(path, "error", "派主角色不能调整");

  await prisma.factionMember.update({ where: { id: memberId }, data: { role } });
  await notify({
    userId: member.userId,
    type: "POST",
    title:
      role === "ADMIN"
        ? `你已成为「${faction.name}」的副派主`
        : `你在「${faction.name}」的副派主已被取消`,
    body:
      role === "ADMIN"
        ? "现在可以审批成员、管理帖子与发起活动了。"
        : "如有疑问可以联系派主。",
    link: role === "ADMIN" ? `/factions/${slug}/manage` : `/factions/${slug}`,
  });

  revalidatePath(path);
  back(path, "ok", role === "ADMIN" ? "已设为副派主" : "已取消副派主");
}

export async function transferLeaderAction(formData: FormData) {
  const factionId = String(formData.get("factionId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const path = `/factions/${slug}/manage?tab=settings`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);

  const faction = await prisma.faction.findUnique({ where: { id: factionId } });
  if (!faction) back(path, "error", "该派不存在");
  if (faction.leaderId !== user.id) back(path, "error", "只有派主本人可以转让派主");

  const target = await prisma.factionMember.findUnique({ where: { id: memberId } });
  if (!target || target.factionId !== factionId) back(path, "error", "成员记录不存在");
  if (target.userId === user.id) back(path, "error", "不能把自己设为接班人");
  if (target.status !== "ACTIVE") back(path, "error", "只能转让给正式成员");

  await prisma.$transaction([
    prisma.factionMember.update({ where: { id: target.id }, data: { role: "LEADER" } }),
    prisma.factionMember.updateMany({
      where: { factionId, userId: user.id },
      data: { role: "MEMBER" },
    }),
    prisma.faction.update({ where: { id: factionId }, data: { leaderId: target.userId } }),
  ]);

  await notify({
    userId: target.userId,
    type: "POST",
    title: `你现在是「${faction.name}」的派主`,
    body: `${user.nickname} 把派主转让给了你，去后台看看待办吧。`,
    link: `/factions/${slug}/manage`,
  });

  revalidatePath(`/factions/${slug}`);
  revalidatePath(path);
  back(path, "ok", "派主已转让");
}

export async function archiveFactionAction(formData: FormData) {
  const factionId = String(formData.get("factionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const path = `/factions/${slug}/manage?tab=settings`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);

  const faction = await prisma.faction.findUnique({
    where: { id: factionId },
    include: { members: { where: { status: "ACTIVE" } } },
  });
  if (!faction) back(path, "error", "该派不存在");
  if (faction.leaderId !== user.id) back(path, "error", "只有派主可以关闭本派");
  if (faction.status === "ARCHIVED") back(path, "error", "本派已经关闭");

  await prisma.faction.update({ where: { id: factionId }, data: { status: "ARCHIVED" } });
  await prisma.activity.updateMany({
    where: { factionId, status: "OPEN" },
    data: { status: "CANCELLED" },
  });

  const members = faction.members.filter((member) => member.userId !== user.id);
  if (members.length) {
    await prisma.notification.createMany({
      data: members.map((member) => ({
        userId: member.userId,
        type: "SYSTEM",
        title: `「${faction.name}」已由派主关闭`,
        body: "该派将不再接收新内容，感谢一路同行。",
        link: "/discover",
      })),
    });
  }

  revalidatePath("/");
  revalidatePath("/discover");
  back("/me", "ok", `「${faction.name}」已关闭`);
}

export async function moderatePostAction(formData: FormData) {
  const postId = String(formData.get("postId") ?? "");
  const action = String(formData.get("action") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const path = String(formData.get("redirectTo") ?? `/factions/${slug}/manage?tab=posts`);

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) back(path, "error", "帖子不存在");

  const isManager = await requireFactionManager(post.factionId, user.id);
  const isAuthor = post.authorId === user.id;
  if (!isManager && !isAuthor) back(path, "error", "没有权限操作该帖");

  if (action === "pin") {
    if (!isManager) back(path, "error", "只有派主可以置顶");
    await prisma.post.update({ where: { id: postId }, data: { pinned: !post.pinned } });
    back(path, "ok", post.pinned ? "已取消置顶" : "已置顶");
  }

  if (action === "announce") {
    // 公告与置顶同源：只对派主/副派主开放，让派主也能把成员帖升为公告（编辑框只能改自己发的帖）
    if (!isManager) back(path, "error", "只有派主可以设公告");
    const isAnnounce = post.kind === "ANNOUNCE";
    await prisma.post.update({
      where: { id: postId },
      data: { kind: isAnnounce ? "POST" : "ANNOUNCE" },
    });
    back(path, "ok", isAnnounce ? "已改为普通动态" : "已设为公告");
  }

  if (action === "hide") {
    if (!isManager) back(path, "error", "只有派主可以隐藏帖子");
    const hidden = post.status === "HIDDEN";
    await prisma.post.update({
      where: { id: postId },
      data: { status: hidden ? "PUBLISHED" : "HIDDEN" },
    });
    if (hidden) {
      await prisma.faction.update({
        where: { id: post.factionId },
        data: { postCount: { increment: 1 } },
      });
    } else {
      await prisma.faction.update({
        where: { id: post.factionId },
        data: { postCount: { decrement: 1 } },
      });
    }
    back(path, "ok", hidden ? "已恢复展示" : "已隐藏该帖");
  }

  if (action === "delete") {
    await prisma.post.update({ where: { id: postId }, data: { status: "DELETED" } });
    await prisma.faction.update({
      where: { id: post.factionId },
      data: { postCount: { decrement: 1 } },
    });
    revalidatePath(path);
    redirect(`/factions/${slug}`);
  }

  back(path, "error", "未知操作");
}

export async function updateFactionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const factionId = String(formData.get("factionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const path = `/factions/${slug}/manage?tab=settings`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (!(await requireFactionManager(factionId, user.id))) {
    return { error: "只有派主/副派主可以修改派资料" };
  }

  const name = String(formData.get("name") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const joinMode = String(formData.get("joinMode") ?? "OPEN");
  const allowCrossCompany = String(formData.get("allowCrossCompany") ?? "") === "true";

  if (name.length < 2) return { error: "派名至少 2 个字" };

  // 检测开关从开→关，需清理跨公司 PENDING 申请
  const prevFaction = await prisma.faction.findUnique({ where: { id: factionId } });
  const turnedOff = prevFaction?.allowCrossCompany === true && allowCrossCompany === false;

  await prisma.faction.update({
    where: { id: factionId },
    data: {
      name,
      tagline: tagline.slice(0, 40),
      description,
      joinMode: joinMode === "APPROVAL" ? "APPROVAL" : "OPEN",
      allowCrossCompany,
    },
  });

  if (turnedOff && prevFaction) {
    // 事务化清理跨公司 PENDING 申请（与运营后台通道共用同一实现，避免竞态致计数漂移）
    await revokeCrossCompanyPendingApplications(factionId, prevFaction.companyId, prevFaction.name);
  }

  revalidatePath(`/factions/${slug}`);
  revalidatePath(path);
  back(path, "ok", "派资料已更新");
}

/** 头像允许的 MIME：saveProofFile 的白名单含 PDF/HEIC，派主照片不接受 */
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
const AVATAR_MAX_SIZE = 3 * 1024 * 1024;

/**
 * 派主照片上传：写入 User.avatarImage（一人多派只传一次，各派展示位共用）。
 * 只有该派登记的派主本人能传——副派主进得来管理台，但展示位上的「派主」只有一个人。
 * 图片走 mediaCheckAsync 异步送检，命中 risky 由回调清空回落字母头像。
 */
export async function updateLeaderPhotoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const factionId = String(formData.get("factionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const path = `/factions/${slug}/manage?tab=settings`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);

  const faction = await prisma.faction.findUnique({ where: { id: factionId }, select: { leaderId: true } });
  if (!faction) return { error: "派不存在" };
  if (faction.leaderId !== user.id) {
    return { error: "只有本派派主可以上传派主照片" };
  }

  if (formData.get("action") === "remove") {
    await prisma.user.update({ where: { id: user.id }, data: { avatarImage: null } });
    revalidatePath("/discover");
    revalidatePath(`/factions/${slug}`);
    revalidatePath(path);
    back(path, "ok", "已移除派主照片");
  }

  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) return { error: "请选择要上传的照片" };
  if (!AVATAR_TYPES.includes(image.type)) return { error: "派主照片仅支持 JPG / PNG / WEBP 格式" };
  if (image.size > AVATAR_MAX_SIZE) return { error: "派主照片不能超过 3MB" };

  let imagePath: string | null;
  try {
    imagePath = await saveProofFile(image);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "照片上传失败" };
  }
  if (!imagePath) return { error: "照片上传失败，请重试" };

  await prisma.user.update({ where: { id: user.id }, data: { avatarImage: imagePath } });
  // scene 1 资料：异步送检，命中违规由回调清空，不阻塞上传
  await submitUserImageCheck(user.id, imagePath, { type: "AVATAR", id: user.id }, 1);

  revalidatePath("/discover");
  revalidatePath(`/factions/${slug}`);
  revalidatePath(path);
  back(path, "ok", "派主照片已更新");
}

/* ------------------------------- 活动 ------------------------------------ */

export async function createActivityAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const factionId = String(formData.get("factionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const path =
    String(formData.get("redirectTo") ?? "") || `/factions/${slug}?tab=activities`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);

  // 加入本派的成员都可以自发活动，派主负责兜底管理
  const membership = await membershipOf(factionId, user.id);
  if (!membership || membership.status !== "ACTIVE") {
    return { error: "加入本派后才能发起活动" };
  }
  // 置顶同帖子口径：只有派主/副派主勾了才生效
  const wantPinned = membership.role !== "MEMBER" && formData.get("pinned") === "1";

  const title = String(formData.get("title") ?? "").trim();
  // 活动说明升级为富文本：含标签则白名单净化入库，字数/送检按剥标签后的纯文本
  const rawDescription = String(formData.get("description") ?? "");
  const plainDescription = richTextToPlainText(rawDescription).trim();
  const description = looksRichText(rawDescription)
    ? sanitizeRichText(rawDescription)
    : rawDescription.trim();
  const location = String(formData.get("location") ?? "").trim();
  const startAtRaw = String(formData.get("startAt") ?? "");
  const capacity = parseCapacity(formData.get("capacity"), 20);

  if (title.length < 2) return { error: "请填写活动名称" };
  if (!location) return { error: "请填写活动地点" };
  const startAt = new Date(startAtRaw);
  if (Number.isNaN(startAt.getTime())) return { error: "请选择活动时间" };

  const textCheck = await checkUserText(user.id, `${title} ${plainDescription} ${location}`.trim(), 4);
  if (!textCheck.ok) return { error: "活动信息涉及违规内容，请调整后重新发布" };

  const faction = await prisma.faction.findUnique({ where: { id: factionId } });

  let imagePath: string | null = null;
  const image = formData.get("image");
  if (image instanceof File && image.size > 0) {
    try {
      imagePath = await saveProofFile(image);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "图片上传失败" };
    }
  }

  await prisma.activity.create({
    data: {
      factionId,
      creatorId: user.id,
      title,
      description,
      location,
      images: imagePath,
      startAt,
      capacity,
      pinned: wantPinned,
    },
  });

  const members = await prisma.factionMember.findMany({
    where: { factionId, status: "ACTIVE", userId: { not: user.id } },
    select: { userId: true },
  });
  if (members.length) {
    await prisma.notification.createMany({
      data: members.map((member) => ({
        userId: member.userId,
        type: "ACTIVITY",
        title: `${user.nickname} 在「${faction?.name ?? "本派"}」发起了活动：${title}`,
        body: `${location} · ${startAt.toLocaleString("zh-CN")}`,
        link: `/factions/${slug}?tab=activities`,
      })),
    });
  }

  revalidatePath(`/factions/${slug}`);
  back(path, "ok", "活动已发布并通知全派");
}

export async function signupActivityAction(formData: FormData) {
  const activityId = String(formData.get("activityId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  // 活动详情页会带上当前路径，操作后原地返回
  const path = String(formData.get("redirectTo") ?? "") || `/factions/${slug}?tab=activities`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);

  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) back(path, "error", "活动不存在");

  // 报名不要求入派，所以必须单独过阵营闸门，否则跨阵营能报上大厂活动并看到报名名单
  const signupAudience = await audienceOfUserOrAdmin(user);
  if (!(await canAccessFaction(activity.factionId, signupAudience, user.id))) {
    back(path, "error", "活动不存在");
  }

  if (activity.status !== "OPEN") back(path, "error", "活动已关闭");
  if (activity.startAt.getTime() < Date.now()) back(path, "error", "活动已经开始，无法报名");

  // 认证过的用户（在职或离职）无需加入派系即可直接参加活动；未认证先过认证
  const verifiedSignup = await prisma.employment.findFirst({
    where: { userId: user.id, status: "VERIFIED" },
    select: { id: true },
  });
  if (!verifiedSignup) {
    back(path, "error", "完成公司身份认证后即可参加活动");
  }

  const existing = await prisma.activitySignup.findUnique({
    where: { activityId_userId: { activityId, userId: user.id } },
  });

  if (existing?.status === "GOING") {
    await prisma.activitySignup.update({
      where: { id: existing.id },
      data: { status: "CANCELLED" },
    });
    await prisma.activity.update({
      where: { id: activityId },
      data: { signupCount: { decrement: 1 } },
    });
    // 退出报名同步退出该活动已拉起的群聊
    await syncGroupMembership(activityId, user.id, false);
    revalidatePath(path);
    back(path, "ok", "已取消报名");
  }

  // capacity=0 表示不限人数，不参与满员拦截
  if (activity.capacity > 0 && activity.signupCount >= activity.capacity) back(path, "error", "名额已满");

  await prisma.activitySignup.upsert({
    where: { activityId_userId: { activityId, userId: user.id } },
    create: { activityId, userId: user.id, status: "GOING" },
    update: { status: "GOING" },
  });
  await prisma.activity.update({
    where: { id: activityId },
    data: { signupCount: { increment: 1 } },
  });
  // 若群聊已由发起人拉起，重新报名自动回到群里
  await syncGroupMembership(activityId, user.id, true);

  revalidatePath(path);
  back(path, "ok", "报名成功，活动见");
}

export async function updateActivityAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const activityId = String(formData.get("activityId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const path =
    String(formData.get("redirectTo") ?? "") || `/factions/${slug}?tab=activities`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);

  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) return { error: "活动不存在" };
  // 编辑内容收紧为仅发起人：派主/副派主只能取消与开关报名，不能修改他人发布的活动文案
  if (activity.creatorId !== user.id) {
    return { error: "只能修改自己发起的活动" };
  }
  // 置顶是派主/副派主的治理权：发起人恰好是本派派主时编辑框才带该勾选框，
  // 普通成员改活动不能顺带把派主设的置顶清掉（故非派主时完全不提交 pinned）
  const manager = await requireFactionManager(activity.factionId, user.id);

  const title = String(formData.get("title") ?? "").trim();
  // 活动说明与发起同源：富文本净化入库，送检按剥标签纯文本
  const rawDescription = String(formData.get("description") ?? "");
  const plainDescription = richTextToPlainText(rawDescription).trim();
  const description = looksRichText(rawDescription)
    ? sanitizeRichText(rawDescription)
    : rawDescription.trim();
  const location = String(formData.get("location") ?? "").trim();
  const startAtRaw = String(formData.get("startAt") ?? "");
  const capacity = parseCapacity(formData.get("capacity"), activity.capacity);

  if (title.length < 2) return { error: "请填写活动名称" };
  if (!location) return { error: "请填写活动地点" };
  const startAt = new Date(startAtRaw);
  if (Number.isNaN(startAt.getTime())) return { error: "请选择活动时间" };

  const nextCapacity = capacity;
  if (nextCapacity > 0 && nextCapacity < activity.signupCount) {
    return { error: `已有 ${activity.signupCount} 人报名，名额不能小于该人数` };
  }

  const textCheck = await checkUserText(user.id, `${title} ${plainDescription} ${location}`.trim(), 4);
  if (!textCheck.ok) return { error: "活动信息涉及违规内容，请调整后重新保存" };

  let imagePath: string | undefined;
  const image = formData.get("image");
  if (image instanceof File && image.size > 0) {
    try {
      imagePath = (await saveProofFile(image)) ?? undefined;
    } catch (error) {
      return { error: error instanceof Error ? error.message : "图片上传失败" };
    }
  }

  await prisma.activity.update({
    where: { id: activityId },
    data: {
      title,
      description,
      location,
      startAt,
      capacity: nextCapacity,
      ...(manager ? { pinned: formData.get("pinned") === "1" } : {}),
      ...(imagePath !== undefined ? { images: imagePath } : {}),
    },
  });

  revalidatePath(`/factions/${slug}`);
  revalidatePath(`/factions/${slug}/activities/${activityId}`);
  back(path, "ok", "活动信息已更新");
}

export async function deleteActivityAction(formData: FormData) {
  const activityId = String(formData.get("activityId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const path =
    String(formData.get("redirectTo") ?? "") || `/factions/${slug}?tab=activities`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);

  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: { faction: true, signups: { where: { status: "GOING" } } },
  });
  if (!activity) back(path, "error", "活动不存在");
  if (!(await canManageActivity(activity, user.id))) {
    back(path, "error", "只能管理自己发起的活动");
  }

  await prisma.activity.update({
    where: { id: activityId },
    data: { status: "CANCELLED", signupCount: 0 },
  });
  await prisma.activitySignup.updateMany({
    where: { activityId, status: "GOING" },
    data: { status: "CANCELLED" },
  });

  const attendees = activity.signups.filter((signup) => signup.userId !== user.id);
  if (attendees.length) {
    await prisma.notification.createMany({
      data: attendees.map((signup) => ({
        userId: signup.userId,
        type: "ACTIVITY",
        title: `「${activity.faction.name}」的活动已取消：${activity.title}`,
        body: "活动已取消，报名自动作废，如有疑问可联系发起人或派主。",
        link: `/factions/${slug}/activities/${activityId}`,
      })),
    });
  }

  revalidatePath(`/factions/${slug}`);
  back(path, "ok", "活动已取消并通知报名成员");
}

/** 派主/副派主在管理台切换活动置顶 */
export async function toggleActivityPinAction(formData: FormData) {
  const activityId = String(formData.get("activityId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const path =
    String(formData.get("redirectTo") ?? "") || `/factions/${slug}/manage?tab=activities`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);

  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) back(path, "error", "活动不存在");
  if (!(await requireFactionManager(activity.factionId, user.id))) {
    back(path, "error", "只有派主可以置顶活动");
  }

  await prisma.activity.update({
    where: { id: activityId },
    data: { pinned: !activity.pinned },
  });

  revalidatePath(`/factions/${slug}`);
  revalidatePath("/");
  back(path, "ok", activity.pinned ? "已取消置顶" : "已置顶该活动");
}

export async function closeActivityAction(formData: FormData) {
  const activityId = String(formData.get("activityId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const path =
    String(formData.get("redirectTo") ?? "") || `/factions/${slug}?tab=activities`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);

  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) back(path, "error", "活动不存在");
  if (!(await canManageActivity(activity, user.id))) {
    back(path, "error", "只能管理自己发起的活动");
  }

  await prisma.activity.update({
    where: { id: activityId },
    data: { status: activity.status === "OPEN" ? "CLOSED" : "OPEN" },
  });

  revalidatePath(path);
  back(path, "ok", activity.status === "OPEN" ? "已关闭报名" : "已重新开放报名");
}

/* ------------------------------- 创建派 / 派主认证 ------------------------ */

const createFactionSchema = z.object({
  companyId: z.string().min(1, "请选择公司"),
  category: z.string().refine((value) => value in CATEGORIES, "请选择兴趣分类"),
  name: z.string().min(2, "派名至少 2 个字").max(16, "派名最多 16 个字"),
  tagline: z.string().min(2, "一句话介绍帮你拉人").max(40, "介绍最多 40 字"),
  description: z.string().min(10, "详细介绍至少 10 个字").max(1000, "介绍最多 1000 字"),
  allowCrossCompany: z.enum(["true", "false"]).transform((v) => v === "true").default("false"),
});

export async function createFactionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  const parsed = createFactionSchema.safeParse({
    companyId: String(formData.get("companyId") ?? ""),
    category: String(formData.get("category") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
    tagline: String(formData.get("tagline") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    allowCrossCompany: String(formData.get("allowCrossCompany") ?? "false") || "false",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { error: parsed.error.issues[0]?.message ?? "请检查填写内容", fieldErrors };
  }

  const { companyId, category, name, tagline, description, allowCrossCompany } = parsed.data;
  const employment = await verifiedEmploymentAt(user.id, companyId);
  if (!employment) return { error: "请先完成该公司的身份认证" };

  const textCheck = await checkUserText(user.id, `${name} ${tagline} ${description}`.trim(), 4);
  if (!textCheck.ok) return { error: "派名称或简介涉及违规信息，请调整后重新提交" };

  const meta = CATEGORIES[category as CategoryKey];
  const slug = `${category.toLowerCase()}-${shortId(6)}`;

  // 新建派默认可见人群跟所属公司的阵营：外部认证用户建的派只对非大厂开放，
  // 12 家大厂建的派保持只勾大厂（需要对外开放时由运营在后台改）
  const createdByCorp = (employment.company.scope ?? "CORP") === "CORP";

  const faction = await prisma.faction.create({
    data: {
      name,
      slug,
      companyId,
      category,
      emoji: meta.emoji,
      tagline,
      description,
      allowCrossCompany,
      visibleToCorp: createdByCorp,
      visibleToOutsider: !createdByCorp,
      status: "REVIEWING",
      leaderId: null,
      // 创建者紧接着会被建为 ACTIVE 成员，成员数同属初始状态一并写入，避免新建派 memberCount=0 的计数漂移
      memberCount: 1,
    },
  });

  await prisma.factionMember.create({
    data: { factionId: faction.id, userId: user.id, role: "MEMBER", status: "ACTIVE" },
  });

  await prisma.leaderApplication.create({
    data: {
      factionId: faction.id,
      userId: user.id,
      requestedRole: "LEADER",
      reason: `新建「${name}」并申请成为派主`,
      plan: description,
    },
  });

  await notifyAdmins({
    type: "LEADER",
    title: `新的派筹备申请：${name}（${employment.company.shortName}）`,
    body: `${user.nickname} 申请创建${meta.label}并担任派主`,
    link: "/admin/leaders",
  });

  redirect(`/factions/${slug}?ok=${encodeURIComponent("申请已提交，运营审核通过后即可开派")}`);
}

export async function applyLeaderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  const factionId = String(formData.get("factionId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const plan = String(formData.get("plan") ?? "").trim();
  const experience = String(formData.get("experience") ?? "").trim();
  const proofImage = formData.get("proofImage");
  const rawRole = String(formData.get("requestedRole") ?? "").trim();

  if (reason.length < 5) return { error: "请说明你为什么要担任这个角色（至少 5 个字）" };
  if (plan.length < 10) return { error: "请写下你的运营计划（至少 10 个字）" };

  const faction = await prisma.faction.findUnique({
    where: { id: factionId },
    include: { company: true },
  });
  if (!faction) return { error: "该派不存在" };
  if (faction.status !== "ACTIVE") return { error: "该派还在筹备审核中" };

  // 认证门槛为「任一公司已认证」：限定派的公司限制由下面的成员校验兜底把关
  const verified = await prisma.employment.findFirst({
    where: { userId: user.id, status: "VERIFIED" },
  });
  if (!verified) return { error: "请先完成身份认证" };

  const membership = await membershipOf(factionId, user.id);
  if (!membership || membership.status !== "ACTIVE") {
    return { error: "先加入本派，再申请派主认证" };
  }
  if (membership.role !== "MEMBER") {
    return { error: "你已是本派管理者，无需重复申请" };
  }

  // 申请角色由表单指定，缺省时按空缺情况回退；仅允许 LEADER / ADMIN
  const requestedRole: "LEADER" | "ADMIN" =
    rawRole === "LEADER" || rawRole === "ADMIN" ? rawRole : faction.leaderId ? "ADMIN" : "LEADER";

  // 岗位空缺校验：派主仅无派主时开放，副派主仅已有派主且暂无副派主时开放
  if (requestedRole === "LEADER" && faction.leaderId) {
    return { error: "该派已有派主，可申请副派主" };
  }
  if (requestedRole === "ADMIN") {
    if (!faction.leaderId) return { error: "该派暂无派主，请先申请派主" };
    const existingVice = await prisma.factionMember.count({
      where: { factionId, status: "ACTIVE", role: "ADMIN" },
    });
    if (existingVice > 0) return { error: "该派已有副派主，暂不开放申请" };
  }

  const pending = await prisma.leaderApplication.findFirst({
    where: { factionId, userId: user.id, status: "PENDING" },
  });
  if (pending) return { error: "你已提交申请，正在等待运营审核" };

  const textCheck = await checkUserText(user.id, `${reason} ${plan} ${experience}`.trim(), 4);
  if (!textCheck.ok) return { error: "申请内容涉及违规信息，请调整后重新提交" };

  // 过往带队截图选填：上传失败不阻断申请，但会提示重新提交
  let proofImagePath: string | null = null;
  if (proofImage instanceof File && proofImage.size > 0) {
    try {
      proofImagePath = await saveProofFile(proofImage);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "截图上传失败" };
    }
  }

  await prisma.leaderApplication.create({
    data: { factionId, userId: user.id, requestedRole, reason, plan, experience, proofImage: proofImagePath },
  });

  await notifyAdmins({
    type: "LEADER",
    title: `派主认证申请：${faction.name} · ${user.nickname}`,
    body: `${requestedRole === "LEADER" ? "申请派主" : "申请副派主"}｜${reason.slice(0, 40)}`,
    link: "/admin/leaders",
  });

  revalidatePath(`/factions/${faction.slug}`);

  return { ok: true, message: "申请已提交，运营会在 1-3 个工作日内给出结果" };
}
