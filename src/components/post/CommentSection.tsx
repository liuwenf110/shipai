"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { UserAvatar } from "@/components/UserAvatar";
import { CompanyBadge } from "@/components/CompanyBadge";
import { ConfirmSubmit } from "@/components/content/ConfirmSubmit";
import { ReportButton } from "@/components/content/ReportButton";
import { EmojiPicker } from "@/components/EmojiPicker";
import { apiGet, apiPost, ApiClientError } from "@/lib/client";
import { deleteOwnCommentAction } from "@/lib/actions/content";
import type { MentionCandidate } from "@/lib/mention";
import { reviveComment, type CommentJson } from "@/lib/revive";
import { cn, colorFromString, timeAgo } from "@/lib/utils";

type MentionRef = { userId: string; nickname?: string };

/**
 * 把评论正文里的 @昵称 片段渲染成高亮。
 * 只对本期候选池里能对上昵称的人生效（历史提及的人早已退出对话时按普通文本显示），
 * 不做点击跳转——用户资料页并非公开主页，避免出现死链。
 */
function highlightMentions(text: string, mentions: MentionRef[]) {
  const named = mentions
    .map((item) => item.nickname)
    .filter((nickname): nickname is string => Boolean(nickname))
    .sort((a, b) => b.length - a.length);
  if (!named.length) return text;

  const pattern = new RegExp(`@(${named.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(text.slice(cursor, index));
    nodes.push(
      <span key={`m${key++}`} className="font-semibold text-brand">
        {match[0]}
      </span>,
    );
    cursor = index + match[0].length;
  }
  if (!nodes.length) return text;
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/** 评论区：首屏用服务端数据，发表与刷新通过 /api/v1 接口 */
export function CommentSection({
  postId,
  initialComments,
  canComment,
  isLoggedIn,
  loginHref,
  viewerId,
  redirectTo,
  atCandidates = [],
}: {
  postId: string;
  initialComments: CommentJson[];
  canComment: boolean;
  isLoggedIn: boolean;
  loginHref: string;
  viewerId?: string | null;
  redirectTo: string;
  atCandidates?: MentionCandidate[];
}) {
  const [comments, setComments] = useState<CommentJson[]>(initialComments);
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const router = useRouter();

  // 光标位置插入 emoji：存在 selectionStart 时插到光标处、后面自动补个空格，避免下一个字符顶在一起；
  // 没聚焦时退化为末尾追加。插入后回写光标位置到 emoji 后一位。
  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    const current = content;
    if (!el) {
      setContent(current.length ? `${current}${emoji} ` : `${emoji} `);
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const caret = Math.max(0, Math.min(start, end));
    const next = `${current.slice(0, caret)}${emoji} ${current.slice(end)}`;
    setContent(next);
    // 给 React 一帧刷新受控 value 后重新定位光标
    requestAnimationFrame(() => {
      el.focus();
      const pos = caret + emoji.length + 1;
      el.setSelectionRange(pos, pos);
    });
  };

  // 候选池按昵称长度降序，长名优先匹配避免前缀误高亮；一排最多放 12 人
  const chips = atCandidates.slice(0, 12);

  const toggleMention = (nickname: string) => {
    const token = `@${nickname}`;
    if (content.includes(token)) {
      setContent(content.replace(token, "").replace(/ {2,}/g, " ").trimStart());
      return;
    }
    setContent(content.length ? `${content.replace(/\s*$/, "")} ${token} ` : `${token} `);
  };

  // 删除评论等 server action 重定向后，以服务端最新数据为准
  useEffect(() => {
    setComments(initialComments);
  }, [initialComments]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = content.trim();
    if (!text || pending) return;

    setPending(true);
    setError("");
    try {
      // 以正文为准反推 mentionIds：用户手动删掉文本里的 @张三 后就不会再误发通知
      const mentionIds = chips.filter((item) => text.includes(`@${item.nickname}`)).map((item) => item.id);
      const response = await apiPost<unknown>(`/api/v1/posts/${postId}/comments`, {
        content: text,
        mentionIds,
      });
      setComments((items) => [...items, reviveComment(response.data)]);
      setContent("");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) {
        router.push(loginHref);
        return;
      }
      setError(caught instanceof Error ? caught.message : "发送失败，请重试");
    } finally {
      setPending(false);
    }
  };

  const reload = async () => {
    setPending(true);
    try {
      const response = await apiGet<unknown[]>(`/api/v1/posts/${postId}/comments?pageSize=50`);
      setComments(response.data.map(reviveComment));
    } catch {
      // 忽略刷新失败，保留已有评论
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="card mt-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-bold text-ink">评论 {comments.length ? `· ${comments.length}` : ""}</h2>
        <button
          type="button"
          onClick={reload}
          disabled={pending}
          className="text-[11px] font-semibold text-ink-mute hover:text-brand disabled:opacity-50"
        >
          刷新
        </button>
      </div>

      {canComment ? (
        <form onSubmit={submit} className="mt-2.5 space-y-2">
          {chips.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-ink-mute">@</span>
              {chips.map((item) => {
                const active = content.includes(`@${item.nickname}`);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleMention(item.nickname)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition",
                      active
                        ? "border-brand bg-brand-soft text-brand-dark"
                        : "border-ink-line/70 bg-cream text-ink-soft hover:border-brand/60",
                    )}
                  >
                    <Avatar name={item.nickname} color={colorFromString(item.id)} size="xs" />
                    {item.nickname}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="flex items-start gap-2">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder={
                chips.length
                  ? "说点什么，点上方头像可 @ 帖子作者或已回帖的人（必填）"
                  : "说点什么，或者约一场线下见面（必填）"
              }
              className="input flex-1 resize-none text-[13px]"
            />
            <EmojiPicker onPick={insertEmoji} align="right" />
            <button
              type="submit"
              disabled={pending || !content.trim()}
              className="btn-primary btn-sm h-9 disabled:opacity-60"
            >
              {pending ? "发送中…" : "发送"}
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-2 rounded-xl bg-cream px-3 py-2 text-[11.5px] text-ink-mute">
          {!isLoggedIn ? (
            <>
              <Link href={loginHref} className="font-semibold text-brand">
                登录
              </Link>{" "}
              后参与讨论
            </>
          ) : (
            "登录后即可参与评论"
          )}
        </p>
      )}

      {error ? <p className="mt-1.5 text-[11px] font-medium text-[#B42318]">{error}</p> : null}

      <div className="mt-3 divide-y divide-ink-line/60">
        {comments.length ? (
          comments.map((comment) => (
            <div key={comment.id} className="py-2.5">
              <div className="flex items-start gap-2.5">
                <UserAvatar id={comment.author.id} name={comment.author.nickname} color={comment.author.avatarColor} src={comment.author.avatarImage} size="xs" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11.5px] font-bold text-ink">{comment.author.nickname}</span>
                    <CompanyBadge
                      identity={comment.author.identity}
                      showKind={false}
                      showUnverified
                    />
                    <span className="text-[10.5px] font-normal text-ink-mute">
                      {timeAgo(comment.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-soft">
                    {highlightMentions(comment.content, comment.mentions)}
                  </p>
                  {viewerId === comment.author.id ? (
                    <form action={deleteOwnCommentAction} className="mt-1 flex">
                      <input type="hidden" name="commentId" value={comment.id} />
                      <input type="hidden" name="redirectTo" value={redirectTo} />
                      <ConfirmSubmit
                        confirmText="确定删除这条评论？"
                        className="text-[11px] font-semibold text-ink-mute transition hover:text-[#B42318]"
                      >
                        删除
                      </ConfirmSubmit>
                    </form>
                  ) : viewerId ? (
                    <div className="mt-1">
                      <ReportButton targetType="COMMENT" targetId={comment.id} redirectTo={redirectTo} />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="py-6 text-center text-[11.5px] text-ink-mute">还没有评论，来抢沙发</p>
        )}
      </div>
    </section>
  );
}
