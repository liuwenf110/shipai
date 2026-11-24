import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";
import { UnreadSync } from "@/components/UnreadSync";
import { VerifyGate } from "@/components/VerifyGate";
import { MpShareBeacon } from "@/components/MpShareBeacon";
import { getViewer } from "@/lib/auth";
import { isMiniProgramWebView } from "@/lib/platform";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [viewer, miniProgram] = await Promise.all([getViewer(), isMiniProgramWebView()]);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar viewer={viewer} miniProgram={miniProgram} />
      <main className="flex-1 pb-24 md:pb-12">{children}</main>
      <BottomNav unreadCount={viewer?.unreadCount ?? 0} unreadMessages={viewer?.unreadMessages ?? 0} signedIn={Boolean(viewer)} />
      {viewer ? <PresenceHeartbeat /> : null}
      {/* 读完私信/通知后角标实时追平（路由切换/回前台时 refresh layout 取数） */}
      {viewer ? <UnreadSync /> : null}
      {/* 小程序 web-view 内：每页自动向壳 postMessage 当前页 path+title，保证右上角“发送给朋友”卡片落到当前页而非首页 */}
      {miniProgram ? <MpShareBeacon /> : null}
      {/* 注册完/未认证账号登录后先盖一层认证引导，过不了认证看不到站内页面（审核中可临时放行） */}
      {viewer && viewer.user.role !== "ADMIN" ? (
        <VerifyGate
          verified={viewer.isVerified}
          pending={viewer.pendingEmployments.length > 0}
          nickname={viewer.user.nickname}
        />
      ) : null}
    </div>
  );
}
