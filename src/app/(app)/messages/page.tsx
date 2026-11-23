import Link from "next/link";
import { prisma } from "@/lib/db";
import { getViewer, requireUser } from "@/lib/auth";
import { PUBLIC_USER } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { MessagesTabs } from "@/components/MessagesTabs";
import { EmptyState } from "@/components/Section";
import { formatChatTime } from "@/lib/utils";

export const metadata = { title: "私信" };

export default async function MessagesListPage() {
  const user = await requireUser("/messages");
  const viewer = await getViewer();

  const [conversations, unreadGroups, groupRows] = await Promise.all([
    prisma.conversation.findMany({
      where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
      include: {
        userA: { select: PUBLIC_USER },
        userB: { select: PUBLIC_USER },
      },
      orderBy: { lastMessageAt: "desc" },
    }),
    prisma.message.groupBy({
      by: ["conversationId"],
      where: { recipientId: user.id, readAt: null, status: "PUBLISHED" },
      _count: { _all: true },
    }),
    // 我参加的活动群（发起时群主自动入群，报名成员由进出联动写入）
    prisma.groupChatMember.findMany({
      where: { userId: user.id },
      include: { group: { include: { activity: { select: { title: true } } } } },
    }),
  ]);
  const unreadMap = new Map(unreadGroups.map((item) => [item.conversationId, item._count._all]));

  // 群未读 = 上次进群之后他人发的消息；从未进过群按入群时间起算
  const groupUnread = new Map<string, number>();
  await Promise.all(
    groupRows.map(async (row) => {
      const count = await prisma.groupMessage.count({
        where: {
          groupId: row.groupId,
          senderId: { not: user.id },
          status: "PUBLISHED",
          createdAt: { gt: row.lastReadAt ?? row.joinedAt },
        },
      });
      groupUnread.set(row.groupId, count);
    }),
  );

  type Entry =
    | { kind: "dm"; id: string; at: Date; name: string; color: string; preview: string | null; unread: number }
    | { kind: "group"; id: string; at: Date; name: string; preview: string | null; unread: number };

  const entries: Entry[] = [
    ...conversations.map((conversation) => {
      const other = conversation.userAId === user.id ? conversation.userB : conversation.userA;
      return {
        kind: "dm" as const,
        id: conversation.id,
        at: conversation.lastMessageAt,
        name: other.nickname,
        color: other.avatarColor,
        preview: conversation.lastPreview,
        unread: unreadMap.get(conversation.id) ?? 0,
      };
    }),
    ...groupRows.map((row) => ({
      kind: "group" as const,
      id: row.groupId,
      at: row.group.lastMessageAt,
      name: `「${row.group.activity.title}」活动群`,
      preview: row.group.lastPreview,
      unread: groupUnread.get(row.groupId) ?? 0,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <p className="text-[11px] font-bold tracking-[0.22em] text-brand">INBOX</p>
      <h1 className="mt-1 text-[24px] font-black tracking-tight">私信</h1>
      <p className="mt-1 mb-3 text-[12px] text-ink-mute">
        一对一私信与活动群聊，内容仅参与的人可见
      </p>
      <MessagesTabs
        active="messages"
        unreadNotifications={viewer?.unreadCount ?? 0}
        unreadMessages={viewer?.unreadMessages ?? 0}
      />

      {entries.length ? (
        <div className="card mt-4 divide-y divide-ink-line/60">
          {entries.map((entry) => (
            <div key={`${entry.kind}-${entry.id}`} className="flex items-center gap-2.5 px-4 py-3">
              {entry.kind === "group" ? (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ocean/10 text-ocean">
                  <Icon name="users" size={18} />
                </span>
              ) : (
                <Avatar name={entry.name} color={entry.color} size="md" className="cursor-default" />
              )}
              <Link
                href={entry.kind === "group" ? `/messages/group/${entry.id}` : `/messages/${entry.id}`}
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[13.5px] font-bold text-ink">{entry.name}</p>
                    {entry.kind === "group" ? (
                      <span className="shrink-0 rounded-full bg-ocean/10 px-1.5 text-[9.5px] font-bold text-ocean">
                        活动群
                      </span>
                    ) : null}
                    {entry.unread > 0 ? (
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                        {entry.unread > 99 ? "99+" : entry.unread}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-ink-mute">
                    {entry.preview ?? "还没有消息"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[10.5px] text-ink-mute/80">{formatChatTime(entry.at)}</span>
                  <span className="text-[11px] font-semibold text-brand">
                    查看 <Icon name="right" size={11} className="inline" />
                  </span>
                </div>
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="card mt-4">
          <EmptyState
            icon="message"
            title="还没有私信"
            desc="去发现或搜索里找到感兴趣的同好,点开 TA 的头像主页即可发起私聊"
            actionLabel="去发现兴趣派"
            actionHref="/discover"
          />
        </div>
      )}
    </div>
  );
}
