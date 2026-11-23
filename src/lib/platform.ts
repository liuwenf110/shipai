import "server-only";
import { headers } from "next/headers";

/**
 * 是否运行在微信小程序 web-view 内。
 * 依据：web-view 请求的 User-Agent 固定包含 "miniProgram"（开发者工具模拟器与真机均如此），
 * 服务端渲染阶段即可判定，避免客户端再切换布局造成闪烁。
 */
export async function isMiniProgramWebView(): Promise<boolean> {
  const ua = (await headers()).get("user-agent") ?? "";
  return /miniprogram/i.test(ua);
}
