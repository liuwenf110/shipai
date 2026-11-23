"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { generateCode, isDevMailMode, sendMail } from "@/lib/mail";
import { notify, notifyAdmins } from "@/lib/notify";
import { saveProofFile } from "@/lib/upload";
import { companyScope, identityScopeConflict } from "@/lib/scope";
import { emailDomain, maskEmail, normalizeEmail, splitList } from "@/lib/utils";
import type { ActionState } from "@/lib/types";

const CODE_TTL = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function domainsOf(value: string) {
  return splitList(value.replace(/\s+/g, "")).map((item) => item.toLowerCase());
}

/**
 * 非大厂认证挂靠的系统占位公司行（scope=OUTSIDER、domains 为空）。
 * 借一条真实 Company 行是为了让 Employment 外键、后台审核队列、认证计数全部复用现有链路，
 * 用户自报的在职公司名只写 employerName（仅运营可见），不污染 Company。
 */
async function outsiderCompany() {
  return prisma.company.findFirst({ where: { scope: "OUTSIDER" }, orderBy: { createdAt: "asc" } });
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

  // 邮箱自动通过只对 12 家大厂开放，非大厂占位公司行没有域名库，只能走材料人工审核
  if (companyScope(company) === "OUTSIDER") {
    return { error: "非大厂身份请提交在职证明材料，由运营人工审核" };
  }
  // 已经认证过非大厂的人不能再点亮大厂厂牌，否则人群口径会把他算回大厂
  const conflict = await identityScopeConflict(user.id, "CORP");
  if (conflict) return { error: conflict };

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

  // 大厂离职校友仍归大厂口径，先过一次身份互斥闸：已在审核/已通过非大厂的不放行
  const conflict = await identityScopeConflict(user.id, companyScope(company));
  if (conflict) return { error: conflict };

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

/** 非大厂在职：自报公司 + 在职证明材料，走人工审核 */
export async function submitOutsiderProof(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "请先登录" };

  const company = await outsiderCompany();
  if (!company) return { error: "非大厂认证暂未开放，请联系运营" };

  const employerName = String(formData.get("employerName") ?? "").trim().slice(0, 40);
  const title = String(formData.get("title") ?? "").trim();
  const proofNote = String(formData.get("proofNote") ?? "").trim();
  const file = formData.get("proof");

  if (!employerName) {
    return { error: "请填写你就职的公司名称", fieldErrors: { employerName: "必填" } };
  }
  if (!proofNote) {
    return { error: "请简单说明材料能证明的在职信息", fieldErrors: { proofNote: "必填" } };
  }

  // 与大厂侧互斥：已认证 / 正在认证大厂的人不能走非大厂
  const conflict = await identityScopeConflict(user.id, "OUTSIDER");
  if (conflict) return { error: conflict };

  // 文件上传不可回填，先把必然失败的校验做完，避免用户白传一次材料
  const existing = await prisma.employment.findUnique({
    where: { userId_companyId_kind: { userId: user.id, companyId: company.id, kind: "ACTIVE" } },
  });
  if (existing?.status === "VERIFIED") return { error: "你的非大厂身份已认证通过" };
  if (existing?.status === "PENDING") return { error: "材料已提交，运营正在审核，请耐心等待" };

  let proofPath: string | null = null;
  try {
    proofPath = await saveProofFile(file instanceof File ? file : null);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "材料上传失败" };
  }
  if (!proofPath) {
    return { error: "请上传工牌 / 在职证明 / 社保记录截图", fieldErrors: { proof: "必填" } };
  }

  const data = {
    status: "PENDING",
    method: "MANUAL",
    employerName,
    title: title || null,
    startedYear: null,
    leftYear: null,
    proofFiles: proofPath,
    proofNote,
    verifyCode: null,
    codeExpiresAt: null,
    attempts: 0,
    reviewerNote: null,
    reviewedAt: null,
  };

  await prisma.employment.upsert({
    where: { userId_companyId_kind: { userId: user.id, companyId: company.id, kind: "ACTIVE" } },
    create: { userId: user.id, companyId: company.id, kind: "ACTIVE", ...data },
    update: data,
  });

  await notifyAdmins({
    type: "VERIFY",
    title: `新的非大厂身份待审核：${user.nickname} · ${employerName}`,
    body: proofNote.slice(0, 60),
    link: "/admin/verifications",
  });

  revalidatePath("/verify");
  revalidatePath("/admin/verifications");

  return { ok: true, message: "材料已提交，通常 1 个工作日内完成审核" };
}
