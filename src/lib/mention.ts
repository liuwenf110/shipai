import "server-only";

import { prisma } from "@/lib/db";
import { notify } from "@/lib/notify";

/**
 * 评论 @ 提及：候选池只取「帖子作者 + 本帖已发言的评论人」。
 * 刻意不开放全站用户，一是这个场景要的就是「把刚说过话的人拉进来」，
 * 二是可@集合固定下来后，提交时能服务端二次校验，避免前端塞任意 userId 群发通知。
 */

export type MentionCandidate = { id: string; nickname: string };

/** 可 @ 的人：帖子作者与已评论过的人（去重、排除发言者自己），按昵称长度降序便于前端做 @ 文本高亮 */
export async function listMentionCandidates(postId: string, authorId: string): Promise<MentionCandidate[]> {
  const comments = await prisma.comment.findMany({
    where: { postId, status: "PUBLISHED" },
    select: { authorId: true, author: { select: { nickname: true } } },
  });

  const map = new Map<string, string>();
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { author: { select: { id: true, nickname: true } } },
  });
  if (post) map.set(post.author.id, post.author.nickname);
  for (const comment of comments) map.set(comment.authorId, comment.author.nickname);
  map.delete(authorId);

  return [...map.entries()]
    .map(([id, nickname]) => ({ id, nickname }))
    .sort((a, b) => b.nickname.length - a.nickname.length);
}

/** 最多 @ 10 人，挡掉脚本刷通知 */
const MENTION_LIMIT = 10;

/**
 * 落库并派发通知：requested 与当期候选池取交集，交集外（自己、已删评论的作者、伪造 id）静默丢弃。
 * 返回真正生效的提及，供前端立即渲染高亮。
 */
export async function recordMentions(input: {
  commentId: string;
  postId: string;
  authorId: string;
  authorNickname: string;
  content: string;
  requestedIds: unknown;
  candidates: MentionCandidate[];
}): Promise<MentionCandidate[]> {
  const allowed = new Map(input.candidates.map((item) => [item.id, item.nickname]));
  const requested = Array.isArray(input.requestedIds)
    ? input.requestedIds.map((value) => String(value)).filter((value) => allowed.has(value))
    : [];
  const ids = [...new Set(requested)].slice(0, MENTION_LIMIT);
  if (!ids.length) return [];

  // ids 已去重且 commentId 为新建，不会命中 @@unique([commentId, userId])；
  // 不用 skipDuplicates：SQLite 下 Prisma 不支持该选项（类型即报 never）
  await prisma.commentMention.createMany({
    data: ids.map((userId) => ({ commentId: input.commentId, userId })),
  });

  for (const id of ids) {
    await notify({
      userId: id,
      type: "MENTION",
      title: `${input.authorNickname} 在评论里提到了你`,
      body: input.content.slice(0, 60),
      link: `/posts/${input.postId}`,
    });
  }

  return ids.map((id) => ({ id, nickname: allowed.get(id) ?? "" }));
}
