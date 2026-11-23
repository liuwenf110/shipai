import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PUBLIC_USER } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { MarkReadSync } from "@/components/UnreadSync";
import { MessageComposer } from "@/components/message/MessageComposer";
import { formatChatTime } from "@/lib/utils";

export const metadata = { title: "私信会话" };

const PAGE_LIMIT = 200;

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/messages/${id}`);

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      userA: { select: PUBLIC_USER },
      userB: { select: PUBLIC_USER },
    },
  });
  // 成员校验：非会话双方一律 404（不泄漏会话是否存在）
  if (!conversation || (conversation.userAId !== user.id && conversation.userBId !== user.id)) {
    notFound();
  }

  const other = conversation.userAId === user.id ? conversation.userB : conversation.userA;

  // 进入即已读：把自己在该会话里的未读置 readAt（列表页下次进入即为最新未读数）
  const markedRead = await prisma.message.updateMany({
    where: { conversationId: id, recipientId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  const messagesDesc = await prisma.message.findMany({
    where: { conversationId: id, status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    take: PAGE_LIMIT,
    select: { id: true, content: true, senderId: true, createdAt: true, readAt: true },
  });
  const messages = messagesDesc.reverse();

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-2xl flex-col px-4 py-5">
      {/* 本次确实置了已读才挂：刷新追平 TopBar/列表页的未读角标 */}
      {markedRead.count > 0 ? <MarkReadSync /> : null}
      <div className="flex items-center gap-2">
        <Link
          href="/messages"
          className="flex items-center gap-1 text-[12px] font-semibold text-ink-mute hover:text-ink"
          aria-label="返回私信列表"
        >
          <Icon name="back" size={16} />
        </Link>
        <Link
          href={`/users/${other.id}`}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1 py-1 hover:bg-cream-sunk"
        >
          <Avatar name={other.nickname} color={other.avatarColor} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-bold text-ink">{other.nickname}</p>
            <p className="text-[10.5px] text-ink-mute">查看 TA 的主页</p>
          </div>
        </Link>
      </div>

      <div className="card mt-3 flex-1 space-y-2.5 overflow-y-auto p-4">
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
                  {message.content}
                  {/* 气泡脚注：真实发送时间（同级微信式分级）+ 我方消息的对方已读/未读 */}
                  <span
                    className={`mt-1 block text-right text-[9.5px] ${
                      mine ? "text-white/70" : "text-ink-mute/80"
                    }`}
                  >
                    {formatChatTime(message.createdAt)}
                    {mine ? (
                      <span className={message.readAt ? "text-white/70" : "text-white/45"}>
                        {" · "}
                        {message.readAt ? "已读" : "未读"}
                      </span>
                    ) : null}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex h-full flex-col items-center justify-center py-10 text-center">
            <Avatar name={other.nickname} color={other.avatarColor} size="lg" className="opacity-60" />
            <p className="mt-3 text-[13px] font-semibold text-ink">和 {other.nickname} 说点什么吧</p>
            <p className="mt-1 text-[11.5px] text-ink-mute">私信内容仅双方可见，请遵守社区规范</p>
          </div>
        )}
      </div>

      <div className="mt-3">
        <MessageComposer conversationId={id} />
      </div>
    </div>
  );
}
