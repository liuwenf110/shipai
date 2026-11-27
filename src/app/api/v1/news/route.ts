import { prisma } from "@/lib/db";
import { apiError, apiOk, getApiUser, IDENTIFIED_USER, metaOf, paging } from "@/lib/api";
import { withPostIdentity } from "@/lib/revive";
import { audienceOfUserOrAdmin, factionScopeWhere } from "@/lib/scope";

/**
 * GET /api/v1/news?page=&pageSize= 发现页「派新鲜事」的分页补足。
 * 可见口径与 src/app/(app)/discover/page.tsx 的首屏查询严格一致：
 * 所有可见派已发布帖、排除勾了「首页公开招募」的帖、按发布时间倒序。
 * 首屏只服务端渲染前 10 条，剩余由前端「加载更多」按需拉取——过去把 50 条一次性
 * 服务端渲染并 hidden 在折叠区里，flight 载荷与 HTML 都翻一倍，手机上点标签像卡死。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await getApiUser();
  if (!user) return apiError("请先登录", 401);

  const audience = await audienceOfUserOrAdmin(user);
  const { page, pageSize, skip } = paging(url, 10);
  const where = {
    status: "PUBLISHED" as const,
    recruit: false,
    faction: { status: "ACTIVE" as const, ...factionScopeWhere(audience) },
  };

  const [total, posts] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      include: { author: { select: IDENTIFIED_USER }, faction: { include: { company: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  const likedIds = new Set(
    posts.length
      ? (
          await prisma.postLike.findMany({
            where: { userId: user.id, postId: { in: posts.map((post) => post.id) } },
            select: { postId: true },
          })
        ).map((item) => item.postId)
      : [],
  );

  return apiOk(
    posts.map((post) => withPostIdentity({ ...post, liked: likedIds.has(post.id) }, post.faction.companyId)),
    metaOf(page, pageSize, total),
  );
}
