"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { generateCode, isDevMailMode, sendMail } from "@/lib/mail";
import { notify, notifyAdmins } from "@/lib/notify";
import { saveProofFile } from "@/lib/upload";
import { emailDomain, maskEmail, normalizeEmail, splitList } from "@/lib/utils";
import type { ActionState } from "@/lib/types";

const CODE_TTL = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function domainsOf(value: string) {
  return splitList(value.replace(/\s+/g, "")).map((item) => item.toLowerCase());
}

/** 在职：校验企业邮箱域名并下发验证码 */
export async function sendWorkEmailCode(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  const companyId = String(formData.get("companyId") ?? "");
  const workEmail = normalizeEmail(String(formData.get("workEmail") ?? ""));

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return { error: "公司不存在" };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail)) {
    return { error: "请输入正确的企业邮箱", fieldErrors: { workEmail: "邮箱格式不正确" } };
  }

  const domain = emailDomain(workEmail);
  if (!domainsOf(company.domains).includes(domain)) {
    return {
      error: `「${domain}」不是 ${company.name} 的企业邮箱域名，请确认邮箱，或改用离职材料认证`,
      fieldErrors: { workEmail: "域名与企业不符" },
    };
  }

  const existing = await prisma.employment.findUnique({
    where: { userId_companyId_kind: { userId: user.id, companyId, kind: "ACTIVE" } },
  });
  if (existing?.status === "VERIFIED") return { error: "该公司在职身份已认证通过" };

  // 真实 SMTP 有频率与配额限制，同一邮箱 60 秒内只发一次
  const lastSentAt = existing?.codeExpiresAt
    ? existing.codeExpiresAt.getTime() - CODE_TTL
    : 0;
  if (lastSentAt && Date.now() - lastSentAt < 60_000) {
    return { error: "验证码发送过于频繁，请 1 分钟后再试" };
  }

  const code = generateCode();
  const data = {
    status: "PENDING",
    method: "EMAIL",
    workEmail,
    verifyCode: code,
    codeExpiresAt: new Date(Date.now() + CODE_TTL),
    attempts: 0,
    reviewerNote: null,
  };

  await prisma.employment.upsert({
    where: {
      userId_companyId_kind: { userId: user.id, companyId, kind: "ACTIVE" },
    },
    create: { userId: user.id, companyId, kind: "ACTIVE", ...data },
    update: data,
  });

  const delivery = await sendMail({
    to: workEmail,
    subject: `【上十派】${company.name}在职身份验证码：${code}`,
    body: [
      `${user.nickname} 你好：`,
      `你正在验证 ${company.name} 的在职身份，验证码 ${code}，10 分钟内有效。`,
      "如非本人操作请忽略本邮件。",
    ].join("\n"),
    code,
  });

  if (!delivery.delivered && !isDevMailMode()) {
    return {
      error: delivery.capped
        ? "系统今日邮件发送已达上限，请稍后再试；也可以改用离职材料认证"
        : "验证码邮件发送失败，请稍后重试；也可以改用离职材料认证",
    };
  }

  return {
    ok: true,
    message: `验证码已发送至 ${maskEmail(workEmail)}`,
    masked: maskEmail(workEmail),
    devCode: isDevMailMode() ? code : undefined,
  };
}

/** 在职：校验验证码 */
export async function confirmWorkEmailCode(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  const companyId = String(formData.get("companyId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");

  const employment = await prisma.employment.findUnique({
    where: { userId_companyId_kind: { userId: user.id, companyId, kind: "ACTIVE" } },
    include: { company: true },
  });

  if (!employment || !employment.verifyCode) {
    return { error: "请先获取验证码" };
  }
  if (employment.status === "VERIFIED") {
    return { error: "该公司在职身份已认证通过" };
  }
  if (!employment.codeExpiresAt || employment.codeExpiresAt.getTime() < Date.now()) {
    return { error: "验证码已过期，请重新获取" };
  }
  if (employment.attempts >= MAX_ATTEMPTS) {
    return { error: "验证码错误次数过多，请重新获取" };
  }
  if (code !== employment.verifyCode) {
    await prisma.employment.update({
      where: { id: employment.id },
      data: { attempts: { increment: 1 } },
    });
    return { error: "验证码不正确，请检查邮件" };
  }

  await prisma.$transaction([
    prisma.employment.update({
      where: { id: employment.id },
      data: {
        status: "VERIFIED",
        verifiedAt: new Date(),
        verifyCode: null,
        codeExpiresAt: null,
      },
    }),
    prisma.company.update({
      where: { id: companyId },
      data: { verifiedCount: { increment: 1 } },
    }),
  ]);

  await notify({
    userId: user.id,
    type: "VERIFY",
    title: `${employment.company.name} 在职身份认证通过`,
    body: "现在可以加入该公司旗下的兴趣派了。",
    link: "/discover",
  });

  revalidatePath("/verify");
  revalidatePath("/");
  revalidatePath("/me");

  return { ok: true, message: "认证通过，去挑一个兴趣派吧" };
}

/** 离职 / 无企业邮箱：提交材料，进入人工审核 */
export async function submitAlumniProof(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  const companyId = String(formData.get("companyId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const startedYear = Number(formData.get("startedYear") ?? 0) || null;
  const leftYear = Number(formData.get("leftYear") ?? 0) || null;
  const proofNote = String(formData.get("proofNote") ?? "").trim();
  const file = formData.get("proof");

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return { error: "公司不存在" };

  if (!proofNote) {
    return { error: "请简单说明你能证明的离职信息", fieldErrors: { proofNote: "必填" } };
  }
  if (leftYear && startedYear && leftYear < startedYear) {
    return { error: "离职年份不能早于入职年份" };
  }

  // 文件上传不可回填，先把必然失败的校验做完，避免用户白传一次材料
  const existing = await prisma.employment.findUnique({
    where: { userId_companyId_kind: { userId: user.id, companyId, kind: "ALUMNI" } },
  });

  if (existing?.status === "VERIFIED") {
    return { error: "你的离职身份已认证通过" };
  }
  if (existing?.status === "PENDING") {
    return { error: "材料已提交，运营正在审核，请耐心等待" };
  }

  let proofPath: string | null = null;
  try {
    proofPath = await saveProofFile(file instanceof File ? file : null);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "材料上传失败" };
  }

  if (!proofPath) {
    return { error: "请上传离职证明 / 工牌 / 社保记录截图", fieldErrors: { proof: "必填" } };
  }

  const data = {
    status: "PENDING",
    method: "MANUAL",
    title: title || null,
    startedYear,
    leftYear,
    proofFiles: proofPath,
    proofNote,
    verifyCode: null,
    codeExpiresAt: null,
    attempts: 0,
    reviewerNote: null,
    reviewedAt: null,
  };

  await prisma.employment.upsert({
    where: { userId_companyId_kind: { userId: user.id, companyId, kind: "ALUMNI" } },
    create: { userId: user.id, companyId, kind: "ALUMNI", ...data },
    update: data,
  });

  await notifyAdmins({
    type: "VERIFY",
    title: `新的离职身份待审核：${user.nickname} · ${company.name}`,
    body: proofNote.slice(0, 60),
    link: "/admin/verifications",
  });

  revalidatePath("/verify");
  revalidatePath("/admin/verifications");

  return { ok: true, message: "材料已提交，通常 1 个工作日内完成审核" };
}
