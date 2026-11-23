import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { WxLoginButton } from "@/components/auth/WxLoginButton";
import { WxSetupPanel } from "@/components/auth/WxSetupPanel";
import { QueryNotice } from "@/components/Notice";
import { getCurrentUser } from "@/lib/auth";
import { WX_LOGIN_ENABLED } from "@/lib/constants";
import { isMiniProgramWebView } from "@/lib/platform";
import { getPendingOpenid } from "@/lib/wx";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; from?: string; error?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(params.next && params.next.startsWith("/") ? params.next : "/");

  const next = params.next && params.next.startsWith("/") ? params.next : "/";
  // 小程序 web-view 回跳后暂存的 openid：首次微信登录待注册/绑定（微信入口关闭时一并忽略残留 cookie）
  const pendingWxOpenid = WX_LOGIN_ENABLED ? await getPendingOpenid() : null;
  // URL 参数或 UA 任一命中即视为小程序内（H5 内部跳转后 from 参数会丢失，UA 始终存在）
  const inMiniProgram = WX_LOGIN_ENABLED && (params.from === "wxapp" || (await isMiniProgramWebView()));

  return (
    <div>
      <h1 className="text-[26px] font-black tracking-tight text-ink">欢迎回到上十派</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-mute">
        登录后查看你所在公司的兴趣派与派内动态。
      </p>

      <div className="mt-4 space-y-4">
        {params.error ? <QueryNotice error={params.error} /> : null}
        {pendingWxOpenid ? <WxSetupPanel next={next} /> : null}
        {!pendingWxOpenid && inMiniProgram ? <WxLoginButton /> : null}
      </div>

      <div className="mt-6">
        <LoginForm next={next} />
      </div>
    </div>
  );
}
