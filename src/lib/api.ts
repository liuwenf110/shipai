import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { touchSession } from "@/lib/presence";
import type { User } from "@prisma/client";

export const SESSION_COOKIE = process.env.SESSION_COOKIE || "shipai_session";

/** 接口对外暴露的用户字段：严禁返回 passwordHash / 邮箱等敏感信息 */
export const PUBLIC_USER = {
  id: true,
  nickname: true,
  avatarColor: true,
  avatarImage: true,
  bio: true,
  role: true,
} as const;

/** 需要展示作者认证身份（公司 + 在职/离职）时的用户字段：附带已认证的雇佣关系 */
export const IDENTIFIED_USER = {
  ...PUBLIC_USER,
  employments: {
    where: { status: "VERIFIED" },
    select: { companyId: true, kind: true, company: { select: { shortName: true } } },
  },
} as const;

/** 后台管理页面用户字段白名单：含 email/phone 但剔除 passwordHash，防止 dev flight 泄漏 */
export const ADMIN_USER = {
  id: true,
  nickname: true,
  avatarColor: true,
  bio: true,
  role: true,
  email: true,
  phone: true,
  status: true,
  createdAt: true,
} as const;

export type ApiMeta = {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

/** 统一成功响应：{ ok: true, data, meta } */
export function apiOk<T>(data: T, meta?: ApiMeta) {
  return NextResponse.json({ ok: true, data, meta: meta ?? null });
}

/** 统一失败响应：{ ok: false, error } */
export function apiError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/** 从 Cookie 解析当前登录用户（被禁用账号视为未登录） */
export async function getApiUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { id: token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  if (session.user.status === "DISABLED") return null;

  // 接口访问同样算一次活跃
  await touchSession(session);

  return session.user;
}

export async function requireApiUser() {
  const user = await getApiUser();
  if (!user) return { user: null, response: apiError("请先登录", 401) } as const;
  return { user, response: null } as const;
}

export function paging(url: URL, defaultSize = 10) {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const rawSize = Number(url.searchParams.get("pageSize") ?? defaultSize) || defaultSize;
  const pageSize = Math.min(50, Math.max(1, rawSize));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function metaOf(page: number, pageSize: number, total: number): ApiMeta {
  return { page, pageSize, total, hasMore: page * pageSize < total };
}

/** 读取 JSON body，失败返回 null */
export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
