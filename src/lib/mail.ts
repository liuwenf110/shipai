import "server-only";

import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@/lib/db";
import { notifyAdmins } from "@/lib/notify";

/** SMTP 是否配置完整 */
export function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** 是否为开发模式（未配置 SMTP 或显式开启 DEV_MODE 时，验证码只写入站内信箱并回显） */
export function isDevMailMode() {
  return !isSmtpConfigured() || process.env.NEXT_PUBLIC_DEV_MODE === "true";
}

/** 全局每日 SMTP 发送上限（保护 QQ 发信账号不被刷爆，可按邮箱平台实际额度调整） */
const DAILY_LIMIT = Number(process.env.MAIL_DAILY_LIMIT || 200);
/** 达到该比例即向管理员告警 */
const WARN_RATIO = 0.8;
// 进程内去重：每天最多发一次「接近上限」告警，避免每封都刷通知
let lastWarnDay = "";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function generateCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

let transporter: Transporter | null = null;

/** 复用同一个 SMTP 连接池；QQ 邮箱需使用授权码作为密码 */
function getTransporter() {
  if (transporter) return transporter;

  const port = Number(process.env.SMTP_PORT || 465);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

type MailInput = {
  to: string;
  subject: string;
  body: string;
  code?: string;
};

export type MailResult = {
  /** 是否真正投递到了收件人邮箱 */
  delivered: boolean;
  /** 失败原因，仅用于服务端日志 */
  error?: string;
  /** 是否因触发全局每日发送上限而被拒发（此时未真正投递，调用方宜给专门话术） */
  capped?: boolean;
};

function describeTransporter() {
  return `${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 465}`;
}

/**
 * 发送邮件：配置了 SMTP 且未开启 DEV_MODE 时走真实投递，
 * 同时把每一封邮件留痕到 MailMessage 表，便于运营排查与本地联调。
 */
export async function sendMail({ to, subject, body, code }: MailInput): Promise<MailResult> {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@changpai.app";
  const shouldDeliver = !isDevMailMode();

  let delivered = false;
  let error: string | undefined;

  if (shouldDeliver) {
    // 以今天已留痕的 MailMessage 行数作为当日 SMTP 发信量代理指标
    const dayStart = startOfToday();
    const sentToday = await prisma.mailMessage.count({ where: { createdAt: { gte: dayStart } } });

    // 接近阈值告警（每天最多一次）
    const todayKey = dayStart.toISOString().slice(0, 10);
    if (
      sentToday >= Math.floor(DAILY_LIMIT * WARN_RATIO) &&
      sentToday < DAILY_LIMIT &&
      lastWarnDay !== todayKey
    ) {
      lastWarnDay = todayKey;
      await notifyAdmins({
        type: "SYSTEM",
        title: "邮件发送接近今日上限",
        body: `今日已发 ${sentToday}/${DAILY_LIMIT} 封，请留意发信频率，避免触发邮箱平台风控`,
        link: "/admin",
      }).catch(() => {});
    }

    // 已达上限：直接拒发，且不落库留痕（否则会计入当日发信量导致永远无法恢复）
    if (sentToday >= DAILY_LIMIT) {
      console.error(`[mail] 今日 SMTP 发送已达上限 ${DAILY_LIMIT}，已拒发本封（收件人：${to}）`);
      return {
        delivered: false,
        capped: true,
        error: `今日系统邮件发送已达上限（${DAILY_LIMIT} 封），请稍后再试`,
      };
    }

    try {
      await getTransporter().sendMail({ from, to, subject, text: body });
      delivered = true;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      console.error(`[mail] 通过 ${describeTransporter()} 发送失败：`, error);
    }
  }

  const trace = delivered
    ? `已通过 SMTP 投递（发件人：${from}）`
    : shouldDeliver
      ? `SMTP 投递失败，仅站内留存（发件人：${from}）`
      : `开发模式，仅站内留存（发件人：${from}）`;

  await prisma.mailMessage.create({
    data: { to, subject, body: `${trace}\n\n${body}`, code },
  });

  return { delivered, error };
}
