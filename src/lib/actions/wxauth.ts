"use server";

import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { colorFromString, isPhone, normalizeEmail, normalizePhone } from "@/lib/utils";
import { clearPendingOpenid, getPendingOpenid, setWxNeedNicknameFlag } from "@/lib/wx";
import type { ActionState } from "@/lib/types";

/** 与既有注册/登录保持一致的回跳校验：仅接受站内路径 */
function safeNext(value: unknown) {
  const v = typeof value === "string" ? value : "";
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  return "/";
}

/** 微信一键注册：需用户至少填手机号或邮箱之一（二选一自动判别），连同 openid 建号，后续走公司认证补全资料 */
export async function wxQuickRegisterAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const openid = await getPendingOpenid();
  if (!openid) redirect("/login?error=" + encodeURIComponent("微信授权已过期，请重新从微信进入"));

  const existing = await prisma.user.findUnique({ where: { wechatOpenid: openid } });
  if (existing) {
    if (existing.status === "DISABLED") {
      redirect("/login?error=" + encodeURIComponent("账号已被禁用，请联系运营"));
    }
    await createSession(existing.id);
    await clearPendingOpenid();
    redirect(safeNext(formData.get("next")));
  }

  // 与 registerAction 同样口径：11 位手机号→phone，否则按邮箱校验
  const account = String(formData.get("account") ?? "").trim();
  if (!account) return { error: "请填写手机号或邮箱（至少一项）" };
  const phone = isPhone(account) ? normalizePhone(account) : null;
  const email = phone ? null : normalizeEmail(account);
  if (!phone && (!email || !z.string().email().safeParse(email).success)) {
    return { error: "格式不正确：请输入 11 位手机号或有效邮箱" };
  }

  // 唯一性冲突：引导走下方「绑定已有账号」（那里已有账密校验）
  if (phone) {
    const dup = await prisma.user.findUnique({ where: { phone } });
    if (dup) return { error: "该手机号已注册，请在下方绑定原账号" };
  } else if (email) {
    const dup = await prisma.user.findUnique({ where: { email } });
    if (dup) return { error: "该邮箱已注册，请在下方绑定原账号" };
  }

  const user = await prisma.user.create({
    data: {
      // 微信早已不下发真实昵称，先给占位名，下一步引导用户自己改（/welcome）
      nickname: `微信用户${String(1000 + crypto.randomInt(9000))}`,
      // 微信账号无密码登录，随机占位 hash 满足非空约束且不可被猜出
      passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10),
      avatarColor: colorFromString(openid),
      wechatOpenid: openid,
      phone,
      email,
    },
  });

  await clearPendingOpenid();
  await createSession(user.id);
  // 新建的微信账号昵称是占位值：打上待设置标记后先进引导页改名，再续原来的身份认证流程
  await setWxNeedNicknameFlag();
  redirect("/welcome");
}

/** 绑定已有账号：校验账号密码后把 openid 挂到该账号，实现微信快捷登录 */
export async function wxBindExistingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const openid = await getPendingOpenid();
  if (!openid) return { error: "微信授权已过期，请重新从微信进入" };

  const account = String(formData.get("account") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!account || !password) return { error: "请输入手机号或邮箱与密码" };

  const user = isPhone(account)
    ? await prisma.user.findUnique({ where: { phone: normalizePhone(account) } })
    : await prisma.user.findUnique({ where: { email: normalizeEmail(account) } });
  if (!user) return { error: "手机号/邮箱或密码不正确" };

  const matched = await bcrypt.compare(password, user.passwordHash);
  if (!matched) return { error: "手机号/邮箱或密码不正确" };

  if (user.status === "DISABLED") {
    return {
      error: `账号已被禁用${user.disabledReason ? `：${user.disabledReason}` : "，请联系运营"}`,
    };
  }
  if (user.wechatOpenid && user.wechatOpenid !== openid) {
    return { error: "该账号已绑定其他微信，请用原微信登录或联系客服" };
  }
  const openidTaken = await prisma.user.findFirst({
    where: { wechatOpenid: openid, id: { not: user.id } },
  });
  if (openidTaken) {
    return { error: "该微信已绑定其他账号，请直接用微信登录" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { wechatOpenid: openid, lastLoginAt: new Date() },
  });
  await clearPendingOpenid();
  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}
