import "server-only";

import { prisma } from "@/lib/db";

/** 真实在线判定：连续 ONLINE_WINDOW_MS 没有任何活动即视为离线 */
export const ONLINE_WINDOW_MS = 90_000;

/** 打点节流：同一会话在该间隔内只落库一次，避免每次请求都写 Session */
export const TOUCH_THROTTLE_MS = 30_000;

/** 在线窗口的时间下界，直接用于 Prisma 的 lastSeenAt: { gt: ... } */
export function onlineThreshold(now = Date.now()) {
  return new Date(now - ONLINE_WINDOW_MS);
}

/**
 * 会话活跃打点：登录态校验通过后调用。
 * 已在本项目所有取用户入口（getCurrentUser / getApiUser）覆盖，前端心跳只是补充「页面开着但不发请求」的场景。
 */
export async function touchSession(session: { id: string; lastSeenAt: Date | null }) {
  const now = Date.now();
  if (session.lastSeenAt && now - session.lastSeenAt.getTime() < TOUCH_THROTTLE_MS) return;

  try {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } });
  } catch {
    // 会话可能刚被强制下线／禁用删除，打点失败不能影响业务请求
  }
}

/** 单个活跃时间是否落在线内 */
export function isOnline(lastSeenAt: Date | null, now = Date.now()) {
  return Boolean(lastSeenAt) && now - lastSeenAt!.getTime() < ONLINE_WINDOW_MS;
}

/** 把一个用户的多个会话折叠成「在线与否 + 最后活跃时刻」 */
export function presenceOf(
  sessions: { lastSeenAt: Date | null }[],
  now = Date.now(),
): { online: boolean; lastSeenAt: Date | null } {
  let lastSeenAt: Date | null = null;
  for (const item of sessions) {
    if (item.lastSeenAt && (!lastSeenAt || item.lastSeenAt > lastSeenAt)) lastSeenAt = item.lastSeenAt;
  }
  return { online: isOnline(lastSeenAt, now), lastSeenAt };
}
