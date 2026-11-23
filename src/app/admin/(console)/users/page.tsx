import Link from "next/link";
import { prisma } from "@/lib/db";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { QueryNotice } from "@/components/Notice";
import { EmptyState } from "@/components/Section";
import { Pager } from "@/components/Pager";
import { AdminUserActionButton } from "@/components/admin/AdminUserActionButton";
import { withBasePath } from "@/lib/base-path";
import { EMPLOYMENT_KIND } from "@/lib/constants";
import { ONLINE_WINDOW_MS, onlineThreshold, presenceOf } from "@/lib/presence";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

const TABS = [
  { key: "ALL", label: "全部" },
  { key: "ACTIVE", label: "正常" },
  { key: "DISABLED", label: "已禁用" },
  { key: "ADMIN", label: "运营" },
  { key: "ONLINE", label: "仅看在线" },
];

export const metadata = { title: "成员管理" };

const PAGE_SIZE = 30;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; ok?: string; error?: string }>;
}) {
  const query = await searchParams;
  const q = query.q?.trim();
  const status = TABS.some((item) => item.key === query.status) ? query.status! : "ALL";
  const redirectTo = `/admin/users?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  const where = {
    ...(status === "ACTIVE" ? { status: "ACTIVE" } : {}),
    ...(status === "DISABLED" ? { status: "DISABLED" } : {}),
    ...(status === "ADMIN" ? { role: "ADMIN" } : {}),
    // 在线不是账号状态，复用 status 参数位：按会话最近活跃时间筛人
    ...(status === "ONLINE" ? { sessions: { some: { lastSeenAt: { gt: onlineThreshold() } } } } : {}),
    ...(q
      ? {
          OR: [
            { nickname: { contains: q } },
            { email: { contains: q } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };

  const total = await prisma.user.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(Number(query.page) || 1, 1), totalPages);

  const now = Date.now();
  const threshold = onlineThreshold(now);

  const [users, counts, onlineUsers] = await Promise.all([
    prisma.user.findMany({
      where,
      omit: { passwordHash: true },
      include: {
        employments: { include: { company: true } },
        memberships: { where: { status: "ACTIVE" }, select: { id: true, role: true } },
        _count: { select: { posts: true, sessions: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.user.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.user.count({ where: { sessions: { some: { lastSeenAt: { gt: threshold } } } } }),
  ]);

  // 分页内的会话活跃时间：一次取回后在内存里折叠，避免逐行查库
  const sessionRows = await prisma.session.findMany({
    where: { userId: { in: users.map((item) => item.id) } },
    select: { userId: true, lastSeenAt: true },
  });
  const sessionsByUser = new Map<string, { lastSeenAt: Date | null }[]>();
  for (const item of sessionRows) {
    const list = sessionsByUser.get(item.userId);
    if (list) list.push(item);
    else sessionsByUser.set(item.userId, [item]);
  }

  const countMap = new Map(counts.map((item) => [item.status, item._count._all]));
  const totalUsers = counts.reduce((sum, item) => sum + item._count._all, 0);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-bold tracking-[0.22em] text-brand">MEMBERS</p>
        <h1 className="mt-1 text-[22px] font-black tracking-tight">成员管理</h1>
        <p className="mt-1 text-[12px] text-ink-mute">
          共 {totalUsers} 位注册成员 ·{" "}
          <span className="font-semibold text-moss">当前在线 {onlineUsers} 人</span>
          （最近 {Math.round(ONLINE_WINDOW_MS / 1000)} 秒内有访问）· 禁用后立即踢下线且无法再登录
        </p>
      </div>

      <QueryNotice ok={query.ok} error={query.error} />

      <form action={withBasePath("/admin/users")} className="flex items-center gap-2">
        <input type="hidden" name="status" value={status} />
        <input
          name="q"
          defaultValue={q}
          placeholder="搜索昵称或邮箱"
          className="input flex-1 py-2 text-[12px]"
        />
        <button type="submit" className="btn-ghost btn-sm">
          搜索
        </button>
      </form>

      <div className="flex items-center gap-1.5">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/users?status=${item.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={cn("tab-pill", status === item.key && "tab-pill-active")}
          >
            {item.label}
            {item.key === "ALL" ? (
              <span className="ml-1 text-[10px] opacity-70">{totalUsers}</span>
            ) : item.key === "DISABLED" ? (
              <span className="ml-1 text-[10px] opacity-70">{countMap.get("DISABLED") ?? 0}</span>
            ) : item.key === "ONLINE" ? (
              <span className="ml-1 text-[10px] opacity-70">{onlineUsers}</span>
            ) : null}
          </Link>
        ))}
      </div>

      {users.length ? (
        <div className="space-y-2.5">
          {users.map((user) => {
            const verified = user.employments.filter((item) => item.status === "VERIFIED");
            // memberships 查询已限定 status ACTIVE，移出保留原 role 不影响此处统计
            const leaderRoles = user.memberships.filter((item) => item.role !== "MEMBER");
            const disabled = user.status === "DISABLED";
            const presence = presenceOf(sessionsByUser.get(user.id) ?? [], now);

            return (
              <div key={user.id} className="card p-3.5">
                <div className="flex items-start gap-2.5">
                  <Avatar name={user.nickname} color={user.avatarColor} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="text-[12.5px] font-bold text-ink hover:text-brand"
                      >
                        {user.nickname}
                      </Link>
                      {user.role === "ADMIN" ? <Badge tone="violet">运营</Badge> : null}
                      {disabled ? <Badge tone="bad">已禁用</Badge> : null}
                      {verified.length ? (
                        <Badge tone="ok">{verified.length} 家公司已认证</Badge>
                      ) : (
                        <Badge tone="warn">未认证</Badge>
                      )}
                      {leaderRoles.length ? (
                        <Badge tone="brand">{leaderRoles.length} 个派管理者</Badge>
                      ) : null}
                      {presence.online ? <Badge tone="ok">在线</Badge> : <Badge tone="mute">离线</Badge>}
                      {user._count.sessions && user._count.sessions > 1 ? (
                        <Badge tone="ocean">{user._count.sessions} 个活跃会话</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-ink-mute">
                      {user.email ?? user.phone ?? "未绑定登录账号"} · 注册于 {formatDateTime(user.createdAt)} · 加入{" "}
                      {user.memberships.length} 个派 · 发帖 {user._count.posts} 条
                    </p>
                    <p className="text-[10.5px] text-ink-mute">
                      {presence.lastSeenAt
                        ? `最后活跃 ${timeAgo(presence.lastSeenAt)}`
                        : "尚无访问记录"}
                      {user.lastLoginAt ? ` · 最近登录 ${timeAgo(user.lastLoginAt)}` : " · 尚未登录过"}
                      {disabled && user.disabledReason ? ` · 禁用原因：${user.disabledReason}` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {user.employments.map((employment) => (
                        <span
                          key={employment.id}
                          className="inline-flex items-center gap-1 rounded-full bg-cream px-2 py-0.5 text-[10px] font-medium text-ink-soft"
                        >
                          <span
                            className="flex h-3 w-3 items-center justify-center rounded-[3px] text-[6px] font-black text-white"
                            style={{ background: employment.company.color }}
                          >
                            {employment.company.logoText}
                          </span>
                          {employment.company.shortName}
                          {EMPLOYMENT_KIND[employment.kind as keyof typeof EMPLOYMENT_KIND]?.short}
                          {employment.status === "VERIFIED"
                            ? " ✓"
                            : employment.status === "PENDING"
                              ? " · 审核中"
                              : " · 未通过"}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Link href={`/admin/users/${user.id}`} className="btn-quiet btn-sm">
                    详情
                  </Link>
                  <AdminUserActionButton
                    userId={user.id}
                    redirectTo={redirectTo}
                    action={disabled ? "enable" : "disable"}
                    className={disabled ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
                    label={disabled ? "恢复账号" : "禁用账号"}
                  />
                  <AdminUserActionButton
                    userId={user.id}
                    redirectTo={redirectTo}
                    action={user.role === "ADMIN" ? "demote" : "promote"}
                    className="btn-quiet btn-sm"
                    label={user.role === "ADMIN" ? "取消运营" : "设为运营"}
                  />
                  {user._count.sessions ? (
                    <AdminUserActionButton
                      userId={user.id}
                      redirectTo={redirectTo}
                      action="kick"
                      className="btn-quiet btn-sm"
                      label="强制下线"
                    />
                  ) : null}
                  {verified[0] ? (
                    <Link
                      href={`/discover?company=${verified[0].companyId}`}
                      className="text-[10.5px] font-semibold text-ink-mute hover:text-brand"
                    >
                      查看其公司派 →
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
          <Pager
            basePath="/admin/users"
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            query={{ status: status === "ALL" ? undefined : status, q }}
            className="card mt-2.5"
          />
        </div>
      ) : (
        <div className="card">
          <EmptyState icon="users" title="没有匹配的成员" desc="换个关键词或筛选条件试试" />
        </div>
      )}
    </div>
  );
}
