import { NextResponse } from "next/server";

import { applyImageCheckResult, verifyPushSignature, type Suggest } from "@/lib/sec";

/**
 * 微信「消息推送」回调：接收 mediaCheckAsync 图片检测结果（JSON 明文模式）。
 * - GET：接入验证，回显 echostr（需在 MP 后台配置相同的 Token=WX_PUSH_TOKEN）。
 * - POST：解析 wxa_media_check 事件的 trace_id 与 suggest，命中 risky 自动下架对应内容。
 * 生效前提：MP 后台「开发管理 → 消息推送」填 URL=https://www.xiaomaizhipin.com/shipai/api/wx-sec-callback、
 * Token 与服务器 WX_PUSH_TOKEN 一致、数据格式选 JSON、明文模式。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const ok = verifyPushSignature({
    signature: q.get("signature"),
    timestamp: q.get("timestamp"),
    nonce: q.get("nonce"),
  });
  if (!ok) return new NextResponse("invalid signature", { status: 401 });
  return new NextResponse(q.get("echostr") ?? "", { status: 200 });
}

type PushPayload = {
  Event?: string;
  trace_id?: string;
  errcode?: number;
  detail?: Array<{ result?: { suggest?: string } }>;
  result?: { suggest?: string };
};

export async function POST(request: Request) {
  let payload: PushPayload = {};
  try {
    payload = (await request.json()) as PushPayload;
  } catch {
    return NextResponse.json({ ok: false });
  }

  // 仅处理媒体检测异步结果事件，其余一律回 success 以免微信重推
  if (payload.Event === "wxa_media_check" && payload.trace_id) {
    const raw = payload.detail?.[0]?.result?.suggest ?? payload.result?.suggest ?? "pass";
    const suggest = (["pass", "review", "risky"].includes(raw) ? raw : "pass") as Suggest;
    await applyImageCheckResult(payload.trace_id, suggest);
  }

  return NextResponse.json({ ok: true });
}
