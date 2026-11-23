"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { notify } from "@/lib/notify";

/**
 * 用户关注：toggle 语义（未关注则关注、已关注则取消），关注对全体登录用户开放、无认证门槛。
 * 关系唯一性由 Follow(followerId, followingId) 库级保证；
 * 新增关注给被关注人写 Notification type=FOLLOW（点击跳关注人主页），取消关注不反向发通知。
 */

function back(path: string, key: "ok" | "error", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${key}=${encodeURIComponent(message)}`);
}

/* ------------------------------ 关注限流 ------------------------------ */
// per-user 进程内滑动窗口（参照 message.ts 私信限流写法）：关注是轻操作，阈值放宽，只防脚本连点
const FOLLOW_WINDOW_MS = 60_000;
const FOLLOW_MAX_PER_WINDOW = 30;
const followHits = new Map<string, number[]>();

function checkFollowRateLimit(userId: string, now = Date.now()) {
  const cutoff = now - FOLLOW_WINDOW_MS;
  const recent = (followHits.get(userId) ?? []).filter((t) => t > cutoff);
  if (recent.length >= FOLLOW_MAX_PER_WINDOW) {
    followHits.set(userId, recent);
    return false;
  }
  recent.push(now);
  followHits.set(userId, recent);
  if (followHits.size > 5000) {
    for (const [key, list] of followHits) {
      const kept = list.filter((t) => t > cutoff);
      if (kept.length) followHits.set(key, kept);
      else followHits.delete(key);
    }
  }
  return true;
}

export async function toggleFollowAction(formData: FormData) {
  const targetId = String(formData.get("targetId") ?? "");
  // 默认回被关注人主页；列表页（/me/follows）可传 returnTo 就地刷新，仅限站内绝对路径
  const rawReturn = String(formData.get("returnTo") ?? "");
  const backPath = /^\/(?!\/)/.test(rawReturn) ? rawReturn : `/users/${targetId}`;

  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(backPath)}`);

  if (!targetId || targetId === me.id) {
    back(backPath || "/discover", "error", "不能关注自己");
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, nickname: true, status: true },
  });
  if (!target || target.status !== "ACTIVE") {
    back("/discover", "error", "用户不存在");
  }

  if (!checkFollowRateLimit(me.id)) {
    back(backPath, "error", "操作太频繁，请稍后再试");
  }

  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: me.id, followingId: target.id } },
    select: { id: true },
  });
  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } });
    back(backPath, "ok", `已取消关注 ${target.nickname}`);
  }

  await prisma.follow.create({ data: { followerId: me.id, followingId: target.id } });
  await notify({
    userId: target.id,
    type: "FOLLOW",
    title: "有人关注了你",
    body: `${me.nickname} 关注了你，可以去 TA 的主页看看`,
    link: `/users/${me.id}`,
  });
  back(backPath, "ok", `已关注 ${target.nickname}`);
}
