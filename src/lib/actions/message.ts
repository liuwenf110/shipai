"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { checkUserText } from "@/lib/sec";
import { MESSAGE_MAX_LEN } from "@/lib/constants";
import { audienceOfUserOrAdmin, canViewUser } from "@/lib/scope";
import type { ActionState } from "@/lib/types";

/**
 * 站内一对一私信。
 * 可达规则（与产品口径一致）：仅「已完成公司认证」的用户之间可互发 ——
 * 双方都要有 Employment{status:"VERIFIED"}（在职 ACTIVE 与离职 ALUMNI 均可）；不能给自己发；对方账号须 ACTIVE。
 * 会话唯一性由 Conversation.pairKey（两 userId 升序 join("_")）在库层面保证。
 */

function back(path: string, key: "ok" | "error", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${key}=${encodeURIComponent(message)}`);
}

/** 是否「已完成公司认证」（在职或离职认证任一即算，与 users 页展示逻辑保持一致） */
async function isVerifiedEmployee(userId: string) {
  const hit = await prisma.employment.findFirst({
    where: { userId, status: "VERIFIED" },
    select: { id: true },
  });
  return Boolean(hit);
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join("_");
}

/* ------------------------------ 私信限流 ------------------------------ */
// per-user 进程内滑动窗口（参照 rate-limit.ts 的 Map+窗口写法，但按 userId 维度）：
// 单实例 next start 常驻语义正确；dev HMR 重建模块会清零，可接受。
const MSG_WINDOW_MS = 60_000;
const MSG_MAX_PER_WINDOW = 20;
const msgHits = new Map<string, number[]>();

function checkMessageRateLimit(userId: string, now = Date.now()) {
  const cutoff = now - MSG_WINDOW_MS;
  const recent = (msgHits.get(userId) ?? []).filter((t) => t > cutoff);
  if (recent.length >= MSG_MAX_PER_WINDOW) {
    msgHits.set(userId, recent);
    return false;
  }
  recent.push(now);
  msgHits.set(userId, recent);
  if (msgHits.size > 5000) {
    for (const [key, list] of msgHits) {
      const kept = list.filter((t) => t > cutoff);
      if (kept.length) msgHits.set(key, kept);
      else msgHits.delete(key);
    }
  }
  return true;
}

/* ------------------------------ 发起会话 ------------------------------ */

export async function startConversationAction(formData: FormData) {
  const targetId = String(formData.get("targetId") ?? "");
  const backPath = `/users/${targetId}`;

  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(backPath)}`);

  if (!targetId || targetId === me.id) {
    back(backPath, "error", "不能给自己发私信");
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, status: true },
  });
  if (!target || target.status !== "ACTIVE") {
    back("/discover", "error", "用户不存在");
  }

  const [meOk, targetOk] = await Promise.all([
    isVerifiedEmployee(me.id),
    isVerifiedEmployee(target.id),
  ]);
  if (!meOk) back(backPath, "error", "完成公司认证后才能发私信");
  if (!targetOk) back(backPath, "error", "对方未完成公司认证，暂无法私信");

  // 大厂 / 非大厂之间不可互发：私信不经过派，是隔离主线盖不到的直连通道
  const audience = await audienceOfUserOrAdmin(me);
  if (!(await canViewUser(audience, me.id, target.id))) {
    back(backPath, "error", "对方与你不在同一人群范围，暂无法私信");
  }

  const key = pairKey(me.id, target.id);
  // 升序两 id 固定落位 userA/userB，保证同一对用户永远命中同一条会话
  const [userAId, userBId] = [me.id, target.id].sort();
  const conversation = await prisma.conversation.upsert({
    where: { pairKey: key },
    create: { pairKey: key, userAId, userBId },
    update: {},
  });

  redirect(`/messages/${conversation.id}`);
}

/* ------------------------------ 发送消息 ------------------------------ */

export async function sendMessageAction(prev: ActionState, formData: FormData): Promise<ActionState> {
  const conversationId = String(formData.get("conversationId") ?? "");
  const content = String(formData.get("content") ?? "").trim();

  const me = await getCurrentUser();
  if (!me) return { error: "请先登录" };

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, userAId: true, userBId: true },
  });
  if (!conversation || (conversation.userAId !== me.id && conversation.userBId !== me.id)) {
    return { error: "会话不存在或无权访问" };
  }

  if (!content) return { error: "消息不能为空" };
  if (content.length > MESSAGE_MAX_LEN) {
    return { error: `单条消息最长 ${MESSAGE_MAX_LEN} 字` };
  }

  if (!checkMessageRateLimit(me.id)) {
    return { error: "发送太频繁，请稍后再试" };
  }

  const sec = await checkUserText(me.id, content, 2);
  if (!sec.ok) return { error: "内容包含违规信息，请修改后再发送" };

  const recipientId = conversation.userAId === me.id ? conversation.userBId : conversation.userAId;

  // 存量会话兜底：两人一方后来改了阵营时，发送侧同样按跨阵营拦下
  const audience = await audienceOfUserOrAdmin(me);
  if (!(await canViewUser(audience, me.id, recipientId))) {
    return { error: "对方与你不在同一人群范围，无法发送" };
  }

  const preview = content.length > 40 ? `${content.slice(0, 40)}…` : content;

  await prisma.$transaction([
    prisma.message.create({
      data: { conversationId, senderId: me.id, recipientId, content },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), lastPreview: preview },
    }),
  ]);

  // 收件提醒只走私信自身的未读体系（TopBar 私信 dot / 列表页胶囊），
  // 不再往通知列表写重复的 MESSAGE 记录；存量旧记录保留由 /notifications 正常渲染

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);

  return { ok: true };
}

/* ---------------------------- 会话置为已读 ---------------------------- */

// 线程页渲染时直接 prisma.message.updateMany 置已读（见 /messages/[id] 页），
// 这里只留给列表页「全部已读」类按钮复用
export async function markConversationReadAction(formData: FormData) {
  const conversationId = String(formData.get("conversationId") ?? "");
  const me = await getCurrentUser();
  if (!me || !conversationId) return;
  await prisma.message.updateMany({
    where: { conversationId, recipientId: me.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/messages");
}
