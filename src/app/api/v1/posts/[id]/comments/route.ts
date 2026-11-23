import { prisma } from "@/lib/db";
import { apiError, apiOk, getApiUser, IDENTIFIED_USER, metaOf, paging, readJson } from "@/lib/api";
import { notify } from "@/lib/notify";
import { listMentionCandidates, recordMentions } from "@/lib/mention";
import { withCommentIdentity } from "@/lib/revive";
import { audienceOfUserOrAdmin, canAccessFaction } from "@/lib/scope";

/** GET /api/v1/posts/[id]/comments?page= 评论分页 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const { page, pageSize, skip } = paging(url, 20);
  const user = await getApiUser();

  const where = { postId: id, status: "PUBLISHED" };
  const [post, total, comments] = await Promise.all([
    // 用于挑选展示身份：同公司认证优先
    prisma.post.findUnique({
      where: { id },
      select: { factionId: true, faction: { select: { companyId: true } } },
    }),
    prisma.comment.count({ where }),
    prisma.comment.findMany({
      where,
      include: {
        author: { select: IDENTIFIED_USER },
        mentions: { select: { userId: true, user: { select: { nickname: true } } } },
      },
      orderBy: { createdAt: "asc" },
      skip,
      take: pageSize,
    }),
  ]);

  // 评论跟帖走同一隔离：跨阵营看不到别人的评论
  const audience = await audienceOfUserOrAdmin(user);
  if (post && !(await canAccessFaction(post.factionId, audience, user?.id))) {
    return apiError("帖子不存在", 404);
  }

  const companyId = post?.faction.companyId ?? null;
  return apiOk(
    comments.map((comment) => withCommentIdentity(comment, companyId)),
    metaOf(page, pageSize, total),
  );
}

/** POST /api/v1/posts/[id]/comments 发表评论 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getApiUser();
  if (!user) return apiError("请先登录", 401);

  const body = await readJson<{ content?: string; mentionIds?: unknown }>(request);
  const content = String(body?.content ?? "").trim();
  if (!content) return apiError("评论不能为空");
  if (content.length > 500) return apiError("评论最多 500 字");

  const post = await prisma.post.findUnique({
    where: { id },
    include: { faction: true },
  });
  if (!post || post.status !== "PUBLISHED") return apiError("帖子不存在", 404);

  // 登录即可评论：未加入的派也开放互动，发帖仍限派内成员（但跨阵营的派依旧摸不到）
  const audience = await audienceOfUserOrAdmin(user);
  if (!(await canAccessFaction(post.factionId, audience, user.id))) return apiError("帖子不存在", 404);
  const comment = await prisma.comment.create({
    data: { postId: id, authorId: user.id, content },
    include: { author: { select: IDENTIFIED_USER }, mentions: { select: { userId: true } } },
  });

  await prisma.post.update({
    where: { id },
    data: { commentCount: { increment: 1 } },
  });

  if (post.authorId !== user.id) {
    await notify({
      userId: post.authorId,
      type: "COMMENT",
      title: `${user.nickname} 评论了你的帖子`,
      body: content.slice(0, 60),
      link: `/posts/${post.id}`,
    });
  }

  // @ 提及：提交时重算候选池，前端传的 id 不在池内一律丢弃（防伪造 userId 群发通知）
  const candidates = await listMentionCandidates(post.id, user.id);
  const effective = await recordMentions({
    commentId: comment.id,
    postId: post.id,
    authorId: user.id,
    authorNickname: user.nickname,
    content,
    requestedIds: body?.mentionIds,
    candidates,
  });

  return apiOk(
    withCommentIdentity(
      comment,
      post.faction.companyId,
      effective.map((item) => ({ userId: item.id, nickname: item.nickname })),
    ),
  );
}
