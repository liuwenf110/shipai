"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { notifyAdmins } from "@/lib/notify";
import { checkUserText } from "@/lib/sec";
import { buildLinkSnapshot, normalizeLinkUrl } from "@/lib/link-preview";
import { looksRichText, richTextToPlainText, sanitizeRichText } from "@/lib/rich-text";
import type { ActionState } from "@/lib/types";

function back(path: string, key: "ok" | "error", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${key}=${encodeURIComponent(message)}`);
}

/* ------------------------------ 作者自助编辑 ------------------------------ */

/** 作者修改自己的帖子（标题+正文+外链，配图不变）；派主/运营也不能改他人内容。
 * 作者恰好是本派派主/副派主时，编辑框可同时改「置顶」「公告」（治理权，见下）。
 * 链接传空即移除；重新填链接会重新抓取快照。
 * 校验失败 return {error} 停在原页保留输入；成功走 back() 整页导航：顶部绿色提示 + 折叠面板自然收起，
 * 避免无导航时用户感知不到上方正文区已更新（像“提交无反应”）。 */
export async function editPostAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  const postId = String(formData.get("postId") ?? "");
  const path = String(formData.get("redirectTo") ?? "") || `/posts/${postId}`;
  const title = String(formData.get("title") ?? "").trim();
  // 正文与发帖同源：富文本净化入库，字数校验按剥标签后纯文本
  const rawContent = String(formData.get("content") ?? "");
  const plainContent = richTextToPlainText(rawContent).trim();
  const content = looksRichText(rawContent) ? sanitizeRichText(rawContent) : rawContent.trim();
  // 编辑表单已移除独立链接输入：字段缺失时保留帖子原有链接卡片，仅当显式提交 link 才重抓/清除
  const linkSubmitted = formData.has("link");
  const linkRaw = linkSubmitted ? String(formData.get("link") ?? "").trim() : "";
  const linkUrl = linkRaw ? normalizeLinkUrl(linkRaw) : null;
  if (linkRaw && !linkUrl) return { error: "链接格式不正确，请粘贴网页链接（支持公众号文章）" };

  if (!plainContent) return { error: "正文不能为空" };
  if (plainContent.length < 2) return { error: "正文至少 2 个字" };
  if (plainContent.length > 2000) return { error: "内容请控制在 2000 字以内" };

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { faction: { select: { slug: true } } },
  });
  if (!post || post.status === "DELETED") back(path, "error", "帖子不存在或已删除");
  if (post.authorId !== user.id) back(path, "error", "只能修改自己发布的内容");

  // 置顶/公告是派主治理权：只有作者同时是本派派主/副派主时才受理这两个字段，
  // 普通成员改帖时不提交该列，避免顺带清掉派主设定的置顶与公告
  const authorMembership = await prisma.factionMember.findUnique({
    where: { factionId_userId: { factionId: post.factionId, userId: user.id } },
  });
  const isFactionManager = Boolean(
    authorMembership && authorMembership.status === "ACTIVE" && authorMembership.role !== "MEMBER",
  );

  // 首页公开招募不限角色（编辑与发帖表单都对作者本人渲染该勾选），未勾选即取消招募
  const wantRecruit = formData.get("recruit") === "1";

  const textCheck = await checkUserText(user.id, `${title} ${plainContent} ${linkUrl ?? ""}`.trim(), 4);
  if (!textCheck.ok) return { error: "内容涉及违规信息，请调整后重新保存" };

  const linkSnapshot = linkUrl ? await buildLinkSnapshot(linkUrl) : null;

  await prisma.post.update({
    where: { id: postId },
    data: {
      title: title || null,
      content,
      recruit: wantRecruit,
      ...(isFactionManager
        ? {
            pinned: formData.get("pinned") === "1",
            kind: formData.get("announce") === "1" ? "ANNOUNCE" : "POST",
          }
        : {}),
      // 未提交 link 时不动链接快照，避免编辑老帖静默清掉原有链接卡片
      ...(linkSubmitted
        ? {
            linkUrl: linkSnapshot?.linkUrl ?? null,
            linkTitle: linkSnapshot?.linkTitle ?? null,
            linkImage: linkSnapshot?.linkImage ?? null,
            linkDesc: linkSnapshot?.linkDesc ?? null,
          }
        : {}),
    },
  });

  revalidatePath(`/posts/${postId}`);
  revalidatePath(`/factions/${post.faction.slug}`);
  revalidatePath("/");
  back(path, "ok", "修改已保存");
}

/* ------------------------------ 作者自助删除 ------------------------------ */

export async function deleteOwnPostAction(formData: FormData) {
  const postId = String(formData.get("postId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/");

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(redirectTo)}`);

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { faction: { select: { slug: true } } },
  });
  if (!post) back(redirectTo, "error", "帖子不存在");
  if (post.authorId !== user.id) back(redirectTo, "error", "只能删除自己发布的内容");
  if (post.status === "DELETED") back(redirectTo, "error", "该帖已删除");

  await prisma.post.update({ where: { id: postId }, data: { status: "DELETED" } });
  if (post.status === "PUBLISHED") {
    await prisma.faction.update({
      where: { id: post.factionId },
      data: { postCount: { decrement: 1 } },
    });
  }

  const factionPath = `/factions/${post.faction.slug}`;
  revalidatePath(factionPath);
  revalidatePath("/");
  if (redirectTo.startsWith("/posts/")) {
    back(factionPath, "ok", "已删除这条动态");
  }
  back(redirectTo, "ok", "已删除这条动态");
}

