import { prisma } from "@/lib/db";
import { apiError, apiOk, getApiUser } from "@/lib/api";

/** POST /api/v1/posts/[id]/like 点赞 / 取消点赞（幂等切换） */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getApiUser();
  if (!user) return apiError("请先登录", 401);

  const post = await prisma.post.findUnique({ where: { id }, select: { id: true } });
  if (!post) return apiError("帖子不存在", 404);

  const existing = await prisma.postLike.findUnique({
    where: { postId_userId: { postId: id, userId: user.id } },
  });

  if (existing) {
    await prisma.$transaction([
      prisma.postLike.delete({ where: { id: existing.id } }),
      prisma.post.update({ where: { id }, data: { likeCount: { decrement: 1 } } }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.postLike.create({ data: { postId: id, userId: user.id } }),
      prisma.post.update({ where: { id }, data: { likeCount: { increment: 1 } } }),
    ]);
  }

  const updated = await prisma.post.findUnique({
    where: { id },
    select: { likeCount: true },
  });

  return apiOk({ liked: !existing, likeCount: updated?.likeCount ?? 0 });
}
