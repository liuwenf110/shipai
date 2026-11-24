import { getViewer } from "@/lib/auth";
import { IDENTIFIED_USER, PUBLIC_USER } from "@/lib/api";
import { loadFactionActivity, sliceFactions } from "@/lib/activity";
import { prisma } from "@/lib/db";
import { withPostIdentity } from "@/lib/revive";
import { pickUserIdentity } from "@/lib/identity";
import { buildHomeTicker } from "@/lib/home-ticker";
import {
  GUEST_AUDIENCE,
  factionAccessWhere,
  factionScopeWhere,
} from "@/lib/scope";
import { Landing } from "@/components/marketing/Landing";
import { HomeFeed } from "@/components/home/HomeFeed";

export default async function HomePage() {
  const viewer = await getViewer();

  if (!viewer) {
    // 游客与未认证用户同口径：只看勾了「非大厂」的派（公司墙仍按已开通大厂展示，属公开营销信息）
    const guestScope = factionScopeWhere(GUEST_AUDIENCE);
    const [companyCount, factionCount, memberCount, featuredCandidates, companies, activity] = await Promise.all([
      prisma.company.count({ where: { scope: "CORP" } }),
      prisma.faction.count({ where: { status: "ACTIVE", ...guestScope } }),
      prisma.user.count(), // 落地页人数口径：全部入驻用户（不限已完成公司认证）
      prisma.faction.findMany({
        where: { status: "ACTIVE", ...guestScope },
        // leader/author 收敛 PUBLIC_USER，避免 flight 载荷携带 passwordHash/email
        include: { company: true, leader: { select: PUBLIC_USER } },
      }),
      // 公司墙只展示已开通的大厂名称，按接入时间排列
      prisma.company.findMany({ where: { scope: "CORP" }, orderBy: { createdAt: "asc" } }),
      loadFactionActivity(),
    ]);

    // 落地页推荐位：后台权重钉顶，其余按活跃度取前 6
    const featured = sliceFactions(featuredCandidates, activity, 0, 6);

    return (
      <Landing
        stats={{ companies: companyCount, factions: factionCount, members: memberCount }}
        featured={featured}
        companies={companies}
      />
    );
  }

  const memberships = await prisma.factionMember.findMany({
    where: { userId: viewer.user.id, status: { in: ["ACTIVE", "PENDING"] } },
    include: { faction: { include: { company: true, leader: { select: PUBLIC_USER } } } },
    orderBy: { joinedAt: "asc" },
  });

  const myFactionIds = memberships
    .filter((item) => item.status === "ACTIVE")
    .map((item) => item.factionId);

  const joinedFactionIds = memberships.map((item) => item.factionId);

  const audience = viewer.audience;

  const [
    posts,
    feedTotal,
    pendingLeaderApplications,
    otherFactionPosts,
    tickerItems,
    myActivities,
  ] = await Promise.all([
    myFactionIds.length
      ? prisma.post.findMany({
          where: { factionId: { in: myFactionIds }, status: "PUBLISHED" },
          include: {
            author: { select: IDENTIFIED_USER },
            faction: { include: { company: true } },
          },
          orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
          take: 8,
        })
      : Promise.resolve([]),
    myFactionIds.length
      ? prisma.post.count({ where: { factionId: { in: myFactionIds }, status: "PUBLISHED" } })
      : Promise.resolve(0),
    prisma.leaderApplication.findMany({
      where: { userId: viewer.user.id, status: "PENDING" },
      select: { factionId: true },
    }),
    // 首页公开招募：只拿帖主勾选「首页公开招募」的帖（未加入（含待审批）的派），多取一些供按派去重
    prisma.post.findMany({
      where: {
        status: "PUBLISHED",
        recruit: true,
        faction: {
          AND: [
            { status: "ACTIVE" },
            joinedFactionIds.length ? { id: { notIn: joinedFactionIds } } : {},
            factionAccessWhere(audience, viewer.user.id),
          ],
        },
      },
      include: {
        author: { select: IDENTIFIED_USER },
        faction: { include: { company: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 16,
    }),
    // 顶部消息栏：老派主回归等真实动态，外加当前派主的待审批待办
    buildHomeTicker(viewer.user.id, audience),
    // 自己所属派的未开始活动：按临近开场优先取 3 条，混排进派内新鲜事
    myFactionIds.length
      ? prisma.activity.findMany({
          where: { factionId: { in: myFactionIds }, status: "OPEN", startAt: { gt: new Date() } },
          include: {
            faction: {
              select: { id: true, slug: true, name: true, emoji: true, category: true, companyId: true },
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
          orderBy: { startAt: "asc" },
          take: 3,
        })
      : Promise.resolve([]),
  ]);

  // 首页「派主认证」卡片据此跳过已提交申请、仍在审核中的派
  const pendingLeaderFactionIds = pendingLeaderApplications.map((item) => item.factionId);

  const likedIds = posts.length
    ? (
        await prisma.postLike.findMany({
          where: { userId: viewer.user.id, postId: { in: posts.map((post) => post.id) } },
          select: { postId: true },
        })
      ).map((item) => item.postId)
    : [];

  // 帖子作者附带认证身份（公司 + 在职/离职），同派公司优先
  const feedPosts = posts.map((post) => withPostIdentity(post, post.faction.companyId));

  // 每个派只取一条，避免首页被同一个派刷屏
  const seenOtherFactionIds = new Set<string>();
  const otherFeedPosts = otherFactionPosts
    .filter((post) => {
      if (seenOtherFactionIds.has(post.factionId)) return false;
      seenOtherFactionIds.add(post.factionId);
      return true;
    })
    .slice(0, 4);

  // 活动发起人展示认证身份，行形状对齐派页/发现页共用的 ActivityFeedCard
  const activityRows = myActivities.map(({ creator, faction, ...activityRow }) => {
    const { employments, ...author } = creator;
    const mine = memberships.find((item) => item.factionId === faction.id);
    return {
      activity: {
        ...activityRow,
        creator: { ...author, identity: pickUserIdentity(employments, faction.companyId) },
      },
      slug: faction.slug,
      // 混排位置按活动发布时间和帖子发布时间对齐
      sortAt: activityRow.createdAt,
      factionName: faction.name,
      factionEmoji: faction.emoji,
      category: faction.category,
      isManager: Boolean(mine && mine.status === "ACTIVE" && mine.role !== "MEMBER"),
    };
  });
  const myActivitySignups = activityRows.length
    ? await prisma.activitySignup.findMany({
        where: {
          userId: viewer.user.id,
          activityId: { in: activityRows.map((row) => row.activity.id) },
        },
        select: { activityId: true, status: true },
      })
    : [];
  const goingIds = new Set(
    myActivitySignups.filter((item) => item.status === "GOING").map((item) => item.activityId),
  );

  return (
    <HomeFeed
      viewer={viewer}
      myFactions={memberships.map((item) => ({
        faction: item.faction,
        role: item.role,
        status: item.status,
      }))}
      posts={feedPosts}
      likedIds={likedIds}
      otherPosts={otherFeedPosts}
      activities={activityRows.map((row) => ({ ...row, going: goingIds.has(row.activity.id) }))}
      pendingLeaderFactionIds={pendingLeaderFactionIds}
      feedHasMore={feedTotal > posts.length}
      tickerItems={tickerItems}
    />
  );
}
