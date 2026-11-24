import { loadFactionActivity, rankFactions, sliceFactions } from "@/lib/activity";
import { prisma } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { IDENTIFIED_USER, PUBLIC_USER } from "@/lib/api";
import { withPostIdentity, type PostJson } from "@/lib/revive";
import { DiscoverBrowser } from "@/components/discover/DiscoverBrowser";
import { FactionNews } from "@/components/discover/FactionNews";
import type { FeedSlot } from "@/components/home/FeedStream";
import { LeaderWall } from "@/components/discover/LeaderWall";
import { ShowMore } from "@/components/ShowMore";
import { ActivityFeedCard } from "@/components/faction/ActivityFeedCard";
import { Icon } from "@/components/Icon";
import { categoryOf } from "@/lib/constants";
import { pickUserIdentity } from "@/lib/identity";
import { SITE_FLAGS, getHiddenLeaderWallFactionIds, getSiteFlag } from "@/lib/settings";
import { audienceOfViewer, factionAccessWhere, factionScopeWhere } from "@/lib/scope";

export const metadata = { title: "发现兴趣派" };

const PAGE_SIZE = 100; // 一次取全（派数量 <100），前端只渲染前 10 个，其余由“更多”展开
const HOT_PAGE_SIZE = 8; // 热门活动取 8 条：首屏只放 3 条，剩下的收进「更多」
const HOT_VISIBLE = 3; // 热门活动首屏条数
const NEWS_PAGE_SIZE = 10; // 派新鲜事首屏 10 条，其余走 /api/v1/feed 分页补出
const NEWS_ACTIVITY_SLOTS = 3; // 派新鲜事里混排的本派未开始活动条数

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

  // 派新鲜事的前置依赖：先拿到本人 ACTIVE 成员关系，后续帖子/活动查询都用它圈派范围
  const myActiveMemberships = viewer
    ? await prisma.factionMember.findMany({
        where: { userId: viewer.user.id, status: "ACTIVE" },
        select: { factionId: true, role: true, faction: { select: { slug: true } } },
      })
    : [];
  const myActiveFactionIds = myActiveMemberships.map((item) => item.factionId);

  // 首屏由服务端直读数据库，后续筛选全部走 /api/v1/factions
  const [
    factionCandidates,
    total,
    companies,
    activity,
    myMemberships,
    hotActivities,
    leaderFactions,
    // 派新鲜事三件套：排在派主墙查询之后、后台开关之前，与 Promise.all 实参顺序对齐
    newsPosts,
    newsTotal,
    newsActivities,
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
      // 公司筛选块跟着人群走：大厂看不到只面向非大厂开放派的公司（含非大厂占位公司行）
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
    // 热门活动：全平台报名中且未开始的活动，按报名数降序、临近开场优先
    prisma.activity.findMany({
      where: {
        status: "OPEN",
        startAt: { gt: new Date() },
        faction: { status: "ACTIVE", ...factionScopeWhere(audience) },
      },
      include: {
        faction: {
          select: { id: true, slug: true, name: true, emoji: true, companyId: true, category: true },
        },
        creator: {
          select: {
            ...PUBLIC_USER,
            employments: {
              where: { status: "VERIFIED" },
              select: { companyId: true, kind: true, company: { select: { shortName: true } } },
            },
          },
        },
        signups: { where: { status: "GOING" }, include: { user: { select: PUBLIC_USER } }, take: 8 },
      },
      orderBy: [{ signupCount: "desc" }, { startAt: "asc" }],
      take: HOT_PAGE_SIZE,
    }),
    // 派主墙：只收录已有派主的在营派，照片 + 简介 + 派宣传；不参与顶部筛选（属于全局门面带）
    prisma.faction.findMany({
      where: { status: "ACTIVE", leaderId: { not: null }, ...factionScopeWhere(audience) },
      include: { leader: { select: PUBLIC_USER } },
    }),
    // 派新鲜事（原首页派内动态流迁入）：首屏只取 10 条 + 本派未开始活动混排插槽
    myActiveFactionIds.length
      ? prisma.post.findMany({
          where: { status: "PUBLISHED", factionId: { in: myActiveFactionIds } },
          include: { author: { select: IDENTIFIED_USER }, faction: { include: { company: true } } },
          orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
          take: NEWS_PAGE_SIZE,
        })
      : Promise.resolve([]),
    myActiveFactionIds.length
      ? prisma.post.count({ where: { status: "PUBLISHED", factionId: { in: myActiveFactionIds } } })
      : Promise.resolve(0),
    myActiveFactionIds.length
      ? prisma.activity.findMany({
          where: {
            status: "OPEN",
            startAt: { gt: new Date() },
            factionId: { in: myActiveFactionIds },
          },
          include: {
            faction: { select: { slug: true, name: true, emoji: true, category: true, companyId: true } },
            creator: {
              select: {
                ...PUBLIC_USER,
                employments: {
                  where: { status: "VERIFIED" },
                  select: { companyId: true, kind: true, company: { select: { shortName: true } } },
                },
              },
            },
            signups: { where: { status: "GOING" }, include: { user: { select: PUBLIC_USER } }, take: 8 },
          },
          orderBy: { startAt: "asc" },
          take: NEWS_ACTIVITY_SLOTS,
        })
      : Promise.resolve([]),
    // 后台开关：关掉后整栏不渲染（派卡片/派详情页的派主照片不受影响）
    getSiteFlag(SITE_FLAGS.LEADER_WALL),
    // 逐条「暂不上墙」的派（后台派主墙页单独勾掉的）
    getHiddenLeaderWallFactionIds(),
  ]);
  
  // 发起人展示认证身份，行形状对齐派页共用的 ActivityFeedRow
  const hotRows = hotActivities.map(({ creator, faction, ...activityRow }) => {
    const { employments, ...author } = creator;
    return {
      faction,
      activity: {
        ...activityRow,
        creator: { ...author, identity: pickUserIdentity(employments, faction.companyId) },
      },
    };
  });
  const myHotSignups =
    viewer && hotRows.length
      ? await prisma.activitySignup.findMany({
          where: { userId: viewer.user.id, activityId: { in: hotRows.map((row) => row.activity.id) } },
          select: { activityId: true, status: true },
        })
      : [];
  const hotGoingSet = new Set(
    myHotSignups.filter((item) => item.status === "GOING").map((item) => item.activityId),
  );

  // 后台权重钉顶，其余按活跃度排序后取首屏
  const factions = sliceFactions(factionCandidates, activity, 0, PAGE_SIZE);
  const joinedMap = new Map(myMemberships.map((item) => [item.factionId, item.status]));
  const leaderRows = leaderWallOn
    ? rankFactions(
        leaderFactions.filter((faction) => !hiddenWallIds.has(faction.id)),
        activity,
      ).flatMap((faction) => (faction.leader ? [{ ...faction, leader: faction.leader }] : []))
    : [];

  // 热门卡渲染逻辑一份，首屏 3 条与「更多」里的其余条目共用
  const renderHotCard = ({ activity: item, faction }: (typeof hotRows)[number]) => (
    <ActivityFeedCard
      key={item.id}
      activity={item}
      slug={faction.slug}
      isMember={joinedMap.get(faction.id) === "ACTIVE"}
      isManager={false}
      currentUserId={viewer?.user.id}
      going={hotGoingSet.has(item.id)}
      path="/discover"
      redirectTo="/discover"
      signedIn={Boolean(viewer)}
      isVerified={Boolean(viewer?.isVerified)}
      factionTag={{
        emoji: faction.emoji,
        name: faction.name,
        // 无封面活动用派别渐变图块补上视觉锚点
        from: categoryOf(faction.category).from,
        to: categoryOf(faction.category).to,
      }}
      // 热门栏用精简卡：只留一行时间地点 + 一行简介钩子 + 图块，详情与报名都走详情页
      compact
    />
  );
  const visibleHot = hotRows.slice(0, HOT_VISIBLE);
  const extraHot = hotRows.slice(HOT_VISIBLE);

  // 派新鲜事装配：作者附带认证身份 + 本人点赞态；本派活动预渲染成插槽混排（沿用原首页口径）
  const newsLikedIds = newsPosts.length
    ? (
        await prisma.postLike.findMany({
          where: { userId: viewer?.user.id ?? "", postId: { in: newsPosts.map((post) => post.id) } },
          select: { postId: true },
        })
      ).map((item) => item.postId)
    : [];
  const newsRows: PostJson[] = newsPosts.map((post) =>
    withPostIdentity(post, post.faction.companyId),
  );
  const newsGoingIds = new Set(
    (
      viewer && newsActivities.length
        ? await prisma.activitySignup.findMany({
            where: {
              userId: viewer.user.id,
              activityId: { in: newsActivities.map((item) => item.id) },
              status: "GOING",
            },
            select: { activityId: true },
          })
        : []
    ).map((item) => item.activityId),
  );
  // 活动卡是 Server Component，先渲染成节点再按发布时间算插入位置；置顶帖永远占住流首
  const newsPinnedCount = newsPosts.findIndex((post) => !post.pinned);
  const newsPinnedHead = newsPinnedCount === -1 ? newsPosts.length : newsPinnedCount;
  const newsSlots: FeedSlot[] = newsActivities.map((item) => {
    const made = new Date(item.createdAt).getTime();
    const found = newsPosts.findIndex((post) => new Date(post.createdAt).getTime() < made);
    const mine = myActiveMemberships.find((membership) => membership.factionId === item.factionId);
    return {
      at: Math.max(newsPinnedHead, found === -1 ? newsPosts.length : found),
      node: (
        <ActivityFeedCard
          key={item.id}
          activity={(() => {
            const { creator, faction, ...row } = item;
            const { employments, ...author } = creator;
            return {
              ...row,
              creator: { ...author, identity: pickUserIdentity(employments, faction.companyId) },
            };
          })()}
          slug={item.faction.slug}
          isMember
          isManager={Boolean(mine && mine.role !== "MEMBER")}
          currentUserId={viewer?.user.id}
          going={newsGoingIds.has(item.id)}
          path="/discover"
          redirectTo="/discover"
          signedIn
          isVerified={Boolean(viewer?.isVerified)}
          factionTag={{
            emoji: item.faction.emoji,
            name: item.faction.name,
            from: categoryOf(item.faction.category).from,
            to: categoryOf(item.faction.category).to,
          }}
        />
      ),
    };
  });

  return (
    <>
      {/* 派新鲜事置前：原首页的派内动态流移到这里，登录用户才展示 */}
      {viewer ? (
        <FactionNews
          posts={newsRows}
          likedIds={newsLikedIds}
          activitySlots={newsSlots}
          hasMore={newsTotal > newsPosts.length}
          emptyAction={
            myActiveMemberships[0]
              ? { label: "去发第一条", href: `/factions/${myActiveMemberships[0].faction.slug}?tab=posts` }
              : { label: "去发现兴趣派", href: "#faction-browser" }
          }
        />
      ) : null}
      {hotRows.length ? (
        <section className="mx-auto max-w-5xl px-4 pt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[16px] font-black tracking-tight text-ink">
              <Icon name="sparkle" size={16} /> 热门活动
            </h2>
            <span className="text-[11px] text-ink-mute">认证后即可参加，无需加入派</span>
          </div>
          <div className="space-y-3">{visibleHot.map(renderHotCard)}</div>
          {extraHot.length ? (
            <ShowMore count={extraHot.length}>
              <div className="mt-3 space-y-3">{extraHot.map(renderHotCard)}</div>
            </ShowMore>
          ) : null}
        </section>
      ) : null}
      <LeaderWall rows={leaderRows} />
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
