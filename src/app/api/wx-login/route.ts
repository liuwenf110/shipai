import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { withBasePath } from "@/lib/base-path";
import { WX_LOGIN_ENABLED } from "@/lib/constants";
import { exchangeWxCode, setPendingOpenid } from "@/lib/wx";

export const dynamic = "force-dynamic";

/** 与既有注册/登录一致的回跳校验：仅接受站内路径 */
function safeNext(value: string | null) {
  const v = value ?? "";
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  return "/";
}

/**
 * 小程序 web-view 微信登录回跳入口：
 * 壳授权页 wx.login 拿 code 后访问 `/api/wx-login?code=xxx&next=/`，
 * 这里换 openid：已绑定 → 直接建会话登录；未绑定 → 暂存 openid 回登录页引导注册/绑定。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const next = safeNext(url.searchParams.get("next"));

  // 重定向用相对 location（不带 origin）：浏览器按当前域解析，避免 Next 把 request.url 归一化成 localhost 导致线上跳错主机
  const redirectTo = (pathname: string, query: string) =>
    new Response(null, {
      status: 307,
      headers: { location: `${withBasePath(pathname)}${query}` },
    });
  const redirectBack = (query: string) => redirectTo("/login", `?${query}`);

  // 微信入口关闭时这个直达链接也要挡住：只隐 UI 的话，小程序壳旧版本仍会带 code 打进来完成免密登录
  if (!WX_LOGIN_ENABLED) {
    return redirectBack(
      `error=${encodeURIComponent("微信登录暂未开放，请使用账号密码登录")}&next=${encodeURIComponent(next)}`,
    );
  }

  const openid = await exchangeWxCode(code);
  if (!openid) {
    return redirectBack(
      `error=${encodeURIComponent("微信登录失败，请在小程序里重试")}&next=${encodeURIComponent(next)}`,
    );
  }

  const user = await prisma.user.findUnique({ where: { wechatOpenid: openid } });
  if (user) {
    if (user.status !== "ACTIVE") {
      return redirectBack(
        `error=${encodeURIComponent("账号已被禁用，请联系运营")}&next=${encodeURIComponent(next)}`,
      );
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await createSession(user.id);
    return redirectTo(next, "");
  }

  await setPendingOpenid(openid);
  return redirectBack(`next=${encodeURIComponent(next)}&from=wxapp`);
}
