import "server-only";

import { prisma } from "@/lib/db";
import type { User } from "@prisma/client";

/**
 * 登录邮箱 = 当前 User.email 或任一历史 EmailAlias。
 * 改邮箱时旧邮箱登记为别名，因此同一个邮箱至多归属一个账号（注册/改邮箱都做占用校验）。
 */

/** 按登录邮箱解析账号：先匹配当前邮箱，再匹配历史别名。 */
export async function findUserByLoginEmail(email: string): Promise<User | null> {
  if (!email) return null;
  const direct = await prisma.user.findUnique({ where: { email } });
  if (direct) return direct;
  const alias = await prisma.emailAlias.findUnique({ where: { email }, include: { user: true } });
  return alias?.user ?? null;
}

/**
 * 邮箱是否已被占用：作为某账号当前登录邮箱，或作为某账号的历史别名。
 * excludeUserId 用于「本人改邮箱」场景跳过自己。返回占用者 id（无则 null）。
 */
export async function findEmailOwner(email: string, excludeUserId?: string): Promise<string | null> {
  if (!email) return null;
  const asPrimary = await prisma.user.findFirst({
    where: { email, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    select: { id: true },
  });
  if (asPrimary) return asPrimary.id;
  const asAlias = await prisma.emailAlias.findUnique({ where: { email }, select: { userId: true } });
  if (asAlias && asAlias.userId !== excludeUserId) return asAlias.userId;
  return null;
}
