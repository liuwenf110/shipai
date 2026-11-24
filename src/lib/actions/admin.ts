"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { revokeCrossCompanyPendingApplications } from "@/lib/membership";
import { factionScopeLabel, companyScope, identityScopeConflict } from "@/lib/scope";
import { CATEGORIES, type CategoryKey } from "@/lib/constants";
import { SITE_FLAGS, setLeaderWallHidden, setSiteFlag, type SiteFlagKey } from "@/lib/settings";
import { checkUserText, submitUserImageCheck } from "@/lib/sec";
import { saveProofFile } from "@/lib/upload";
import { parseCapacity } from "@/lib/utils";
import type { ActionState } from "@/lib/types";

async function audit(actorId: string, action: string, targetType: string, targetId: string, note?: string) {
  await prisma.auditLog.create({
    data: { actorId, action, targetType, targetId, note },
  });
}

function back(path: string, key: "ok" | "error", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${key}=${encodeURIComponent(message)}`);
}

/** 审核在职/离职/非大厂身份认证 */
export async function reviewEmploymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const employmentId = String(formData.get("employmentId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const path = "/admin/verifications";

  const employment = await prisma.employment.findUnique({
    where: { id: employmentId },
    include: { user: true, company: true },
  });
  if (!employment) return { error: "认证记录不存在" };
  if (employment.status === "VERIFIED") return { error: "该记录已通过审核" };

  // 非大厂记录对外只报用户自报的公司名，不展示系统占位行名称
  const companyLabel =
    companyScope(employment.company) === "OUTSIDER"
      ? (employment.employerName ?? employment.company.name)
      : employment.company.name;

  if (decision === "approve") {
    // 两侧同时通过会让人群口径只认大厂、非大厂那半边隔离失效，放行前再兜一次互斥校验
    const conflict = await identityScopeConflict(employment.userId, companyScope(employment.company));
    if (conflict) return { error: conflict };

    await prisma.employment.update({
      where: { id: employmentId },
      data: {
        status: "VERIFIED",
        reviewerId: admin.id,
        reviewerNote: note || "材料属实，审核通过",
        reviewedAt: new Date(),
        verifiedAt: new Date(),
      },
    });
    await prisma.company.update({
      where: { id: employment.companyId },
      data: { verifiedCount: { increment: 1 } },
    });
    await notify({
      userId: employment.userId,
      type: "VERIFY",
      title: `${companyLabel} ${employment.kind === "ALUMNI" ? "离职" : "在职"}身份审核通过`,
      body: "欢迎回来，去看看同厂的兴趣派吧。",
      link: "/discover",
    });
    await audit(admin.id, "APPROVE_EMPLOYMENT", "Employment", employmentId, note);
    revalidatePath(path);
    revalidatePath("/discover");
    back(path, "ok", `已通过 ${employment.user.nickname} 的 ${companyLabel} 身份认证`);
  }

  await prisma.employment.update({
    where: { id: employmentId },
    data: {
      status: "REJECTED",
      reviewerId: admin.id,
      reviewerNote: note || "材料无法证明身份，请补充更清晰的证明材料",
      reviewedAt: new Date(),
    },
  });
  await notify({
    userId: employment.userId,
    type: "VERIFY",
    title: `${companyLabel} 身份认证未通过`,
    body: note || "请补充更清晰的证明材料后重新提交。",
    link: "/verify",
  });
  await audit(admin.id, "REJECT_EMPLOYMENT", "Employment", employmentId, note);
  revalidatePath(path);
  back(path, "ok", "已驳回该认证申请");
}

/** 审核派主认证 / 筹备中的新派 */
export async function reviewLeaderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const applicationId = String(formData.get("applicationId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const path = "/admin/leaders";

  const application = await prisma.leaderApplication.findUnique({
    where: { id: applicationId },
    include: { faction: { include: { company: true } }, user: true },
  });
  if (!application) return { error: "申请不存在" };
  if (application.status !== "PENDING") return { error: "该申请已处理" };

  if (decision === "approve") {
    const isLeader = application.requestedRole === "LEADER";

    // 岗位空缺校验：派主不可覆盖已有派主；副派主必须在已有派主时才能任命
    if (isLeader && application.faction.leaderId && application.faction.leaderId !== application.userId) {
      return { error: "该派已有派主，请先在派详情中调整派主后再通过" };
    }
    if (!isLeader && !application.faction.leaderId) {
      return { error: "该派暂无派主，无法任命副派主" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.leaderApplication.update({
        where: { id: applicationId },
        data: {
          status: "APPROVED",
          reviewerId: admin.id,
          reviewerNote: note || "资质符合要求，认证通过",
          reviewedAt: new Date(),
        },
      });

      // 审核通过即自动入派：先查现有成员行，判定本次是否把一名非 ACTIVE 用户（含从无到有）激活
      const existing = await tx.factionMember.findUnique({
        where: {
          factionId_userId: {
            factionId: application.factionId,
            userId: application.userId,
          },
        },
        select: { status: true },
      });
      const becomesActiveMember = existing?.status !== "ACTIVE";

      await tx.factionMember.upsert({
        where: {
          factionId_userId: {
            factionId: application.factionId,
            userId: application.userId,
          },
        },
        create: {
          factionId: application.factionId,
          userId: application.userId,
          role: application.requestedRole,
          status: "ACTIVE",
          appliedAt: null,
        },
        update: { role: application.requestedRole, status: "ACTIVE", appliedAt: null },
      });

      // 新增/激活的正式成员必须同步冗余计数，否则前端成员数与派主列表会与真实不符
      if (becomesActiveMember) {
        await tx.faction.update({
          where: { id: application.factionId },
          data: { memberCount: { increment: 1 } },
        });
      }

      if (isLeader) {
        await tx.faction.update({
          where: { id: application.factionId },
          data: { leaderId: application.userId, status: "ACTIVE" },
        });
        // 同一个派其他待审的派主申请自动关闭
        await tx.leaderApplication.updateMany({
          where: {
            factionId: application.factionId,
            status: "PENDING",
            requestedRole: "LEADER",
            id: { not: applicationId },
          },
          data: {
            status: "REJECTED",
            reviewerNote: "该派已有认证派主",
            reviewedAt: new Date(),
            reviewerId: admin.id,
          },
        });
      }
    });

    await notify({
      userId: application.userId,
      type: "LEADER",
      title: isLeader
        ? `你已成为「${application.faction.name}」派主`
        : `你已成为「${application.faction.name}」副派主`,
      body: "现在可以管理派内成员、活动与内容了。",
      link: `/factions/${application.faction.slug}/manage`,
    });

    await audit(admin.id, "APPROVE_LEADER", "LeaderApplication", applicationId, `${application.user.nickname}→${application.faction.name}${note ? " · " + note : ""}`);
    revalidatePath(path);
    revalidatePath("/discover");
    back(path, "ok", `已通过 ${application.user.nickname} 的${isLeader ? "派主" : "副派主"}申请`);
  }

  const rejectCreation =
    application.requestedRole === "LEADER" &&
    application.faction.status === "REVIEWING" &&
    !application.faction.leaderId;

  await prisma.$transaction(async (tx) => {
    await tx.leaderApplication.update({
      where: { id: applicationId },
      data: {
        status: "REJECTED",
        reviewerId: admin.id,
        reviewerNote: note || "运营计划不充分，可完善后重新申请",
        reviewedAt: new Date(),
      },
    });
    if (rejectCreation) {
      await tx.faction.update({
        where: { id: application.factionId },
        data: { status: "ARCHIVED" },
      });
    }
  });

  await notify({
    userId: application.userId,
    type: "LEADER",
    title: rejectCreation
      ? `「${application.faction.name}」筹备申请未通过`
      : `「${application.faction.name}」${application.requestedRole === "LEADER" ? "派主" : "副派主"}申请未通过`,
    body:
      note ||
      (rejectCreation
        ? "可完善运营计划后再次提交。"
        : "可完善运营计划后再次提交，你仍保留本派普通成员身份。"),
    link: rejectCreation ? "/discover" : `/factions/${application.faction.slug}`,
  });

  await audit(admin.id, "REJECT_LEADER", "LeaderApplication", applicationId, `${application.user.nickname}→${application.faction.name}${note ? " · " + note : ""}`);
  revalidatePath(path);
  back(path, "ok", "已驳回该申请");
}

/** 运营直接调整派的状态 */
export async function setFactionStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const factionId = String(formData.get("factionId") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!["REVIEWING", "ACTIVE", "ARCHIVED"].includes(status)) {
    back("/admin/factions", "error", "未知状态");
  }

  const faction = await prisma.faction.findUnique({ where: { id: factionId } });
  if (!faction) back("/admin/factions", "error", "该派不存在");

  await prisma.faction.update({ where: { id: factionId }, data: { status } });
  await audit(admin.id, "SET_FACTION_STATUS", "Faction", factionId, status);

  revalidatePath("/admin/factions");
  revalidatePath("/discover");
  back("/admin/factions", "ok", `「${faction.name}」状态已更新为 ${status}`);
}

/**
 * 前台展示开关：后台关掉哪个栏目，前台就不渲染哪个（当前只有派主墙）。
 * key 只认 SITE_FLAGS 白名单，前端伪造其他值一律拒；变更后重验发现页与后台页。
 */
export async function setSiteFlagAction(formData: FormData) {
  const admin = await requireAdmin();
  const key = String(formData.get("key") ?? "");
  const on = String(formData.get("value") ?? "") === "1";
  // 回跳页只允许两个已知后台路径，避免开放重定向
  const returnTo = String(formData.get("returnTo") ?? "") === "wall" ? "/admin/leader-wall" : "/admin";

  const allowed = Object.values(SITE_FLAGS) as string[];
  if (!allowed.includes(key)) back(returnTo, "error", "未知的展示开关");

  await setSiteFlag(key as SiteFlagKey, on);
  await audit(admin.id, "SET_SITE_FLAG", "SiteSetting", key, on ? "展示" : "隐藏");

  revalidatePath("/admin");
  revalidatePath("/admin/leader-wall");
  revalidatePath("/discover");
  back(returnTo, "ok", on ? "已开启前台展示" : "已关闭前台展示");
}

/**
 * 派主墙条目编辑（仅供运营）：一次表单同时写派主照片/昵称/简介（User）与派宣传语/展示位置（Faction），
 * 并维护该派是否上墙。校验口径与用户自己改资料、派主自己传照片保持同源，避免两个入口宽严不一。
 */
export async function saveLeaderWallEntryAction(formData: FormData) {
  const admin = await requireAdmin();
  const factionId = String(formData.get("factionId") ?? "");
  const path = "/admin/leader-wall";

  const faction = await prisma.faction.findUnique({
    where: { id: factionId },
    include: { leader: { select: { id: true, nickname: true } } },
  });
  if (!faction) back(path, "error", "该派不存在");
  if (!faction.leader) back(path, "error", "该派暂无派主，无需上墙信息");
  const leader = faction.leader;

  // 只移除照片：单独一个轻表单，不连带提交其他字段
  if (formData.get("action") === "removePhoto") {
    await prisma.user.update({ where: { id: leader.id }, data: { avatarImage: null } });
    await audit(admin.id, "REMOVE_LEADER_PHOTO", "Faction", faction.id, `${faction.name}｜${leader.nickname}`);
    revalidatePath(path);
    revalidatePath("/discover");
    revalidatePath(`/factions/${faction.slug}`);
    revalidatePath(`/users/${leader.id}`);
    back(path, "ok", "已移除派主照片");
  }

  const nickname = String(formData.get("nickname") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim();
  const hidden = String(formData.get("hidden") ?? "") === "1";
  const sortOrderRaw = String(formData.get("sortOrder") ?? "").trim();

  if (nickname.length < 2 || nickname.length > 32) back(path, "error", "昵称需 2-32 个字符");
  if (bio.length > 60) back(path, "error", "派主简介最多 60 个字符");
  if (tagline.length > 40) back(path, "error", "派宣传语最多 40 个字符");

  const taken = await prisma.user.findFirst({
    where: { nickname, id: { not: leader.id } },
    select: { id: true },
  });
  if (taken) back(path, "error", "这个昵称已经被占用了，换一个试试");

  const textCheck = await checkUserText(leader.id, `${nickname} ${bio}`.trim(), 1);
  if (!textCheck.ok) back(path, "error", "昵称或简介涉及违规信息，请调整后重新保存");

  // 展示位置权重：空值 / 非数字视为沿用当前值，越界归一到 0-9999（与派资料编辑同一口径）
  const parsedSortOrder = Number(sortOrderRaw);
  const sortOrder =
    sortOrderRaw === "" || !Number.isFinite(parsedSortOrder)
      ? faction.sortOrder
      : Math.max(0, Math.min(9999, Math.trunc(parsedSortOrder)));

  // 照片可选：不选就不动旧图；选了就落盘并异步送检（命中违规由回调清空）
  const image = formData.get("image");
  let imagePath: string | null = null;
  if (image instanceof File && image.size > 0) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
      back(path, "error", "派主照片仅支持 JPG / PNG / WEBP 格式");
    }
    if (image.size > 3 * 1024 * 1024) back(path, "error", "派主照片不能超过 3MB");
    imagePath = await saveProofFile(image);
    if (!imagePath) back(path, "error", "照片保存失败，请重试");
    await submitUserImageCheck(leader.id, imagePath, { type: "AVATAR", id: leader.id }, 1);
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: leader.id },
      data: { nickname, bio, ...(imagePath ? { avatarImage: imagePath } : {}) },
    }),
    prisma.faction.update({ where: { id: faction.id }, data: { tagline, sortOrder } }),
  ]);
  await setLeaderWallHidden(faction.id, hidden);

  await audit(
    admin.id,
    "UPDATE_LEADER_WALL",
    "Faction",
    faction.id,
    `${faction.name}｜${nickname}${imagePath ? "｜换照片" : ""}｜${hidden ? "不上墙" : "上墙"}`,
  );

  revalidatePath(path);
  revalidatePath("/admin/factions");
  revalidatePath("/discover");
  revalidatePath(`/factions/${faction.slug}`);
  revalidatePath(`/users/${leader.id}`);
  back(path, "ok", `已保存「${faction.name}」的派主墙信息`);
}

/** 运营内容治理：隐藏 / 恢复 / 删除 */
export async function adminModeratePostAction(formData: FormData) {
  const admin = await requireAdmin();
  const postId = String(formData.get("postId") ?? "");
  const action = String(formData.get("action") ?? "");

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) back("/admin/posts", "error", "帖子不存在");

  if (action === "hide" || action === "restore") {
    const hidden = action === "hide";
    await prisma.post.update({
      where: { id: postId },
      data: { status: hidden ? "HIDDEN" : "PUBLISHED" },
    });
    await prisma.faction.update({
      where: { id: post.factionId },
      data: { postCount: { increment: hidden ? -1 : 1 } },
    });
  } else if (action === "delete") {
    await prisma.post.update({ where: { id: postId }, data: { status: "DELETED" } });
    if (post.status === "PUBLISHED") {
      await prisma.faction.update({
        where: { id: post.factionId },
        data: { postCount: { decrement: 1 } },
      });
    }
  } else if (action === "recruit_on" || action === "recruit_off") {
    // 首页公开招募的平台侧同步开关：运营可直接把帖推入/移出首页招募流
    await prisma.post.update({ where: { id: postId }, data: { recruit: action === "recruit_on" } });
  } else {
    back("/admin/posts", "error", "未知操作");
  }

  await audit(admin.id, `MODERATE_POST_${action.toUpperCase()}`, "Post", postId);
  revalidatePath("/admin/posts");
  revalidatePath("/");
  revalidatePath(`/factions`);
  back("/admin/posts", "ok", action.startsWith("recruit_") ? "首页招募状态已更新" : "内容状态已更新");
}

/** 用户管理：禁用 / 启用 / 设为运营 / 取消运营 / 强制下线 */
export async function adminUpdateUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const action = String(formData.get("action") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "/admin/users");

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "用户不存在" };

  if (action === "disable") {
    if (target.id === admin.id) return { error: "不能禁用自己" };
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { status: "DISABLED", disabledReason: reason || "违反社区规范" },
      }),
      prisma.session.deleteMany({ where: { userId } }),
    ]);
    await notify({
      userId,
      type: "SYSTEM",
      title: "账号已被禁用",
      body: reason || "如有疑问请联系平台运营。",
    });
    await audit(admin.id, "DISABLE_USER", "User", userId, reason);
  } else if (action === "enable") {
    await prisma.user.update({
      where: { id: userId },
      data: { status: "ACTIVE", disabledReason: null },
    });
    await notify({ userId, type: "SYSTEM", title: "账号已恢复正常", body: "现在可以正常登录了。" });
    await audit(admin.id, "ENABLE_USER", "User", userId);
  } else if (action === "promote" || action === "demote") {
    if (target.id === admin.id) return { error: "不能修改自己的运营身份" };
    if (action === "demote") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) return { error: "至少需要保留一位运营" };
    }
    await prisma.user.update({
      where: { id: userId },
      data: { role: action === "promote" ? "ADMIN" : "USER" },
    });
    await audit(admin.id, action === "promote" ? "PROMOTE_USER" : "DEMOTE_USER", "User", userId);
  } else if (action === "kick") {
    await prisma.session.deleteMany({ where: { userId } });
    await audit(admin.id, "KICK_SESSIONS", "User", userId);
  } else {
    return { error: "未知操作" };
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/users/" + userId);
  back(redirectTo, "ok", "用户状态已更新");
}

/** 评论治理：隐藏 / 恢复 / 删除 */
export async function adminModerateCommentAction(formData: FormData) {
  const admin = await requireAdmin();
  const commentId = String(formData.get("commentId") ?? "");
  const action = String(formData.get("action") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/admin/comments");

  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) back(redirectTo, "error", "评论不存在");

  if (action === "hide" || action === "restore") {
    await prisma.comment.update({
      where: { id: commentId },
      data: { status: action === "hide" ? "HIDDEN" : "PUBLISHED" },
    });
  } else if (action === "delete") {
    await prisma.comment.delete({ where: { id: commentId } });
    if (comment.status === "PUBLISHED") {
      await prisma.post.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: 1 } },
      });
    }
  } else {
    back(redirectTo, "error", "未知操作");
  }

  await audit(admin.id, `MODERATE_COMMENT_${action.toUpperCase()}`, "Comment", commentId);
  revalidatePath("/admin/comments");
  revalidatePath(`/posts/${comment.postId}`);
  back(redirectTo, "ok", "评论状态已更新");
}

/** 活动治理：关闭 / 恢复报名 / 删除 */
export async function adminUpdateActivityAction(formData: FormData) {
  const admin = await requireAdmin();
  const activityId = String(formData.get("activityId") ?? "");
  const action = String(formData.get("action") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/admin/activities");

  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) back(redirectTo, "error", "活动不存在");

  if (action === "close" || action === "reopen") {
    await prisma.activity.update({
      where: { id: activityId },
      data: { status: action === "close" ? "CLOSED" : "OPEN" },
    });
  } else if (action === "delete") {
    await prisma.activity.delete({ where: { id: activityId } });
  } else {
    back(redirectTo, "error", "未知操作");
  }

  await audit(admin.id, `ACTIVITY_${action.toUpperCase()}`, "Activity", activityId);
  revalidatePath("/admin/activities");
  back(redirectTo, "ok", "活动状态已更新");
}

/** 兴趣派资料编辑（仅供运营） */
export async function adminUpdateFactionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const factionId = String(formData.get("factionId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const joinMode = String(formData.get("joinMode") ?? "").trim();
  const allowCrossCompany = String(formData.get("allowCrossCompany") ?? "") === "true";
  const visibleToCorp = String(formData.get("visibleToCorp") ?? "") === "true";
  const visibleToOutsider = String(formData.get("visibleToOutsider") ?? "") === "true";
  const sortOrderRaw = String(formData.get("sortOrder") ?? "").trim();
  const redirectTo = `/admin/factions/${factionId}`;

  const faction = await prisma.faction.findUnique({ where: { id: factionId } });
  if (!faction) return { error: "该派不存在" };
  if (name.length < 2) return { error: "派名至少 2 个字" };
  if (!(category in CATEGORIES)) return { error: "兴趣分类不合法" };
  if (!["OPEN", "APPROVAL"].includes(joinMode)) return { error: "加入方式不合法" };
  // 两枚都不勾 = 谁也看不到的死派，直接拦下（隔离口径见 src/lib/scope.ts）
  if (!visibleToCorp && !visibleToOutsider) return { error: "可见人群至少勾选一项" };

  // 展示位置权重：空值 / 非数字视为“不修改”，越界归一到 0–9999
  const parsedSortOrder = Number(sortOrderRaw);
  const sortOrder =
    sortOrderRaw === "" || !Number.isFinite(parsedSortOrder)
      ? faction.sortOrder
      : Math.max(0, Math.min(9999, Math.trunc(parsedSortOrder)));

  const turnedOff = faction.allowCrossCompany === true && allowCrossCompany === false;

  // 分类变更时按新分类元数据同步 emoji（Faction.emoji 是建派时持久化的字段，
  // 不同步会导致前台派页 / 发现页卡片 / 后台头部继续显示旧分类图标）；
  // 未变更时不重写，保留运营 / 种子数据中刻意个性化的 emoji
  const categoryChanged = faction.category !== category;
  const nextMeta = CATEGORIES[category as CategoryKey];

  await prisma.faction.update({
    where: { id: factionId },
    data: {
      name,
      tagline: tagline || faction.tagline,
      category,
      ...(categoryChanged ? { emoji: nextMeta.emoji } : {}),
      joinMode,
      allowCrossCompany,
      visibleToCorp,
      visibleToOutsider,
      sortOrder,
    },
  });

  const categoryNote = categoryChanged
    ? ` | 分类: ${CATEGORIES[faction.category as CategoryKey]?.label ?? faction.category}→${nextMeta.label}`
    : "";
  const switchNote = faction.allowCrossCompany !== allowCrossCompany
    ? ` | 跨公司开关: ${faction.allowCrossCompany}→${allowCrossCompany}`
    : "";
  const sortNote =
    faction.sortOrder !== sortOrder ? ` | 展示位置: ${faction.sortOrder}→${sortOrder}` : "";
  // 可见人群变更单独记账：隔离问题的排查几乎都从「谁什么时候改了派的可见范围」开始
  const scopeChanged =
    faction.visibleToCorp !== visibleToCorp || faction.visibleToOutsider !== visibleToOutsider;
  const scopeNote = scopeChanged
    ? ` | 可见人群: ${factionScopeLabel({
        visibleToCorp: faction.visibleToCorp,
        visibleToOutsider: faction.visibleToOutsider,
      })}→${factionScopeLabel({ visibleToCorp, visibleToOutsider })}`
    : "";
  await audit(
    admin.id,
    "UPDATE_FACTION",
    "Faction",
    factionId,
    name + categoryNote + switchNote + sortNote + scopeNote,
  );

  // 开关从开→关：事务化清理跨公司 PENDING 申请（与派主管理台通道共用同一实现）
  if (turnedOff) {
    await revokeCrossCompanyPendingApplications(factionId, faction.companyId, faction.name);
  }

  revalidatePath("/admin/factions");
  revalidatePath(`/factions/${faction.slug}`);
  revalidatePath("/discover");
  revalidatePath("/");
  back(redirectTo, "ok", "派资料已保存");
}

/** 运营指派 / 更换 / 清空派主（Faction.leaderId 与 FactionMember.role 同步） */
export async function adminAssignFactionLeaderAction(formData: FormData) {
  const admin = await requireAdmin();
  const factionId = String(formData.get("factionId") ?? "");
  const leaderId = String(formData.get("leaderId") ?? "").trim();
  const redirectTo = `/admin/factions/${factionId}`;

  const faction = await prisma.faction.findUnique({
    where: { id: factionId },
    include: { leader: { select: { nickname: true } } },
  });
  if (!faction) back("/admin/factions", "error", "该派不存在");

  const previousLeaderId = faction.leaderId;
  const previousLeaderName = faction.leader?.nickname ?? "无派主";

  // 清空派主 → 转为「招募派主」；原派主降为普通成员（保留成员关系，权限以 role + status 共同判定）
  if (!leaderId) {
    if (!previousLeaderId) back(redirectTo, "error", "该派当前没有派主");

    await prisma.$transaction([
      prisma.factionMember.updateMany({
        where: { factionId, userId: previousLeaderId },
        data: { role: "MEMBER" },
      }),
      prisma.faction.update({ where: { id: factionId }, data: { leaderId: null } }),
    ]);

    await notify({
      userId: previousLeaderId,
      type: "SYSTEM",
      title: `「${faction.name}」派主身份已被运营调整`,
      body: "该派现在处于招募派主状态，如有疑问可联系平台运营。",
      link: `/factions/${faction.slug}`,
    });
    await audit(admin.id, "ASSIGN_FACTION_LEADER", "Faction", factionId, `${previousLeaderName}→(招募派主)`);

    revalidatePath("/admin/factions");
    revalidatePath(redirectTo);
    revalidatePath(`/factions/${faction.slug}`);
    revalidatePath(`/factions/${faction.slug}/manage`);
    revalidatePath("/discover");
    back(redirectTo, "ok", `已转为招募派主，原派主 ${previousLeaderName} 已降为普通成员`);
  }

  if (leaderId === previousLeaderId) back(redirectTo, "error", "该用户已是本派派主");

  const targetUser = await prisma.user.findUnique({
    where: { id: leaderId },
    select: { id: true, nickname: true, status: true },
  });
  if (!targetUser) back(redirectTo, "error", "该用户不存在");
  if (targetUser.status === "DISABLED") back(redirectTo, "error", "该账号已被禁用，无法担任派主");

  const existingTarget = await prisma.factionMember.findUnique({
    where: { factionId_userId: { factionId, userId: leaderId } },
    select: { status: true },
  });
  // 允许直接指派尚未成为正式成员的派主申请人：指派即自动入派，需同步 memberCount
  const becomesActiveMember = existingTarget?.status !== "ACTIVE";

  await prisma.$transaction(async (tx) => {
    await tx.factionMember.upsert({
      where: { factionId_userId: { factionId, userId: leaderId } },
      create: { factionId, userId: leaderId, role: "LEADER", status: "ACTIVE", appliedAt: null },
      update: { role: "LEADER", status: "ACTIVE", appliedAt: null },
    });
    if (becomesActiveMember) {
      await tx.faction.update({
        where: { id: factionId },
        data: { memberCount: { increment: 1 } },
      });
    }
    if (previousLeaderId) {
      await tx.factionMember.updateMany({
        where: { factionId, userId: previousLeaderId },
        data: { role: "MEMBER" },
      });
    }
    await tx.faction.update({ where: { id: factionId }, data: { leaderId } });
  });

  await notify({
    userId: leaderId,
    type: "LEADER",
    title: `你现在是「${faction.name}」派主`,
    body: "运营已将派主指派给你，去后台看看待办吧。",
    link: `/factions/${faction.slug}/manage`,
  });
  if (previousLeaderId && previousLeaderId !== leaderId) {
    await notify({
      userId: previousLeaderId,
      type: "SYSTEM",
      title: `「${faction.name}」派主已由运营调整`,
      body: `新任派主为 ${targetUser.nickname}，你已回到普通成员身份。`,
      link: `/factions/${faction.slug}`,
    });
  }

  await audit(
    admin.id,
    "ASSIGN_FACTION_LEADER",
    "Faction",
    factionId,
    `${previousLeaderName}→${targetUser.nickname}`,
  );

  revalidatePath("/admin/factions");
  revalidatePath(redirectTo);
  revalidatePath(`/factions/${faction.slug}`);
  revalidatePath(`/factions/${faction.slug}/manage`);
  revalidatePath("/discover");
  back(redirectTo, "ok", `已将派主更换为 ${targetUser.nickname}`);
}

/** 运营调整派所属公司 */
export async function adminUpdateFactionCompanyAction(formData: FormData) {
  const admin = await requireAdmin();
  const factionId = String(formData.get("factionId") ?? "");
  const companyId = String(formData.get("companyId") ?? "").trim();
  const redirectTo = `/admin/factions/${factionId}`;

  const faction = await prisma.faction.findUnique({
    where: { id: factionId },
    include: { company: { select: { name: true } } },
  });
  if (!faction) back("/admin/factions", "error", "该派不存在");
  if (!companyId) back(redirectTo, "error", "请选择所属公司");

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) back(redirectTo, "error", "所选公司不存在");
  if (company.id === faction.companyId) back(redirectTo, "error", "该派已属于该公司");

  await prisma.faction.update({ where: { id: factionId }, data: { companyId } });

  // 「同公司」的判定基准随之改变：开关关闭时作废不属于新公司的待审申请
  if (!faction.allowCrossCompany) {
    await revokeCrossCompanyPendingApplications(factionId, companyId, faction.name, {
      title: `「${faction.name}」的所属公司已调整`,
      body: "运营调整了本派所属公司，你的待审申请已自动作废，可重新申请。",
    });
  }

  if (faction.leaderId) {
    await notify({
      userId: faction.leaderId,
      type: "SYSTEM",
      title: `「${faction.name}」所属公司已调整`,
      body: `运营将本派所属公司从 ${faction.company.name} 调整为 ${company.name}，请确认自己的公司认证是否需要更新。`,
      link: `/factions/${faction.slug}/manage`,
    });
  }

  await audit(
    admin.id,
    "UPDATE_FACTION_COMPANY",
    "Faction",
    factionId,
    `${faction.company.name}→${company.name}`,
  );

  revalidatePath("/admin/factions");
  revalidatePath(redirectTo);
  revalidatePath("/");
  revalidatePath("/discover");
  revalidatePath(`/factions/${faction.slug}`);
  back(redirectTo, "ok", `所属公司已调整为 ${company.name}`);
}

/** 活动：运营代发 */
export async function adminCreateActivityAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const factionId = String(formData.get("factionId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const startAtRaw = String(formData.get("startAt") ?? "");
  const capacity = parseCapacity(formData.get("capacity"), 20);
  const redirectTo = "/admin/activities?status=ALL";

  const faction = await prisma.faction.findUnique({ where: { id: factionId } });
  if (!faction) return { error: "请选择活动所属的派" };
  if (title.length < 2) return { error: "请填写活动名称" };
  if (!location) return { error: "请填写活动地点" };

  const startAt = new Date(startAtRaw);
  if (Number.isNaN(startAt.getTime())) return { error: "请选择活动时间" };

  const activity = await prisma.activity.create({
    data: {
      factionId,
      creatorId: admin.id,
      title,
      description,
      location,
      startAt,
      capacity,
    },
  });

  const members = await prisma.factionMember.findMany({
    where: { factionId, status: "ACTIVE" },
    select: { userId: true },
  });
  if (members.length) {
    await prisma.notification.createMany({
      data: members.map((member) => ({
        userId: member.userId,
        type: "ACTIVITY",
        title: `「${faction.name}」发布新活动：${title}`,
        body: `${location} · ${startAt.toLocaleString("zh-CN")}`,
        link: `/factions/${faction.slug}/activities/${activity.id}`,
      })),
    });
  }

  await audit(admin.id, "CREATE_ACTIVITY", "Activity", activity.id, title);
  revalidatePath("/admin/activities");
  revalidatePath(`/factions/${faction.slug}`);
  back(redirectTo, "ok", `活动已发布到「${faction.name}」`);
}

/** 活动：运营编辑 */
export async function adminEditActivityAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const activityId = String(formData.get("activityId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const startAtRaw = String(formData.get("startAt") ?? "");
  const capacityRaw = formData.get("capacity");
  const redirectTo = "/admin/activities?status=ALL";

  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: { faction: true },
  });
  if (!activity) return { error: "活动不存在" };
  if (title.length < 2) return { error: "请填写活动名称" };
  if (!location) return { error: "请填写活动地点" };

  const startAt = new Date(startAtRaw);
  if (Number.isNaN(startAt.getTime())) return { error: "请选择活动时间" };

  // capacity=0 表示不限；空/非法时沿用原容量
  const nextCapacity = parseCapacity(capacityRaw, activity.capacity);
  if (nextCapacity > 0 && nextCapacity < activity.signupCount) {
    return { error: `已有 ${activity.signupCount} 人报名，名额不能小于该人数` };
  }

  await prisma.activity.update({
    where: { id: activityId },
    data: { title, description, location, startAt, capacity: nextCapacity },
  });

  await audit(admin.id, "UPDATE_ACTIVITY", "Activity", activityId, title);
  revalidatePath("/admin/activities");
  revalidatePath(`/factions/${activity.faction.slug}`);
  revalidatePath(`/factions/${activity.faction.slug}/activities/${activityId}`);
  back(redirectTo, "ok", "活动信息已更新");
}

/** 用户：重置登录密码（由运营设定新密码） */
export async function adminResetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/admin/users");

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "用户不存在" };
  if (password.length < 8) return { error: "新密码至少 8 位" };
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { error: "新密码需要同时包含字母和数字" };
  }

  const bcrypt = (await import("bcryptjs")).default;
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });
  await prisma.session.deleteMany({ where: { userId } });

  await notify({
    userId,
    type: "SYSTEM",
    title: "登录密码已被运营重置",
    body: "请向平台运营获取新的登录密码，并尽快在「我的 - 修改密码」中修改。",
  });
  await audit(admin.id, "RESET_PASSWORD", "User", userId);

  revalidatePath(`/admin/users/${userId}`);
  back(redirectTo, "ok", `已重置 ${target.nickname} 的登录密码，该用户已从所有设备下线`);
}

/** 举报处理：处置内容或忽略举报 */
export async function adminHandleReportAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const reportId = String(formData.get("reportId") ?? "");
  const action = String(formData.get("action") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const redirectTo = "/admin/reports";

  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) return { error: "举报记录不存在" };
  if (report.status !== "PENDING") return { error: "该举报已处理过了" };

  let targetUserId: string | null = null;

  if (action === "remove") {
    if (report.targetType === "POST") {
      const post = await prisma.post.findUnique({ where: { id: report.targetId } });
      if (post && post.status !== "DELETED") {
        await prisma.post.update({
          where: { id: post.id },
          data: { status: "DELETED" },
        });
        if (post.status === "PUBLISHED") {
          await prisma.faction.update({
            where: { id: post.factionId },
            data: { postCount: { decrement: 1 } },
          });
        }
        targetUserId = post.authorId;
      }
    } else if (report.targetType === "COMMENT") {
      const comment = await prisma.comment.findUnique({ where: { id: report.targetId } });
      if (comment && comment.status !== "HIDDEN") {
        await prisma.comment.update({
          where: { id: comment.id },
          data: { status: "HIDDEN" },
        });
        await prisma.post.update({
          where: { id: comment.postId },
          data: { commentCount: { decrement: 1 } },
        });
        targetUserId = comment.authorId;
      }
    } else {
      const target = await prisma.user.findUnique({ where: { id: report.targetId } });
      if (target) {
        await prisma.user.update({
          where: { id: target.id },
          data: { status: "DISABLED", disabledReason: note || "因举报被处理" },
        });
        await prisma.session.deleteMany({ where: { userId: target.id } });
        targetUserId = target.id;
      }
    }

    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: "RESOLVED",
        handledById: admin.id,
        handledNote: note || "已处理违规内容",
        handledAt: new Date(),
      },
    });
    await audit(admin.id, "REPORT_REMOVE", report.targetType, report.targetId, note);
  } else if (action === "ignore") {
    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: "IGNORED",
        handledById: admin.id,
        handledNote: note || "经核查未发现违规",
        handledAt: new Date(),
      },
    });
    await audit(admin.id, "REPORT_IGNORE", report.targetType, report.targetId, note);
  } else {
    return { error: "未知操作" };
  }

  await notify({
    userId: report.reporterId,
    type: "SYSTEM",
    title: action === "remove" ? "你的举报已处理" : "你的举报已核查",
    body:
      action === "remove"
        ? "感谢反馈，相关内容已被移除，社区因此更干净。"
        : "经核查暂未发现违规，感谢你帮助我们守护社区。",
    link: "/notifications",
  });

  if (targetUserId && action === "remove") {
    await notify({
      userId: targetUserId,
      type: "SYSTEM",
      title: "你的内容因举报被移除",
      body: note || "内容违反了社区规范，如有疑问可联系平台运营。",
    });
  }

  revalidatePath("/admin/reports");
  back(redirectTo, "ok", action === "remove" ? "已处置并通知相关用户" : "已标记为忽略");
}

/** 运营代批加入申请（通过/拒绝） */
export async function adminReviewMemberAction(formData: FormData) {
  const admin = await requireAdmin();
  const memberId = String(formData.get("memberId") ?? "");
  const factionId = String(formData.get("factionId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const next = String(formData.get("next") ?? "");
  // 审批入口可能在「加入申请」队列或派详情页，按来源回跳（仅允许站内后台路径）
  const redirectTo =
    next.startsWith("/admin/") && !next.startsWith("//") ? next : `/admin/factions/${factionId}`;

  const member = await prisma.factionMember.findUnique({
    where: { id: memberId },
    include: { user: true, faction: true },
  });
  if (!member || member.factionId !== factionId) back(redirectTo, "error", "成员记录不存在");
  // decision 白名单：非法值直接报错，与派主管理台通道保持一致
  if (decision !== "approve" && decision !== "reject") back(redirectTo, "error", "未知的审批操作");
  if (member.status !== "PENDING") back(redirectTo, "error", "该申请已被处理");

  if (decision === "approve") {
    // 条件更新（仅命中仍 PENDING 的行）+ 计数同事务，与派主管理台通道保持一致
    const approved = await prisma.$transaction(async (tx) => {
      const updated = await tx.factionMember.updateMany({
        where: { id: memberId, status: "PENDING" },
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
    if (!approved) back(redirectTo, "error", "该申请已被处理");
    await notify({
      userId: member.userId,
      type: "POST",
      title: `你已加入「${member.faction.name}」`,
      body: "运营通过了你的加入申请，去和大家打个招呼吧。",
      link: `/factions/${member.faction.slug}`,
    });
    if (member.faction.leaderId && member.faction.leaderId !== member.userId) {
      await notify({
        userId: member.faction.leaderId,
        type: "SYSTEM",
        title: `运营代批：${member.user.nickname} 已加入「${member.faction.name}」`,
        body: "该申请由平台运营审批通过",
        link: `/factions/${member.faction.slug}/manage?tab=members`,
      });
    }
    await audit(admin.id, "APPROVE_JOIN_REQUEST", "FactionMember", memberId, `${member.user.nickname}→${member.faction.name}`);
  } else {
    const rejected = await prisma.factionMember.updateMany({
      where: { id: memberId, status: "PENDING" },
      data: { status: "REMOVED" },
    });
    if (rejected.count !== 1) back(redirectTo, "error", "该申请已被处理");
    await notify({
      userId: member.userId,
      type: "POST",
      title: `「${member.faction.name}」的加入申请未通过`,
      body: "运营已拒绝该申请，你可以看看其他兴趣派。",
      link: "/discover",
    });
    await audit(admin.id, "REJECT_JOIN_REQUEST", "FactionMember", memberId, `${member.user.nickname}→${member.faction.name}`);
  }

  revalidatePath(redirectTo);
  revalidatePath("/admin/joins");
  revalidatePath(`/factions/${member.faction.slug}`);
  revalidatePath(`/factions/${member.faction.slug}/manage`);
  back(redirectTo, "ok", decision === "approve" ? "已通过申请" : "已拒绝申请");
}

/** 运营代批成员列表查看申请（主要用于无派主的派，入口在后台「加入申请」） */
export async function adminReviewMemberViewAction(formData: FormData) {
  const admin = await requireAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  const factionId = String(formData.get("factionId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const next = String(formData.get("next") ?? "");
  const redirectTo =
    next.startsWith("/admin/") && !next.startsWith("//") ? next : `/admin/factions/${factionId}`;

  const request = await prisma.memberViewRequest.findUnique({
    where: { id: requestId },
    include: { user: true, faction: true },
  });
  if (!request || request.factionId !== factionId) back(redirectTo, "error", "查看申请不存在");
  if (decision !== "approve" && decision !== "reject") back(redirectTo, "error", "未知的审批操作");

  const updated = await prisma.memberViewRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: {
      status: decision === "approve" ? "APPROVED" : "REJECTED",
      reviewedAt: new Date(),
      reviewerId: admin.id,
    },
  });
  if (updated.count !== 1) back(redirectTo, "error", "该申请已被处理");

  await notify({
    userId: request.userId,
    type: "POST",
    title:
      decision === "approve"
        ? `你已获准查看「${request.faction.name}」成员列表`
        : `「${request.faction.name}」成员列表查看申请未通过`,
    body:
      decision === "approve"
        ? "运营通过了你的查看申请，现在可以看到成员列表了。"
        : "该申请由平台运营处理，如有疑问可联系派主或客服。",
    link: `/factions/${request.faction.slug}?tab=members`,
  });

  // 派主（含副派主）知情：运营代批其派查看权限时同步提醒
  const managers = await prisma.factionMember.findMany({
    where: { factionId, status: "ACTIVE", role: { in: ["LEADER", "ADMIN"] } },
    select: { userId: true },
  });
  const managerIds = managers.map((item) => item.userId).filter((id) => id !== admin.id);
  if (managerIds.length) {
    await prisma.notification.createMany({
      data: managerIds.map((userId) => ({
        userId,
        type: "SYSTEM" as const,
        title: `运营代批：${request.user.nickname} 已获准查看「${request.faction.name}」成员列表`,
        body: decision === "approve" ? "该查看申请由平台运营审批通过" : "该查看申请已由平台运营拒绝",
        link: `/factions/${request.faction.slug}/manage?tab=members`,
      })),
    });
  }

  await audit(
    admin.id,
    decision === "approve" ? "APPROVE_VIEW_REQUEST" : "REJECT_VIEW_REQUEST",
    "MemberViewRequest",
    requestId,
    `${request.user.nickname}→${request.faction.name}`,
  );

  revalidatePath(redirectTo);
  revalidatePath("/admin/joins");
  revalidatePath(`/factions/${request.faction.slug}`);
  revalidatePath(`/factions/${request.faction.slug}/manage`);
  back(redirectTo, "ok", decision === "approve" ? "已通过查看申请" : "已拒绝查看申请");
}
