"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { checkUserText } from "@/lib/sec";
import { clearWxNeedNicknameFlag, hasWxNeedNicknameFlag } from "@/lib/wx";
import type { ActionState } from "@/lib/types";

/**
 * 微信注册后的昵称引导：/welcome 页的两个动作。
 * 校验口径与注册页、资料页保持一致（2-32 字符、中英文均可、查重 + 内容安全），
 * 差异只在于本流程允许跳过（保留「微信用户XXXX」占位昵称）。
 */
const nicknameSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(2, "昵称至少 2 个字符，支持中英文")
    .max(32, "昵称最多 32 个字符"),
});

export async function setWxNicknameAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser("/verify");

  const parsed = nicknameSchema.safeParse({
    nickname: String(formData.get("nickname") ?? ""),
  });
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "请填写昵称";
    return { error: message, fieldErrors: { nickname: message } };
  }

  const nickname = parsed.data.nickname;
  if (nickname !== user.nickname) {
    const taken = await prisma.user.findFirst({
      where: { nickname, id: { not: user.id } },
      select: { id: true },
    });
    if (taken) {
      const message = "这个昵称已经被占用了，换一个试试";
      return { error: message, fieldErrors: { nickname: message } };
    }
  }

  const textCheck = await checkUserText(user.id, nickname, 1);
  if (!textCheck.ok) {
    const message = "昵称涉及违规信息，换一个试试";
    return { error: message, fieldErrors: { nickname: message } };
  }

  await prisma.user.update({ where: { id: user.id }, data: { nickname } });
  await clearWxNeedNicknameFlag();
  redirect("/verify?welcome=1");
}

/** 跳过引导：保留默认昵称直接去身份认证；标记缺失（过期/直达链接）时留在本页并说明原因，避免静默无响应 */
export async function skipWxNicknameAction(_prev: ActionState): Promise<ActionState> {
  await requireUser("/verify");
  if (!(await hasWxNeedNicknameFlag())) {
    return { error: "昵称引导已过期，可直接去资料页修改昵称" };
  }
  await clearWxNeedNicknameFlag();
  redirect("/verify?welcome=1");
}
