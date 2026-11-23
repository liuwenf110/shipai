"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { findEmailOwner, findUserByLoginEmail } from "@/lib/email-identity";
import { notify } from "@/lib/notify";
import { isInviteUsable, normalizeInviteCode } from "@/lib/invite";
import { checkRegisterIpLimit, getClientIp } from "@/lib/rate-limit";
import { colorFromString, isPhone, normalizeEmail, normalizePhone } from "@/lib/utils";
import type { ActionState } from "@/lib/types";

const registerSchema = z
  .object({
    channel: z.enum(["phone", "email"]),
    account: z.string().trim().min(1, "请填写手机号或邮箱"),
    email: z.string().trim(),
    // 昵称不限字符集（中英文均可），上限与资料页保持同为 32 个字符
    nickname: z
      .string()
      .trim()
      .min(2, "昵称至少 2 个字符，支持中英文")
      .max(32, "昵称最多 32 个字符"),
    password: z
      .string()
      .min(8, "密码至少 8 位")
      .regex(/[a-zA-Z]/, "密码需包含字母")
      .regex(/[0-9]/, "密码需包含数字"),
    confirm: z.string(),
    inviteFrom: z.string().optional(),
    inviteCode: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.channel === "phone" && !isPhone(data.account)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["account"], message: "请填写 11 位手机号" });
    }
    // 手机号渠道也必须绑一个常用邮箱（邮箱渠道的账号本身就是邮箱）
    if (
      data.channel === "phone" &&
      !z.string().email().safeParse(normalizeEmail(data.email)).success
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "请填写常用邮箱（用于找回密码）",
      });
    }
    if (
      data.channel === "email" &&
      !z.string().email().safeParse(normalizeEmail(data.account)).success
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["account"], message: "请填写正确的邮箱" });
    }
  })
  .refine((data) => data.password === data.confirm, {
    path: ["confirm"],
    message: "两次输入的密码不一致",
  });

function safeNext(next: FormDataEntryValue | null | undefined) {
  const value = typeof next === "string" ? next : "";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return "/";
}

/** 管理端只允许回跳到 /admin 下的页面 */
function safeAdminNext(next: FormDataEntryValue | null | undefined) {
  const value = typeof next === "string" ? next : "";
  if (value.startsWith("/admin") && !value.startsWith("//")) return value;
  return "/admin";
}

