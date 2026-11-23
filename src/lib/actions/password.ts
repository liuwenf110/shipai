"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { generateCode, isDevMailMode, sendMail } from "@/lib/mail";
import { findUserByLoginEmail } from "@/lib/email-identity";
import { maskEmail, normalizeEmail } from "@/lib/utils";
import type { ActionState } from "@/lib/types";

/**
 * 忘记密码：邮箱验证码找回。与在职认证（verify.ts）同一套模式——
 * 6 位码 10 分钟有效、同一邮箱 60 秒内只发一次、错误上限 5 次、校验通过即登出全部旧会话。
 * 防账号枚举：邮箱未注册时也回同一句成功话术，仅命中账号才真正发信。
 */

const CODE_TTL = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function sendResetCode(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!isEmail(email)) {
    return { error: "请输入正确的邮箱", fieldErrors: { email: "邮箱格式不正确" } };
  }

  const user = await findUserByLoginEmail(email);
  // 未注册（含无别名命中）：回成功话术但不发信，避免被用来探测邮箱是否注册
  if (!user) {
    return { ok: true, message: "若该邮箱已注册，重置验证码已发送，请查收邮件（10 分钟内有效）" };
  }
  if (user.status === "DISABLED") {
    return { error: "该账号已被禁用，请联系运营" };
  }

  // 真实 SMTP 有频率与配额限制，同一邮箱 60 秒内只发一次
  const lastSentAt = user.resetCodeExpiresAt ? user.resetCodeExpiresAt.getTime() - CODE_TTL : 0;
  if (lastSentAt && Date.now() - lastSentAt < 60_000) {
    return { error: "验证码发送过于频繁，请 1 分钟后再试" };
  }

  const code = generateCode();
  await prisma.user.update({
    where: { id: user.id },
    data: { resetCode: code, resetCodeExpiresAt: new Date(Date.now() + CODE_TTL), resetAttempts: 0 },
  });

  // 无论填的是当前邮箱还是旧别名，验证码都发到账号当前邮箱（旧邮箱可能已失效不可投递）
  const target = user.email ?? email;
  const delivery = await sendMail({
    to: target,
    subject: `【上十派】登录密码重置验证码：${code}`,
    body: [
      `${user.nickname} 你好：`,
      `你正在重置登录密码，验证码 ${code}，10 分钟内有效。`,
      "如非本人操作请忽略本邮件，切勿把验证码告知他人。",
    ].join("\n"),
    code,
  });

  if (!delivery.delivered && !isDevMailMode()) {
    return {
      error: delivery.capped
        ? "重置邮件今日发送已达上限，请稍后再试"
        : "重置邮件发送失败，请稍后重试",
    };
  }

  return {
    ok: true,
    message: `重置验证码已发送至 ${maskEmail(target)}`,
    masked: maskEmail(target),
    devCode: isDevMailMode() ? code : undefined,
  };
}

export async function confirmResetCode(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!isEmail(email)) return { error: "邮箱不正确，请重新获取验证码" };
  if (password.length < 8) return { error: "密码至少 8 位", fieldErrors: { password: "至少 8 位" } };
  if (!/[a-zA-Z]/.test(password))
    return { error: "密码需包含字母", fieldErrors: { password: "需包含字母" } };
  if (!/[0-9]/.test(password))
    return { error: "密码需包含数字", fieldErrors: { password: "需包含数字" } };
  if (password !== confirm)
    return { error: "两次输入的密码不一致", fieldErrors: { confirm: "两次不一致" } };

  const user = await findUserByLoginEmail(email);
  if (!user || !user.resetCode) return { error: "请先获取验证码" };
  if (!user.resetCodeExpiresAt || user.resetCodeExpiresAt.getTime() < Date.now()) {
    return { error: "验证码已过期，请重新获取" };
  }
  if (user.resetAttempts >= MAX_ATTEMPTS) {
    return { error: "验证码错误次数过多，请重新获取" };
  }
  if (code !== user.resetCode) {
    await prisma.user.update({
      where: { id: user.id },
      data: { resetAttempts: { increment: 1 } },
    });
    return { error: "验证码不正确，请检查邮件" };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetCode: null, resetCodeExpiresAt: null, resetAttempts: 0 },
    }),
    // 找回成功后登出该账号所有旧会话，旧设备需重新登录
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);

  return { ok: true, message: "密码已重置，请用新密码登录" };
}
