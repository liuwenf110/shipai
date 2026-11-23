import { prisma } from "@/lib/db";
import { apiError, apiOk, getApiUser, IDENTIFIED_USER, metaOf, paging } from "@/lib/api";
import { withPostIdentity } from "@/lib/revive";

/** GET /api/v1/feed?page=&pageSize= 我的派动态流（真实数据，按置顶+时间排序） */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await getApiUser();
  if (!user) return apiError("请先登录", 401);

  const { page, pageSize, skip } = paging(url, 8);

  const memberships = await prisma.factionMember.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    select: { factionId: true },
  });
  const factionIds = memberships.map((item) => item.factionId);

  if (!factionIds.length) {
    return apiOk([], metaOf(page, pageSize, 0));
  }

  const where = { factionId: { in: factionIds }, status: "PUBLISHED" };

  const [total, posts] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      include: {
        author: { select: IDENTIFIED_USER },
        faction: { include: { company: true } },
      },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
    }),
  ]);

  const likes = posts.length
    ? await prisma.postLike.findMany({
        where: { userId: user.id, postId: { in: posts.map((item) => item.id) } },
        select: { postId: true },
      })
    : [];
  const likedIds = new Set(likes.map((item) => item.postId));

  return apiOk(
    posts.map((post) =>
      withPostIdentity({ ...post, liked: likedIds.has(post.id) }, post.faction.companyId),
    ),
    metaOf(page, pageSize, total),
  );
}