export async function registerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // per-IP 滑动窗口限流：先于昂贵校验，挡住脚本批量注册（新账号后续会触发在职验证码，保护发信账号）
  const ipLimit = checkRegisterIpLimit(await getClientIp());
  if (!ipLimit.allowed) {
    return {
      error: `注册过于频繁，请 ${Math.max(1, Math.ceil(ipLimit.retryAfterSec / 60))} 分钟后再试`,
    };
  }

  const parsed = registerSchema.safeParse({
    channel: String(formData.get("channel") ?? "email"),
    account: String(formData.get("account") ?? ""),
    email: String(formData.get("email") ?? "").trim(),
    nickname: String(formData.get("nickname") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
    inviteFrom: String(formData.get("inviteFrom") ?? ""),
    inviteCode: String(formData.get("inviteCode") ?? ""),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "请检查填写内容", fieldErrors };
  }

  const { channel, account, nickname, password, inviteFrom } = parsed.data;
  const phone = channel === "phone" ? normalizePhone(account) : null;
  // 每个账号都必须绑定邮箱：邮箱渠道即登录账号，手机号渠道取单独填写的邮箱字段
  const email = normalizeEmail(channel === "email" ? account : parsed.data.email);

  // 免责协议必须勾选后才允许注册
  if (String(formData.get("terms") ?? "") !== "true") {
    return {
      error: "请先阅读并同意《上十派平台免责协议》",
      fieldErrors: { terms: "需要勾选同意后才能注册" },
    };
  }

  // 邀请码注册：注册后自动加入该派主管理的派
  const inviteCode = parsed.data.inviteCode ? normalizeInviteCode(parsed.data.inviteCode) : "";
  const invite = inviteCode
    ? await prisma.inviteCode.findUnique({
        where: { code: inviteCode },
        include: { faction: true, leader: { select: { nickname: true } } },
      })
    : null;
  if (inviteCode && !(invite && invite.faction.status === "ACTIVE" && isInviteUsable(invite))) {
    return {
      error: "邀请码无效或已被使用",
      fieldErrors: { inviteCode: "邀请码无效、已被使用或已过期，请向派主重新索取" },
    };
  }

  if (phone) {
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      return { error: "该手机号已注册，请直接登录", fieldErrors: { account: "手机号已注册" } };
    }
  }

  if (email) {
    // 当前邮箱或历史别名被占都视为已注册（历史别名仍属于原账号，不能拿来建新号）
    const owner = await findEmailOwner(email);
    if (owner) {
      return { error: "该邮箱已注册，请直接登录", fieldErrors: { account: "邮箱已注册" } };
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          phone,
          nickname,
          passwordHash,
          avatarColor: colorFromString(nickname),
          bio: invite
            ? `${invite.leader.nickname} 邀请加入`
            : inviteFrom
              ? `${inviteFrom} 邀请加入`
              : null,
        },
      });

      if (invite) {
        const claimed = await tx.inviteCode.updateMany({
          where: { id: invite.id, status: "APPROVED", usedById: null },
          data: { usedById: created.id, usedAt: new Date() },
        });
        if (claimed.count !== 1) throw new Error("INVITE_TAKEN");

        await tx.factionMember.create({
          data: {
            factionId: invite.factionId,
            userId: created.id,
            role: "MEMBER",
            status: "ACTIVE",
          },
        });
        await tx.faction.update({
          where: { id: invite.factionId },
          data: { memberCount: { increment: 1 } },
        });
      }

      return created;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVITE_TAKEN") {
      return {
        error: "邀请码已被使用",
        fieldErrors: { inviteCode: "该邀请码刚被其他新成员使用，请向派主重新索取" },
      };
    }
    throw error;
  }

  if (invite) {
    await notify({
      userId: user.id,
      type: "POST",
      title: `你已加入「${invite.faction.name}」`,
      body: "邀请码注册成功，完成公司身份认证后就能发帖、评论和报名活动。",
      link: `/factions/${invite.faction.slug}`,
    });
    await notify({
      userId: invite.leaderId,
      type: "SYSTEM",
      title: `${nickname} 通过邀请码加入「${invite.faction.name}」`,
      body: "新成员由你的邀请码注册入派，记得欢迎 TA 并提醒完成公司身份认证。",
      link: `/factions/${invite.faction.slug}/manage?tab=members`,
    });
  }

  await createSession(user.id);

  const next = safeNext(formData.get("next"));
  if (next !== "/") redirect(next);
  redirect(invite ? `/verify?welcome=1&invited=${invite.faction.slug}` : "/verify?welcome=1");
}

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const account = String(formData.get("account") ?? formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!account || !password) {
    return { error: "请输入手机号或邮箱与密码" };
  }

  const user = isPhone(account)
    ? await prisma.user.findUnique({ where: { phone: normalizePhone(account) } })
    : await findUserByLoginEmail(normalizeEmail(account));
  if (!user) {
    return { error: "手机号/邮箱或密码不正确" };
  }

  const matched = await bcrypt.compare(password, user.passwordHash);
  if (!matched) {
    return { error: "手机号/邮箱或密码不正确" };
  }

  if (user.status === "DISABLED") {
    return {
      error: `账号已被禁用${user.disabledReason ? `：${user.disabledReason}` : "，请联系运营"}`,
    };
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

/** 管理端登录：只接受运营账号，成功后停留在 /admin 下 */
export async function adminLoginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "请输入运营账号与密码" };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { error: "账号或密码不正确" };
  }

  const matched = await bcrypt.compare(password, user.passwordHash);
  if (!matched) {
    return { error: "账号或密码不正确" };
  }

  if (user.status === "DISABLED") {
    return {
      error: `账号已被禁用${user.disabledReason ? `：${user.disabledReason}` : "，请联系平台负责人"}`,
    };
  }

  if (user.role !== "ADMIN") {
    return { error: "该账号不是运营账号，无法进入管理端" };
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id);
  redirect(safeAdminNext(formData.get("next")));
}

export async function adminLogoutAction() {
  await destroySession();
  redirect("/admin/login");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
