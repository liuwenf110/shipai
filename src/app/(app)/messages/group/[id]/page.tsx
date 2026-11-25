import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PUBLIC_USER } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { QueryNotice } from "@/components/Notice";
import { GroupMessageComposer } from "@/components/message/GroupMessageComposer";
import { formatChatTime } from "@/lib/utils";

export const metadata = { title: "活动群聊" };

const PAGE_LIMIT = 200;

export default async function GroupChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const user = await requireUser(`/messages/group/${id}`);

  const group = await prisma.groupChat.findUnique({
    where: { id },
    include: {
      activity: {
        select: { id: true, title: true, faction: { select: { slug: true } } },
      },
      members: {
        include: { user: { select: PUBLIC_USER } },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  // 群成员校验：退群（退出报名）后连URL直达也不可见，不泄漏群是否存在
  if (!group || !group.members.some((member) => member.userId === user.id)) {
    notFound();
  }
  const activityPath = `/factions/${group.activity.faction.slug}/activities/${group.activity.id}`;

  // 进入即已读：刷新自己的 lastReadAt，/messages 列表卡片的群未读数随之归零
  await prisma.groupChatMember.update({
    where: { groupId_userId: { groupId: id, userId: user.id } },
    data: { lastReadAt: new Date() },
  });

  const messagesDesc = await prisma.groupMessage.findMany({
    where: { groupId: id, status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    take: PAGE_LIMIT,
    select: {
      id: true,
      content: true,
      createdAt: true,
      senderId: true,
      sender: { select: { nickname: true, avatarColor: true } },
    },
  });
  const messages = messagesDesc.reverse();

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-2xl flex-col px-4 py-5">
      <div className="flex items-center gap-2">
        <Link
          href="/messages"
          className="flex items-center gap-1 text-[12px] font-semibold text-ink-mute hover:text-ink"
          aria-label="返回消息列表"
        >
          <Icon name="back" size={16} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold text-ink">「{group.activity.title}」活动群</p>
          <p className="text-[10.5px] text-ink-mute">
            <Link href={activityPath} className="hover:text-brand">
              查看活动 · {group.members.length} 位成员
            </Link>
          </p>
        </div>
      </div>

      <div className="mt-2">
        <QueryNotice ok={query.ok} error={query.error} />
      </div>

      {/* 成员头像墙：谁在群里一目了然，退报的人会自动从这里消失 */}
      <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1">
        {group.members.map((member) => (
          <Avatar
            key={member.userId}
            name={member.user.nickname}
            color={member.user.avatarColor}
            src={member.user.avatarImage}
            size="xs"
          />
        ))}
      </div>

      <div className="card mt-2 flex-1 space-y-2.5 overflow-y-auto p-4">
        {messages.length ? (
          messages.map((message) => {
            const mine = message.senderId === user.id;
            return (
              <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words ${
                    mine
                      ? "rounded-br-md bg-brand text-white"
                      : "rounded-bl-md bg-cream-sunk text-ink"
                  }`}
                >
                  {!mine ? (
                    <p className="mb-0.5 text-[10.5px] font-bold text-ocean">
                      {message.sender.nickname}
                    </p>
                  ) : null}
                  {message.content}
                  <span
                    className={`mt-1 block text-right text-[9.5px] ${
                      mine ? "text-white/70" : "text-ink-mute/80"
                    }`}
                  >
                    {formatChatTime(message.createdAt)}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex h-full flex-col items-center justify-center py-10 text-center">
            <Icon name="users" size={28} className="text-ink-mute/60" />
            <p className="mt-3 text-[13px] font-semibold text-ink">
              「{group.activity.title}」活动群聊
            </p>
            <p className="mt-1 text-[11.5px] text-ink-mute">
              集合时间、路线、装备都可以在这里商量，内容仅群成员可见
            </p>
          </div>
        )}
      </div>

      <div className="mt-3">
        <GroupMessageComposer groupId={id} />
      </div>
    </div>
  );
}
