import { prisma } from "@/lib/db";
import { apiError, apiOk, getApiUser, IDENTIFIED_USER, metaOf, paging } from "@/lib/api";
import { withCommentIdentity, withPostIdentity } from "@/lib/revive";

/** GET /api/v1/posts/[id]?page= 帖子详情 + 评论分页 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const { page, pageSize, skip } = paging(url, 20);
  const user = await getApiUser();

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      author: { select: IDENTIFIED_USER },
      faction: { include: { company: true } },
    },
  });
  if (!post || post.status !== "PUBLISHED") return apiError("帖子不存在", 404);

  const [totalComments, comments, liked] = await Promise.all([
    prisma.comment.count({ where: { postId: id, status: "PUBLISHED" } }),
    prisma.comment.findMany({
      where: { postId: id, status: "PUBLISHED" },
      include: { author: { select: IDENTIFIED_USER } },
      orderBy: { createdAt: "asc" },
      skip,
      take: pageSize,
    }),
    user
      ? prisma.postLike.findUnique({ where: { postId_userId: { postId: id, userId: user.id } } })
      : Promise.resolve(null),
  ]);

  const membership = user
    ? await prisma.factionMember.findUnique({
        where: { factionId_userId: { factionId: post.factionId, userId: user.id } },
      })
    : null;

  return apiOk(
    {
      ...withPostIdentity(post, post.faction.companyId),
      liked: Boolean(liked),
      // 评论对登录用户全量开放（含未加入的派），管理操作仍限派内管理者
      canComment: Boolean(user),
      canManage: Boolean(
        membership && membership.status === "ACTIVE" && membership.role !== "MEMBER",
      ),
      comments: comments.map((comment) =>
        withCommentIdentity(comment, post.faction.companyId),
      ),
    },
    metaOf(page, pageSize, totalComments),
  );
}
