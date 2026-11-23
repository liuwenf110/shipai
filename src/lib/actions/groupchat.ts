"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { checkUserText } from "@/lib/sec";
import { MESSAGE_MAX_LEN } from "@/lib/constants";
import type { ActionState } from "@/lib/types";

// 与私信同款限流：每用户 60s 窗口最多 20 条（进程内近似，多实例部署会放宽）
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;
const sendRate = new Map<string, number[]>();

/**
 * 一键拉起活动群聊：把当时全部 GOING 报名（外加发起人自己）拉进群。
 * 权限硬约束：只有活动发起人可建群；activityId 唯一键保证每场活动最多一群。
 */
export async function launchGroupChatAction(formData: FormData) {
  const user = await requireUser();
  const activityId = String(formData.get("activityId") ?? "");
  const path = String(formData.get("redirectTo") ?? "");

  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: { signups: { where: { status: "GOING" }, select: { userId: true } } },
  });
  if (!activity) redirect(path || "/");
  if (activity.creatorId !== user.id) {
    redirect(`${path}?error=${encodeURIComponent("只有活动发起人可以拉起群聊")}`);
  }

  const existing = await prisma.groupChat.findUnique({ where: { activityId } });
  if (existing) redirect(`/messages/group/${existing.id}`);

  // 发起人未必报名了自己的活动，成员集合按 Set 去重后兜底加入
  const memberIds = Array.from(new Set([activity.creatorId, ...activity.signups.map((s) => s.userId)]));
  const group = await prisma.groupChat.create({ data: { activityId, creatorId: user.id } });
  await prisma.groupChatMember.createMany({
    data: memberIds.map((userId) => ({ groupId: group.id, userId })),
  });

  revalidatePath(`/messages`);
  redirect(
    `/messages/group/${group.id}?ok=${encodeURIComponent(`群聊已拉起，已拉入 ${memberIds.length} 位成员`)}`,
  );
}

/** 群内发言：仅群成员可发；审核与限流同私信口径；与 MessageComposer 同款 ActionState 契约 */
export async function sendGroupMessageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser("/");
  const groupId = String(formData.get("groupId") ?? "");
  const raw = String(formData.get("content") ?? "").trim();

  const membership = await prisma.groupChatMember.findUnique({
    where: { groupId_userId: { groupId, userId: user.id } },
  });
  if (!membership) return { error: "你不在这个群聊里，无法发言" };
  if (!raw) return { error: "先写点什么吧" };
  if (raw.length > MESSAGE_MAX_LEN) {
    return { error: `单条消息最长 ${MESSAGE_MAX_LEN} 字` };
  }

  const now = Date.now();
  const stamps = (sendRate.get(user.id) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (stamps.length >= RATE_LIMIT) {
    return { error: "发送太频繁，请稍后再试" };
  }
  stamps.push(now);
  sendRate.set(user.id, stamps);

  const moderation = await checkUserText(user.id, raw, 2);
  if (!moderation.ok) {
    return { error: "内容包含违规信息，请修改后再发送" };
  }

  const group = await prisma.groupChat.findUnique({ where: { id: groupId } });
  if (!group) return { error: "群聊不存在" };

  const message = await prisma.groupMessage.create({
    data: {
      groupId,
      senderId: user.id,
      content: raw,
    },
  });
  await prisma.groupChat.update({
    where: { id: groupId },
    data: {
      lastMessageAt: message.createdAt,
      lastPreview: `${user.nickname}: ${raw.slice(0, 40)}`,
    },
  });

  revalidatePath(`/messages/group/${groupId}`);
  return { ok: true };
}
