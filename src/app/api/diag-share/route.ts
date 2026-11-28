export const dynamic = "force-dynamic";

/**
 * 临时真机诊断上报口（页内分享定位用）：
 * PostShareButton 在小程序 web-view 分支里 fire-and-forget GET 到这里，
 * 把 bridge/env/via/ok/errMsg 等真机信号 + User-Agent 落到服务日志，
 * 由 `journalctl` 侧读 [DIAG_SHARE] 行即可离线定案，无需用户在手机上转录 toast。
 * 定位完成后连同前端 diag 调用一并移除。
 */
export async function GET(request: Request) {
  const u = new URL(request.url);
  const ua = request.headers.get("user-agent") ?? "";
  const fields = Object.fromEntries(u.searchParams.entries());
  // console.error 走 stderr，被 systemd journal 捕获；加固定前缀方便 grep
  console.error(`[DIAG_SHARE] ${JSON.stringify({ ...fields, ua, ts: Date.now() })}`);
  return new Response(null, { status: 204 });
}