export async function deleteOwnCommentAction(formData: FormData) {
  const commentId = String(formData.get("commentId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/");

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(redirectTo)}`);

  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) back(redirectTo, "error", "评论不存在");
  if (comment.authorId !== user.id) back(redirectTo, "error", "只能删除自己的评论");
  if (comment.status === "HIDDEN") back(redirectTo, "error", "该评论已被移除");

  await prisma.comment.update({ where: { id: commentId }, data: { status: "HIDDEN" } });
  await prisma.post.update({
    where: { id: comment.postId },
    data: { commentCount: { decrement: 1 } },
  });

  revalidatePath(redirectTo);
  back(redirectTo, "ok", "已删除该评论");
}

/* -------------------------------- 举报 ---------------------------------- */

const REPORT_REASONS = ["SPAM", "ABUSE", "PORN", "FRAUD", "OTHER"] as const;
const REPORT_TARGETS = ["POST", "COMMENT", "USER"] as const;

export async function submitReportAction(formData: FormData) {
  const targetType = String(formData.get("targetType") ?? "");
  const targetId = String(formData.get("targetId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const detail = String(formData.get("detail") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "/");

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(redirectTo)}`);

  if (!REPORT_TARGETS.includes(targetType as (typeof REPORT_TARGETS)[number])) {
    back(redirectTo, "error", "举报对象不正确");
  }
  if (!REPORT_REASONS.includes(reason as (typeof REPORT_REASONS)[number])) {
    back(redirectTo, "error", "请选择举报原因");
  }
  if (!targetId) back(redirectTo, "error", "举报对象不存在");

  // 记录一份可读的原文快照，方便运营判断
  let excerpt = "";
  let ownerId: string | null = null;
  if (targetType === "POST") {
    const post = await prisma.post.findUnique({
      where: { id: targetId },
      select: { content: true, title: true, authorId: true },
    });
    if (!post) back(redirectTo, "error", "内容不存在或已删除");
    ownerId = post.authorId;
    excerpt = post.title ? `${post.title} ${post.content}` : post.content;
  } else if (targetType === "COMMENT") {
    const comment = await prisma.comment.findUnique({
      where: { id: targetId },
      select: { content: true, authorId: true },
    });
    if (!comment) back(redirectTo, "error", "内容不存在或已删除");
    ownerId = comment.authorId;
    excerpt = comment.content;
  } else {
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { nickname: true, bio: true },
    });
    if (!target) back(redirectTo, "error", "用户不存在");
    ownerId = targetId;
    excerpt = `${target.nickname} ${target.bio ?? ""}`.trim();
  }

  if (ownerId === user.id) back(redirectTo, "error", "不能举报自己");

  const existing = await prisma.report.findUnique({
    where: {
      targetType_targetId_reporterId: {
        targetType,
        targetId,
        reporterId: user.id,
      },
    },
  });
  if (existing) {
    back(
      redirectTo,
      "ok",
      existing.status === "PENDING" ? "你已举报过，运营正在处理" : "你已举报过该内容",
    );
  }

  const note = detail ? `${detail.slice(0, 200)}\n\n原文：${excerpt.slice(0, 160)}` : `原文：${excerpt.slice(0, 160)}`;

  await prisma.report.create({
    data: {
      targetType,
      targetId,
      reporterId: user.id,
      reason,
      detail: note,
    },
  });

  await notifyAdmins({
    type: "SYSTEM",
    title: `收到新的内容举报（${targetType === "POST" ? "动态" : targetType === "COMMENT" ? "评论" : "用户"}）`,
    body: detail ? detail.slice(0, 60) : excerpt.slice(0, 60),
    link: "/admin/reports",
  });

  back(redirectTo, "ok", "举报已提交，我们会尽快处理");
}
