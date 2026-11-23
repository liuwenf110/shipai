import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { touchSession } from "@/lib/presence";

const COOKIE_NAME = process.env.SESSION_COOKIE || "shipai_session";
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({ data: { id: token, userId, expiresAt, lastSeenAt: new Date() } });

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { id: token } });
  }
  jar.delete(COOKIE_NAME);
}

export const getCurrentUser = cache(async () => {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { id: token },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.deleteMany({ where: { id: token } });
    return null;
  }

  // 被运营禁用的账号立即失效
  if (session.user.status === "DISABLED") {
    await prisma.session.deleteMany({ where: { userId: session.user.id } });
    return null;
  }

  // 登录态有效即视为活跃，供后台在线/离线判定
  await touchSession(session);

  return session.user;
});

/** 当前用户 + 身份认证 + 派成员关系 */
export const getViewer = cache(async () => {
  const current = await getCurrentUser();
  if (!current) return null;

  // Viewer 会被传入页面组件（如 TopBar），dev 模式 flight 调试载荷会携带全字段；
  // 在边界处剔除 passwordHash（email 等展示字段保留），登录/改密校验走 getCurrentUser 不受影响
  const { passwordHash: _passwordHash, ...user } = current;

  const [employments, memberships, unreadCount, unreadMessages] = await Promise.all([
    prisma.employment.findMany({
      where: { userId: user.id },
      include: { company: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.factionMember.findMany({
      where: { userId: user.id, status: { in: ["ACTIVE", "PENDING"] } },
      include: { faction: { include: { company: true } } },
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.message.count({
      where: { recipientId: user.id, readAt: null, status: "PUBLISHED" },
    }),
  ]);

  return {
    user,
    employments,
    verifiedEmployments: employments.filter((item) => item.status === "VERIFIED"),
    pendingEmployments: employments.filter((item) => item.status === "PENDING"),
    memberships,
    unreadCount,
    unreadMessages,
    isVerified: employments.some((item) => item.status === "VERIFIED"),
  };
});

export type Viewer = NonNullable<Awaited<ReturnType<typeof getViewer>>>;

/** 管理端独立入口：与用户端 /login 完全分开 */
export const ADMIN_LOGIN_PATH = "/admin/login";

export async function requireUser(nextPath = "/") {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return user;
}

export async function requireAdmin(nextPath = "/admin") {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`${ADMIN_LOGIN_PATH}?next=${encodeURIComponent(nextPath)}`);
  }
  // 非运营账号一律留在管理端登录页，不引导回用户端
  if (user.role !== "ADMIN") {
    redirect(`${ADMIN_LOGIN_PATH}?error=forbidden`);
  }
  return user;
}

/** 判断用户是否在某公司完成身份认证（在职或离职均可） */
export async function verifiedEmploymentAt(userId: string, companyId: string) {
  return prisma.employment.findFirst({
    where: { userId, companyId, status: "VERIFIED" },
    include: { company: true },
  });
}
