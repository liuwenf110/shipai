import Link from "next/link";
import { prisma } from "@/lib/db";
import { ADMIN_USER } from "@/lib/api";
import { SITE_FLAGS, getSiteFlag } from "@/lib/settings";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Icon } from "@/components/Icon";
import { timeAgo } from "@/lib/utils";

export default async function AdminOverviewPage() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    pendingVerifications,
    pendingLeaders,
    pendingJoins,
    activeFactions,
    reviewingFactions,
    verifiedUsers,
    postCount,
    newUsers,
    newPosts,
    newComments,
    newVerifications,
    disabledUsers,
    auditTotal,
    recentVerifications,
    recentLeaders,
    recentAudits,
    leaderWallOn,
  ] = await Promise.all([
    prisma.employment.count({ where: { status: "PENDING" } }),
    prisma.leaderApplication.count({ where: { status: "PENDING" } }),
    prisma.factionMember.count({ where: { status: "PENDING" } }),
    prisma.faction.count({ where: { status: "ACTIVE" } }),
    prisma.faction.count({ where: { status: "REVIEWING" } }),
    prisma.user.count({ where: { employments: { some: { status: "VERIFIED" } } } }),
    prisma.post.count({ where: { status: "PUBLISHED" } }),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.post.count({ where: { createdAt: { gte: weekAgo }, status: "PUBLISHED" } }),
    prisma.comment.count({ where: { createdAt: { gte: weekAgo }, status: "PUBLISHED" } }),
    prisma.employment.count({ where: { verifiedAt: { gte: weekAgo } } }),
    prisma.user.count({ where: { status: "DISABLED" } }),
    prisma.auditLog.count(),
    prisma.employment.findMany({
      where: { status: "PENDING" },
      include: { user: { select: ADMIN_USER }, company: true },
      orderBy: { createdAt: "asc" },
      take: 4,
    }),
    prisma.leaderApplication.findMany({
      where: { status: "PENDING" },
      include: { user: { select: ADMIN_USER }, faction: { include: { company: true } } },
      orderBy: { createdAt: "asc" },
      take: 4,
    }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    getSiteFlag(SITE_FLAGS.LEADER_WALL),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold tracking-[0.22em] text-brand">OPS CONSOLE</p>
        <h1 className="mt-1 text-[22px] font-black tracking-tight">运营概览</h1>
        <p className="mt-1 text-[12px] text-ink-mute">
          今天有 {pendingVerifications + pendingLeaders + pendingJoins} 条审核待处理
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <StatCard
          href="/admin/verifications"
          label="待审身份"
          value={pendingVerifications}
          tone="brand"
          icon="shield"
        />
        <StatCard
          href="/admin/leaders"
          label="待审派主"
          value={pendingLeaders}
          tone="violet"
          icon="flag"
        />
        <StatCard
          href="/admin/joins"
          label="待审加入申请"
          value={pendingJoins}
          tone="brand"
          icon="users"
        />
        <StatCard
          href="/admin/factions"
          label="运行中的派"
          value={activeFactions}
          tone="ok"
          icon="compass"
        />
        <StatCard
          href="/admin/users"
          label="认证成员"
          value={verifiedUsers}
          tone="ocean"
          icon="users"
        />
      </div>

      {/* 派主墙入口：整栏开关与逐条内容编辑都集中在 /admin/leader-wall，这里只给状态与入口 */}
      <Link
        href="/admin/leader-wall"
        className="card flex items-center gap-3 p-4 transition hover:shadow-float"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-dark">
          <Icon name="users" size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-bold text-ink">派主墙（发现页）</span>
          <span className="block truncate text-[10.5px] text-ink-mute">
            整栏开关，以及派主照片、昵称、简介、派宣传语的逐条编辑
          </span>
        </span>
        <Badge tone={leaderWallOn ? "ok" : "mute"}>{leaderWallOn ? "展示中" : "已隐藏"}</Badge>
        <span className="shrink-0 text-[11px] font-semibold text-brand">去设置 →</span>
      </Link>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card">
          <div className="flex items-center justify-between border-b border-ink-line/60 px-4 py-2.5">
            <h2 className="text-[13px] font-bold text-ink">最新身份待审</h2>
            <Link href="/admin/verifications" className="text-[11px] font-semibold text-brand">
              去处理
            </Link>
          </div>
          {recentVerifications.length ? (
            <div className="divide-y divide-ink-line/60">
              {recentVerifications.map((item) => (
                <div key={item.id} className="flex items-center gap-2.5 px-4 py-2.5">
                  <Avatar name={item.user.nickname} color={item.user.avatarColor} size="xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-bold text-ink">
                      {item.user.nickname}
                      <span className="ml-1 font-normal text-ink-mute">
                        · {item.kind === "ALUMNI" ? "离职" : "在职"}
                      </span>
                    </p>
                    <p className="truncate text-[10.5px] text-ink-mute">
                      {item.company.name} · {item.method === "EMAIL" ? "邮箱验证" : "材料审核"} ·{" "}
                      {timeAgo(item.createdAt)}
                    </p>
                  </div>
                  <Badge tone="warn">待审</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-[11.5px] text-ink-mute">没有待审的身份认证</p>
          )}
        </section>

        <section className="card">
          <div className="flex items-center justify-between border-b border-ink-line/60 px-4 py-2.5">
            <h2 className="text-[13px] font-bold text-ink">最新派主认证</h2>
            <Link href="/admin/leaders" className="text-[11px] font-semibold text-brand">
              去处理
            </Link>
          </div>
          {recentLeaders.length ? (
            <div className="divide-y divide-ink-line/60">
              {recentLeaders.map((item) => (
                <div key={item.id} className="flex items-center gap-2.5 px-4 py-2.5">
                  <Avatar name={item.user.nickname} color={item.user.avatarColor} size="xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-bold text-ink">
                      {item.faction.name}
                      <span className="ml-1 font-normal text-ink-mute">
                        · {item.requestedRole === "LEADER" ? "派主" : "副派主"}
                      </span>
                    </p>
                    <p className="truncate text-[10.5px] text-ink-mute">
                      {item.user.nickname} · {item.faction.company.shortName} ·{" "}
                      {timeAgo(item.createdAt)}
                    </p>
                  </div>
                  <Badge tone="warn">待审</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-[11.5px] text-ink-mute">没有待审的派主认证</p>
          )}
        </section>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <InfoCard
          label="近 7 日新增成员"
          value={newUsers}
          desc="新注册账号（含待认证）"
          href="/admin/users"
        />
        <InfoCard
          label="近 7 日新动态"
          value={newPosts}
          desc="含评论与新动态写入"
          href="/admin/posts"
        />
        <InfoCard
          label="近 7 日认证通过"
          value={newVerifications}
          desc={`评论 ${newComments} 条 · 禁用 ${disabledUsers} 个账号`}
          href="/admin/logs"
        />
        <InfoCard
          label="操作日志"
          value={auditTotal}
          desc="全部审核与处置留痕"
          href="/admin/logs"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <InfoCard label="筹备中的派" value={reviewingFactions} desc="需审核建派与派主资质" href="/admin/factions" />
        <InfoCard label="已发布内容" value={postCount} desc="可随时隐藏违规内容" href="/admin/posts" />
        <InfoCard label="评论治理" value={newComments} desc="近 7 日新增评论" href="/admin/comments" />
      </div>

      {recentAudits.length ? (
        <section className="card p-4">
          <h2 className="text-[13px] font-bold text-ink">最近操作</h2>
          <div className="mt-2 space-y-1.5">
            {recentAudits.map((log) => (
              <div key={log.id} className="flex items-center gap-2 text-[11px] text-ink-mute">
                <Icon name="check" size={12} className="text-moss" />
                <span className="font-semibold text-ink-soft">{log.action}</span>
                <span className="truncate">{log.note ?? log.targetType}</span>
                <span className="ml-auto shrink-0">{timeAgo(log.createdAt)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StatCard({
  href,
  label,
  value,
  tone,
  icon,
}: {
  href: string;
  label: string;
  value: number;
  tone: "brand" | "violet" | "ok" | "ocean";
  icon: "shield" | "flag" | "compass" | "users";
}) {
  const toneClass = {
    brand: "bg-brand-soft text-brand-dark",
    violet: "bg-[#F1EAFE] text-plum",
    ok: "bg-[#E9F6EF] text-moss",
    ocean: "bg-[#E8F1FE] text-ocean",
  }[tone];

  return (
    <Link href={href} className="card p-3.5 transition hover:shadow-float">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneClass}`}>
        <Icon name={icon} size={15} />
      </span>
      <p className="mt-2 text-[22px] font-black leading-none text-ink">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-ink-mute">{label}</p>
    </Link>
  );
}

function InfoCard({
  label,
  value,
  desc,
  href,
}: {
  label: string;
  value: number;
  desc: string;
  href: string;
}) {
  return (
    <Link href={href} className="card flex items-center justify-between p-3.5">
      <div>
        <p className="text-[12px] font-bold text-ink">{label}</p>
        <p className="mt-0.5 text-[10.5px] text-ink-mute">{desc}</p>
      </div>
      <span className="text-[18px] font-black text-ink">{value}</span>
    </Link>
  );
}
