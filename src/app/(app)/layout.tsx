import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";
import { UnreadSync } from "@/components/UnreadSync";
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
    </div>
  );
}
