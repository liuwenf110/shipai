"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { normalizeEmail } from "@/lib/utils";
import { findEmailOwner } from "@/lib/email-identity";
import { checkUserText, submitUserImageCheck } from "@/lib/sec";
import { saveProofFile } from "@/lib/upload";
import { clearWxNeedNicknameFlag } from "@/lib/wx";
import type { ActionState } from "@/lib/types";

function done(message: string): never {
  redirect(`/me?ok=${encodeURIComponent(message)}`);
}

// 头像允许的 MIME 与大小上限（与派主照片同一口径：saveProofFile 白名单含 PDF/HEIC，头像只收图）
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
const AVATAR_MAX_SIZE = 3 * 1024 * 1024;

/**
 * 用户自助头像：写入 User.avatarImage，与派主照片同一字段、同一展示链（个人主页 / 派主墙 / 帖子评论等）。
 * 支持上传与移除；图片走 mediaCheckAsync 异步送检，命中 risky 由回调清空回落字母头像。
 */
export async function updateAvatarAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser("/me");

  if (formData.get("action") === "remove") {
    await prisma.user.update({ where: { id: user.id }, data: { avatarImage: null } });
    revalidatePath("/me");
    revalidatePath("/");
    revalidatePath("/discover");
    done("已移除头像，将显示字母头像");
  }

  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) return { error: "请选择要上传的头像" };
  if (!AVATAR_TYPES.includes(image.type)) return { error: "头像仅支持 JPG / PNG / WEBP 格式" };
  if (image.size > AVATAR_MAX_SIZE) return { error: "头像不能超过 3MB" };

  let imagePath: string | null;
  try {
    imagePath = await saveProofFile(image);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "头像上传失败" };
  }
  if (!imagePath) return { error: "头像上传失败，请重试" };

  await prisma.user.update({ where: { id: user.id }, data: { avatarImage: imagePath } });
  // scene 1 资料：异步送检，命中违规由回调清空，不阻塞上传
  await submitUserImageCheck(user.id, imagePath, { type: "AVATAR", id: user.id }, 1);

  revalidatePath("/me");
  revalidatePath("/");
  revalidatePath("/discover");
  done("头像已更新");
}

// 昵称不限字符集：中文、英文字母、数字与常见分隔符均可，只限长度
// （英文全名比中文长得多，上限从 16 放到 32，避免 Christopher van der Berg 这类存不下）
const profileSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(2, "昵称至少 2 个字符，支持中英文")
    .max(32, "昵称最多 32 个字符"),
  bio: z.string().trim().max(60, "简介最多 60 个字符"),
  email: z.string().trim().min(1, "请填写常用邮箱").email("邮箱格式不正确"),
});

export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser("/me");

  const parsed = profileSchema.safeParse({
    nickname: String(formData.get("nickname") ?? ""),
    bio: String(formData.get("bio") ?? ""),
    email: String(formData.get("email") ?? ""),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: fieldErrors.nickname ?? parsed.error.issues[0]?.message ?? "请检查填写内容", fieldErrors };
  }

  const { nickname, bio } = parsed.data;
  const email = normalizeEmail(parsed.data.email);
  if (nickname !== user.nickname) {
    const taken = await prisma.user.findFirst({
      where: { nickname, id: { not: user.id } },
      select: { id: true },
    });
    if (taken) return { error: "这个昵称已经被占用了，换一个试试" };
  }
  const oldEmail = user.email;
  if (email !== oldEmail) {
    // 新邮箱既不能是他人当前邮箱，也不能是他人的历史别名
    const owner = await findEmailOwner(email, user.id);
    if (owner) return { error: "该邮箱已被其他账号绑定", fieldErrors: { email: "邮箱已被占用" } };
  }

  const textCheck = await checkUserText(user.id, `${nickname} ${bio}`.trim(), 1);
  if (!textCheck.ok) return { error: "昵称或简介涉及违规信息，请调整后重新保存" };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { nickname, bio: bio || null, email },
    }),
    // 改邮箱：把被替换掉的旧邮箱登记为本账号登录别名，旧邮箱仍可登录且不再允许他人注册
    ...(email !== oldEmail && oldEmail
      ? [
          prisma.emailAlias.upsert({
            where: { email: oldEmail },
            create: { userId: user.id, email: oldEmail },
            update: {},
          }),
        ]
      : []),
  ]);

  revalidatePath("/me");
  revalidatePath("/");
  // 已在资料页自行改过昵称，顺手消掉微信注册的「待设置昵称」引导，避免之后登录再被拦到 /welcome
  await clearWxNeedNicknameFlag();
  done("个人资料已更新");
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser("/me");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current || !next) return { error: "请输入当前密码与新密码" };
  if (next.length < 8) return { error: "新密码至少 8 位" };
  if (!/[a-zA-Z]/.test(next) || !/[0-9]/.test(next)) {
    return { error: "新密码需要同时包含字母和数字" };
  }
  if (next !== confirm) return { error: "两次输入的新密码不一致" };
  if (next === current) return { error: "新密码不能与当前密码相同" };

  const matched = await bcrypt.compare(current, user.passwordHash);
  if (!matched) return { error: "当前密码不正确" };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next, 10) },
  });

  // 改密后让其它设备上的会话立即失效，只保留当前这台
  const jar = await cookies();
  const token = jar.get(process.env.SESSION_COOKIE || "shipai_session")?.value;
  await prisma.session.deleteMany({
    where: { userId: user.id, ...(token ? { id: { not: token } } : {}) },
  });

  done("密码已更新，其它设备需要重新登录");
}
