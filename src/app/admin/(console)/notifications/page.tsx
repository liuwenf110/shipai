import Link from "next/link";
import { prisma } from "@/lib/db";
import { ADMIN_USER } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Icon } from "@/components/Icon";
import { NotificationIcon, notificationMeta } from "@/components/NotificationIcon";
import { EmptyState } from "@/components/Section";
import { Pager } from "@/components/Pager";
import { withBasePath } from "@/lib/base-path";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

const TABS = [
  { key: "ALL", label: "全部" },
  { key: "VERIFY", label: "身份认证" },
  { key: "LEADER", label: "派主认证" },
  { key: "POST", label: "派内互动" },
  { key: "COMMENT", label: "帖子互动" },
  { key: "ACTIVITY", label: "活动" },
  { key: "SYSTEM", label: "系统" },
];

const PAGE_SIZE = 30;

/** 后台消息中心：运营可查看全站所有用户的消息，仅用于排查与客服支持 */
export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; page?: string }>;
}) {
  const query = await searchParams;
  const type = TABS.some((item) => item.key === query.type) ? query.type! : "ALL";
  const q = query.q?.trim() ?? "";

  const where = {
    ...(type !== "ALL" ? { type } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q } },
            { body: { contains: q } },
            { user: { nickname: { contains: q } } },
            { user: { email: { contains: q } } },
            { user: { phone: { contains: q } } },
          ],
        }
      : {}),
  };

  const total = await prisma.notification.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(Number(query.page) || 1, 1), totalPages);

  const [notifications, typeCounts, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      include: { user: { select: ADMIN_USER } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.notification.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.notification.count({ where: { readAt: null } }),
  ]);

  const countMap = new Map(typeCounts.map((item) => [item.type, item._count._all]));
  const allCount = typeCounts.reduce((sum, item) => sum + item._count._all, 0);
  const filtered = Boolean(q || type !== "ALL");

  const paramsOf = (next: { type?: string; q?: string }) => {
    const params = new URLSearchParams();
    params.set("type", next.type ?? type);
    const nextQ = (next.q ?? q).trim();
    if (nextQ) params.set("q", nextQ);
    return `/admin/notifications?${params.toString()}`;
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-bold tracking-[0.22em] text-brand">MESSAGES</p>
        <h1 className="mt-1 text-[22px] font-black tracking-tight">消息中心</h1>
        <p className="mt-1 text-[12px] text-ink-mute">
          全站用户消息总览（共 {allCount} 条，未读 {unread} 条）。用户侧只能看到自己名下的消息，此处仅供运营排查
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={paramsOf({ type: item.key })}
            className={cn("tab-pill", type === item.key && "tab-pill-active")}
          >
            {item.label}
            <span className="ml-1 text-[10px] opacity-70">
              {item.key === "ALL" ? allCount : (countMap.get(item.key) ?? 0)}
            </span>
          </Link>
        ))}
      </div>

      <form action={withBasePath("/admin/notifications")} className="flex items-center gap-2">
        <input type="hidden" name="type" value={type} />
        <input
          name="q"
          defaultValue={q}
          placeholder="搜索消息标题 / 内容 / 收件人昵称、邮箱、手机号"
          className="input flex-1 py-2 text-[12px]"
        />
        <button type="submit" className="btn-ghost btn-sm">
          搜索
        </button>
        {filtered ? (
          <Link href={`/admin/notifications?type=${type}`} className="btn-quiet btn-sm">
            清除
          </Link>
        ) : null}
      </form>

      {notifications.length ? (
        <div className="space-y-2.5">
          {notifications.map((notification) => {
            const meta = notificationMeta(notification.type);
            const target =
              notification.link &&
              notification.link.startsWith("/") &&
              !notification.link.startsWith("//")
                ? notification.link
                : null;
            return (
              <div key={notification.id} className="card p-3.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <NotificationIcon type={notification.type} />
                  <p className="text-[12.5px] font-bold text-ink">{notification.title}</p>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  {notification.readAt ? (
                    <Badge tone="mute">已读</Badge>
                  ) : (
                    <Badge tone="warn">未读</Badge>
                  )}
                  <span className="ml-auto text-[10px] text-ink-mute">
                    {timeAgo(notification.createdAt)} · {formatDateTime(notification.createdAt)}
                  </span>
                </div>

                {notification.body ? (
                  <p className="mt-1.5 whitespace-pre-wrap text-[11.5px] leading-relaxed text-ink-soft">
                    {notification.body}
                  </p>
                ) : null}

                <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-ink-line/60 pt-2">
                  <Avatar
                    name={notification.user.nickname}
                    color={notification.user.avatarColor}
                    size="sm"
                  />
                  <Link
                    href={`/admin/users/${notification.user.id}`}
                    className="text-[11px] font-bold text-ink hover:text-brand"
                  >
                    {notification.user.nickname}
                  </Link>
                  <span className="text-[10.5px] text-ink-mute">
                    {notification.user.email ?? notification.user.phone ?? "未绑定账号"}
                  </span>
                  {target ? (
                    <Link
                      href={target}
                      className="ml-auto inline-flex items-center gap-0.5 text-[10.5px] font-semibold text-brand"
                    >
                      消息内链接
                      <Icon name="right" size={11} />
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
          <div className="card">
            <Pager
              basePath="/admin/notifications"
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              query={{ type, q }}
            />
          </div>
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon="bell"
            title={filtered ? "没有匹配的消息" : "还没有任何消息"}
            desc="用户完成认证、申请派主、报名活动触发通知后会出现在这里"
          />
        </div>
      )}
    </div>
  );
}
