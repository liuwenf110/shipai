import "server-only";

import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { withBasePath } from "@/lib/base-path";

/**
 * 内容安全（社交类目合规）：
 * - 文本：微信 msgSecCheck v2，命中 risky 阻断发布；review 放行但记录。
 * - 图片：mediaCheckAsync v2 异步送检，结果由「消息推送」回调按 trace_id 自动下架。
 * v2 接口强制要求近 2 小时内访问过小程序的 openid；无 openid / 凭据缺失 / 调用异常一律
 * fail-open（放行），避免误伤正常用户，另有举报 + 后台人工审核兜底。
 * 凭据仅存于服务端 .env：WX_APPID / WX_SECRET / WX_PUSH_TOKEN / WX_PUBLIC_ORIGIN。
 */

const APPID = process.env.WX_APPID;
const SECRET = process.env.WX_SECRET;
const PUSH_TOKEN = process.env.WX_PUSH_TOKEN ?? "";
const ORIGIN = process.env.WX_PUBLIC_ORIGIN ?? "https://www.xiaomaizhipin.com";
const API = "https://api.weixin.qq.com";

export type Suggest = "pass" | "review" | "risky" | "skip";

// 进程内 access_token 缓存，过期前 60s 重新拉取
let tokenCache: { value: string; expiresAt: number } | null = null;

export async function getStableAccessToken(): Promise<string | null> {
  if (!APPID || !SECRET) return null;
  const now = Date.now();
  if (tokenCache && tokenCache.value && tokenCache.expiresAt > now + 60_000) return tokenCache.value;
  try {
    const res = await fetch(`${API}/cgi-bin/stable_token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credential", appid: APPID, secret: SECRET }),
    });
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    tokenCache = { value: data.access_token, expiresAt: now + (data.expires_in ?? 7200) * 1000 };
    return tokenCache.value;
  } catch {
    return null;
  }
}

async function openidOf(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { wechatOpenid: true } });
  return u?.wechatOpenid ?? null;
}

/** 文本安全检测。scene: 1 资料 2 评论 3 论坛 4 社交日志 */
export async function checkUserText(
  userId: string,
  content: string,
  scene = 2,
): Promise<{ ok: boolean; suggest: Suggest }> {
  const text = content.trim();
  if (!text) return { ok: true, suggest: "skip" };
  const openid = await openidOf(userId);
  if (!openid) return { ok: true, suggest: "skip" };
  const token = await getStableAccessToken();
  if (!token) return { ok: true, suggest: "skip" };
  try {
    const res = await fetch(`${API}/wxa/msg_sec_check?access_token=${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: text.slice(0, 2000), version: "2", openid, scene }),
    });
    const data = (await res.json()) as { errcode?: number; result?: { suggest?: string } };
    if (data.errcode) return { ok: true, suggest: "skip" };
    const suggest = (data.result?.suggest ?? "pass") as Suggest;
    return { ok: suggest !== "risky", suggest };
  } catch {
    return { ok: true, suggest: "skip" };
  }
}

/** 图片异步送检。relPath 为库中相对路径（/uploads/xxx）；target 供回调定位下架对象。
 * scene：1 资料 2 评论 3 论坛 4 社交日志，头像等资料位传 1 */
export async function submitUserImageCheck(
  userId: string,
  relPath: string,
  target: { type: "POST" | "COMMENT" | "AVATAR"; id: string },
  scene = 2,
): Promise<boolean> {
  const openid = await openidOf(userId);
  if (!openid) return false;
  const token = await getStableAccessToken();
  if (!token) return false;
  try {
    const mediaUrl = `${ORIGIN}${withBasePath(relPath)}`;
    const res = await fetch(`${API}/wxa/media_check_async?access_token=${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ media_url: mediaUrl, media_type: 1, version: "2", openid, scene }),
    });
    const data = (await res.json()) as { errcode?: number; trace_id?: string };
    if (data.errcode || !data.trace_id) return false;
    await prisma.secCheckLog.create({
      data: { traceId: data.trace_id, targetType: target.type, targetId: target.id, openid },
    });
    return true;
  } catch {
    return false;
  }
}

/** 校验微信「消息推送」GET 验证签名（token/timestamp/nonce 字典序拼接 sha1） */
export function verifyPushSignature(query: {
  signature?: string | null;
  timestamp?: string | null;
  nonce?: string | null;
}): boolean {
  if (!PUSH_TOKEN) return false;
  const arr = [PUSH_TOKEN, query.timestamp ?? "", query.nonce ?? ""].sort();
  const sha = crypto.createHash("sha1").update(arr.join("")).digest("hex");
  return sha === (query.signature ?? "");
}

/** 回调回填检测结果；risky 时下架对应帖子/评论，头像则直接清空回落字母头像 */
export async function applyImageCheckResult(traceId: string, suggest: Suggest): Promise<void> {
  const log = await prisma.secCheckLog.findUnique({ where: { traceId } });
  if (!log) return;
  await prisma.secCheckLog.update({ where: { traceId }, data: { suggest, checkedAt: new Date() } });
  if (suggest !== "risky") return;
  if (log.targetType === "POST") {
    await prisma.post.update({ where: { id: log.targetId }, data: { status: "HIDDEN" } }).catch(() => {});
  } else if (log.targetType === "COMMENT") {
    await prisma.comment.update({ where: { id: log.targetId }, data: { status: "HIDDEN" } }).catch(() => {});
  } else if (log.targetType === "AVATAR") {
    await prisma.user
      .update({ where: { id: log.targetId }, data: { avatarImage: null } })
      .catch(() => {});
  }
}
