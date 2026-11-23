import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge } from "@/components/Badge";
import { Icon } from "@/components/Icon";
import { NotificationIcon, notificationMeta } from "@/components/NotificationIcon";
import { MarkReadSync } from "@/components/UnreadSync";
import { formatDateTime, timeAgo } from "@/lib/utils";

function safeLink(link: string | null) {
  if (!link) return null;
  if (link.startsWith("/") && !link.startsWith("//")) return link;
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notification = await prisma.notification.findUnique({
    where: { id },
    select: { title: true },
  });
  return { title: notification?.title ?? "消息详情" };
}

export default async function NotificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/notifications/${id}`);

  const notification = await prisma.notification.findFirst({
    where: { id, userId: user.id },
  });
  if (!notification) notFound();

  // 进入详情即视为已读
  const wasUnread = !notification.readAt;
  if (wasUnread) {
    await prisma.notification.updateMany({
      where: { id: notification.id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
  }

  const meta = notificationMeta(notification.type);
  const target = safeLink(notification.link);

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      {/* 本次由未读转已读才挂：刷新追平 TopBar bell 点与 BottomNav 消息角标 */}
      {wasUnread ? <MarkReadSync /> : null}
      <Link
        href="/notifications"
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-mute transition hover:text-ink"
      >
        <Icon name="back" size={14} />
        返回消息
      </Link>

      <article className="card mt-3 p-5">
        <div className="flex items-start gap-3">
          <NotificationIcon type={notification.type} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              <span className="text-[10.5px] text-ink-mute">
                {formatDateTime(notification.createdAt)}
              </span>
            </div>
            <h1 className="mt-2 text-[19px] font-black leading-snug tracking-tight">
              {notification.title}
            </h1>
          </div>
        </div>

        {notification.body ? (
          <p className="mt-4 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-soft">
            {notification.body}
          </p>
        ) : (
          <p className="mt-4 text-[13px] text-ink-mute">该消息暂无更多内容。</p>
        )}

        <p className="mt-3 text-[11px] text-ink-mute/80">收到于 {timeAgo(notification.createdAt)}</p>

        {target ? (
          <div className="mt-5 border-t border-ink-line/60 pt-4">
            <Link href={target} className="btn-primary btn-sm">
              前往查看相关内容
            </Link>
          </div>
        ) : null}
      </article>
    </div>
  );
}
