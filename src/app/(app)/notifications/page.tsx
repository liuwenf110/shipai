import Link from "next/link";
import { prisma } from "@/lib/db";
import { getViewer, requireUser } from "@/lib/auth";
import { NotificationIcon, notificationMeta } from "@/components/NotificationIcon";
import { MessagesTabs } from "@/components/MessagesTabs";
import { Pager } from "@/components/Pager";
import { SubmitButton } from "@/components/SubmitButton";
import { EmptyState } from "@/components/Section";
import {
  markAllReadAction,
  markReadAction,
} from "@/lib/actions/notifications";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "消息" };

const PAGE_SIZE = 20;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const query = await searchParams;
  const user = await requireUser("/notifications");
  const viewer = await getViewer();

  const total = await prisma.notification.count({ where: { userId: user.id } });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(Number(query.page) || 1, 1), totalPages);

  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] font-bold tracking-[0.22em] text-brand">INBOX</p>
          <h1 className="mt-1 text-[24px] font-black tracking-tight">消息</h1>
          <p className="mt-1 text-[12px] text-ink-mute">
            审核结果、关注与活动通知都会出现在这里
          </p>
        </div>
        {unread > 0 ? (
          <form action={markAllReadAction}>
            <SubmitButton className="btn-ghost btn-sm" pendingText="处理中…">
              全部已读（{unread}）
            </SubmitButton>
          </form>
        ) : null}
      </div>

      <div className="mt-3">
        <MessagesTabs
          active="notifications"
          unreadNotifications={unread}
          unreadMessages={viewer?.unreadMessages ?? 0}
        />
      </div>

      {notifications.length ? (
        <div className="card mt-4 divide-y divide-ink-line/60">
          {notifications.map((notification) => {
            const meta = notificationMeta(notification.type);
            const content = (
              <>
                <NotificationIcon type={notification.type} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-1.5">
                    <p className="text-[12.5px] font-bold leading-snug text-ink">
                      {notification.title}
                    </p>
                    {!notification.readAt ? (
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    ) : null}
                  </div>
                  {notification.body ? (
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-ink-mute">
                      {notification.body}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[10px] text-ink-mute/80">
                    {meta.label} · {timeAgo(notification.createdAt)}
                  </p>
                </div>
              </>
            );

            return (
              <div key={notification.id} className="flex items-start gap-2.5 px-4 py-3">
                <Link
                  href={`/notifications/${notification.id}`}
                  className="flex min-w-0 flex-1 items-start gap-2.5"
                >
                  {content}
                </Link>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Link
                    href={`/notifications/${notification.id}`}
                    className="text-[11px] font-semibold text-brand"
                  >
                    查看
                  </Link>
                  {!notification.readAt ? (
                    <form action={markReadAction}>
                      <input type="hidden" name="id" value={notification.id} />
                      <input type="hidden" name="page" value={String(page)} />
                      <SubmitButton
                        className="text-[10.5px] text-ink-mute hover:text-ink"
                        pendingText="…"
                      >
                        标为已读
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              </div>
            );
          })}
          <Pager basePath="/notifications" page={page} pageSize={PAGE_SIZE} total={total} />
        </div>
      ) : (
        <div className="card mt-4">
          <EmptyState
            icon="bell"
            title="暂时没有消息"
            desc="完成身份认证、申请派主认证或报名活动后，通知会出现在这里"
            actionLabel="去发现兴趣派"
            actionHref="/discover"
          />
        </div>
      )}
    </div>
  );
}
