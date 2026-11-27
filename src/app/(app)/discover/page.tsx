import { loadFactionActivity, rankFactions, sliceFactions } from "@/lib/activity";
import { prisma } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { IDENTIFIED_USER, PUBLIC_USER } from "@/lib/api";
import { withPostIdentity, type PostJson } from "@/lib/revive";
import { DiscoverBrowser } from "@/components/discover/DiscoverBrowser";
import { FactionNews } from "@/components/discover/FactionNews";
import { LeaderWall } from "@/components/discover/LeaderWall";
import { SITE_FLAGS, getHiddenLeaderWallFactionIds, getSiteFlag } from "@/lib/settings";
import { audienceOfViewer, factionAccessWhere, factionScopeWhere } from "@/lib/scope";

export const metadata = { title: "发现兴趣派" };

const PAGE_SIZE = 100; // 一次取全（派数量 <100），前端只渲染前 10 个，其余由"更多"展开
// 派新鲜事首屏只服务端渲染 10 条（与 FactionNews 的 NEWS_VISIBLE 同源），剩下的由前端
// 「加载更多」打 /api/v1/news——以前一次铺 50 条，载荷与 HTML 都翻倍，手机端点标签像卡死
const NEWS_FIRST_SCREEN = 10;

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; company?: string; q?: string }>;
}) {
  const params = await searchParams;
  const viewer = await getViewer();
  // 大厂 / 非大厂人群口径：本层只负责「派可不可见」，派内内容随派一起被隔离
  const audience = audienceOfViewer(viewer);
  // 发现页保留匿名可浏览（落地页「先逛逛兴趣派」等宣传位要能真逛），仅导航不再展示「发现」入口

  const category = params.category && params.category !== "ALL" ? params.category : undefined;
  const companyId = params.company;
  const q = params.q?.trim();

  // 隔离条件与搜索条件各占 AND 一项：直接展开会把 OR 键互相覆盖（关键词那一条也是 OR）
  const where = {
    AND: [
      { status: { in: ["ACTIVE", "REVIEWING"] } },
      factionAccessWhere(audience, viewer?.user.id),
      category ? { category } : {},
      companyId ? { companyId } : {},
      q
        ? {
            OR: [
              { name: { contains: q } },
              { tagline: { contains: q } },
              { description: { contains: q } },
            ],
          }
        : {},
    ],
  };

  // 派新鲜事的可见口径与 /api/v1/news 严格一致：可见派最新发布帖，排除首页公开招募帖
  const newsWhere = {
    status: "PUBLISHED" as const,
    recruit: false,
    faction: { status: "ACTIVE" as const, ...factionScopeWhere(audience) },
  };

  // 首屏由服务端直读数据库，后续筛选全部走 /api/v1/factions
  const [
    factionCandidates,
    total,
    companies,
    activity,
    myMemberships,
    leaderFactions,
    newsTotal,
    newsPosts,
    leaderWallOn,
    hiddenWallIds,
  ] = await Promise.all([
    prisma.faction.findMany({
      where,
      // leader 只取公开字段，避免 passwordHash / email 被序列化进客户端 props
      include: { company: true, leader: { select: PUBLIC_USER } },
    }),
    prisma.faction.count({ where }),
    prisma.company.findMany({
      // 公司筛选块跟着人群走
      where: {
        factions: {
          some: {
            status: { in: ["ACTIVE", "REVIEWING"] },
            ...factionAccessWhere(audience, viewer?.user.id),
          },
        },
      },
      include: { _count: { select: { employments: { where: { status: "VERIFIED" } } } } },
    }),
    loadFactionActivity(),
    viewer
      ? prisma.factionMember.findMany({
          where: { userId: viewer.user.id, status: { in: ["ACTIVE", "PENDING"] } },
          select: { factionId: true, status: true },
        })
      : Promise.resolve([]),
    // 派主墙
    prisma.faction.findMany({
      where: { status: "ACTIVE", leaderId: { not: null }, ...factionScopeWhere(audience) },
      include: { leader: { select: PUBLIC_USER } },
    }),
    // 派新鲜事：总数用于判断首屏之后还有没有得加载，列表只取首屏 10 条
    prisma.post.count({ where: newsWhere }),
    prisma.post.findMany({
      where: newsWhere,
      include: { author: { select: IDENTIFIED_USER }, faction: { include: { company: true } } },
      orderBy: { createdAt: "desc" },
      take: NEWS_FIRST_SCREEN,
    }),
    getSiteFlag(SITE_FLAGS.LEADER_WALL),
    getHiddenLeaderWallFactionIds(),
  ]);
  
  // 后台权重钉顶，其余按活跃度排序后取首屏
  const factions = sliceFactions(factionCandidates, activity, 0, PAGE_SIZE);
  const joinedMap = new Map(myMemberships.map((item) => [item.factionId, item.status]));
  const leaderRows = leaderWallOn
    ? rankFactions(
        leaderFactions.filter((faction) => !hiddenWallIds.has(faction.id)),
        activity,
      ).flatMap((faction) => (faction.leader ? [{ ...faction, leader: faction.leader }] : []))
    : [];

  // 派新鲜事装配：服务端预先计算点赞状态后嵌入 PostJson 传给 FactionNews
  const newsLikedIds = newsPosts.length
    ? (
        await prisma.postLike.findMany({
          where: { userId: viewer?.user.id ?? "", postId: { in: newsPosts.map((post) => post.id) } },
          select: { postId: true },
        })
      ).map((item) => item.postId)
    : [];
  const newsRows: PostJson[] = newsPosts.map((post) =>
    withPostIdentity({ ...post, liked: newsLikedIds.includes(post.id) }, post.faction.companyId),
  );

  return (
    <>
      <LeaderWall rows={leaderRows} />
      {/* 派新鲜事：登录用户展示所有可见派最新发布帖子 */}
      {viewer ? (
        <FactionNews
          posts={newsRows}
          total={newsTotal}
          emptyAction={{ label: "去发现兴趣派", href: "#faction-browser" }}
        />
      ) : null}
      <DiscoverBrowser
        initialFactions={factions.map((faction) => ({
          ...faction,
          membershipStatus: joinedMap.get(faction.id) ?? null,
        }))}
        initialTotal={total}
        companies={companies
          .sort((a, b) => b._count.employments - a._count.employments)
          .map((company) => ({
            id: company.id,
            shortName: company.shortName,
            color: company.color,
            logoText: company.logoText,
          }))}
        verifiedCompanyIds={viewer?.verifiedEmployments.map((item) => item.companyId) ?? []}
        initial={{ category, company: companyId, q }}
        isVerified={Boolean(viewer?.isVerified)}
        pageSize={PAGE_SIZE}
      />
    </>
  );
}
