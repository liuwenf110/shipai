import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { adminLogoutAction } from "@/lib/actions/auth";
import { Avatar } from "@/components/Avatar";
import { Logo } from "@/components/Logo";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";
import { ConfirmSubmit } from "@/components/content/ConfirmSubmit";
import { AdminNav, type AdminNavItem } from "@/components/admin/AdminNav";

export const metadata = { title: "运营管理端" };

const NAV: AdminNavItem[] = [
  { href: "/admin", label: "数据概览", icon: "home", key: "overview" },
  { href: "/admin/verifications", label: "身份审核", icon: "shield", key: "verifications" },
  { href: "/admin/leaders", label: "派主认证", icon: "flag", key: "leaders" },
  { href: "/admin/joins", label: "加入申请", icon: "users", key: "joins" },
  { href: "/admin/invites", label: "邀请码", icon: "sparkle", key: "invites" },
  { href: "/admin/factions", label: "兴趣派", icon: "compass", key: "factions" },
  { href: "/admin/leader-wall", label: "派主墙", icon: "users", key: "leaderWall" },
  { href: "/admin/posts", label: "内容治理", icon: "message", key: "posts" },
  { href: "/admin/comments", label: "评论治理", icon: "edit", key: "comments" },
  { href: "/admin/activities", label: "活动治理", icon: "calendar", key: "activities" },
  { href: "/admin/reports", label: "举报治理", icon: "flag", key: "reports" },
  { href: "/admin/users", label: "成员管理", icon: "users", key: "users" },
  { href: "/admin/notifications", label: "消息中心", icon: "bell", key: "notifications" },
  { href: "/admin/logs", label: "操作日志", icon: "shield", key: "logs" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  const [
    pendingVerifications,
    pendingLeaders,
    pendingJoins,
    pendingInvites,
    reviewingFactions,
    hiddenComments,
    pendingReports,
    pendingViewRequests,
  ] = await Promise.all([
    prisma.employment.count({ where: { status: "PENDING" } }),
    prisma.leaderApplication.count({ where: { status: "PENDING" } }),
    prisma.factionMember.count({ where: { status: "PENDING" } }),
    prisma.inviteCode.count({ where: { status: "PENDING" } }),
    prisma.faction.count({ where: { status: "REVIEWING" } }),
    prisma.comment.count({ where: { status: "HIDDEN" } }),
    prisma.report.count({ where: { status: "PENDING" } }),
    prisma.memberViewRequest.count({ where: { status: "PENDING" } }),
  ]);

  const counts: Record<string, number> = {
    verifications: pendingVerifications,
    leaders: pendingLeaders,
    // 「加入申请」徽标并入成员列表查看申请：两类审核共用同一后台队列
    joins: pendingJoins + pendingViewRequests,
    invites: pendingInvites,
    factions: reviewingFactions,
    comments: hiddenComments,
    reports: pendingReports,
  };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-ink-line/70 bg-cream/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold text-white">
              管理端
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="btn-quiet btn-sm">
              返回用户端
            </Link>
            <form action={adminLogoutAction}>
              <ConfirmSubmit
                className="btn-quiet btn-sm"
                confirmText="确定要退出管理端吗？"
                pendingText="退出中…"
              >
                退出
              </ConfirmSubmit>
            </form>
            <Avatar name={admin.nickname} color={admin.avatarColor} size="sm" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-4 md:grid md:grid-cols-[190px_1fr] md:gap-5">
        <aside className="mb-3 md:mb-0">
          <AdminNav items={NAV} counts={counts} />
          <div className="mt-3 hidden rounded-xl bg-white/70 p-3 text-[10.5px] leading-relaxed text-ink-mute ring-1 ring-ink-line/60 md:block">
            审核原则：材料能证明「该公司在职或离职」即可通过；无法辨认、疑似盗用一律驳回并写明原因。
          </div>
        </aside>

        <main className="min-w-0 pb-12">{children}</main>
      </div>

      {/* 运营停留在后台也算在线，否则只看后台的账号会被误判离线 */}
      <PresenceHeartbeat />
    </div>
  );
}
