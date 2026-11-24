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

  // 首页只用到成员身份本身（活动卡据此判断可否管理），不再需要派/公司详情
  const memberships = await prisma.factionMember.findMany({
    where: { userId: viewer.user.id, status: { in: ["ACTIVE", "PENDING"] } },
    select: { factionId: true, role: true, status: true },
    orderBy: { joinedAt: "asc" },
  });

  const audience = viewer.audience;

  const [tickerItems, upcomingActivities, recruitPosts] = await Promise.all([
    // 顶部消息栏：老派主回归等真实动态，外加当前派主的待审批待办
    buildHomeTicker(viewer.user.id, audience),
    // 首页活动列表：可见派里未开始的报名中活动，按临近开场优先，全量展示
    prisma.activity.findMany({
      where: {
        status: "OPEN",
        startAt: { gt: new Date() },
        faction: { status: "ACTIVE", ...factionScopeWhere(audience) },
      },
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
    }),
    // 公开招募流：所有勾选「首页公开招募」的已发布帖（含自己派），不过滤不派内去重，全量上首页
    prisma.post.findMany({
      where: {
        status: "PUBLISHED",
        recruit: true,
        faction: {
          AND: [{ status: "ACTIVE" }, factionAccessWhere(audience, viewer.user.id)],
        },
      },
      include: {
        author: { select: IDENTIFIED_USER },
        faction: { include: { company: true } },
      },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  // 招募卡也要显示本人点过赞的数：服务端直出，不像派内新鲜事那样走分页 API
  const likedIds = recruitPosts.length
    ? (
        await prisma.postLike.findMany({
          where: { userId: viewer.user.id, postId: { in: recruitPosts.map((post) => post.id) } },
          select: { postId: true },
        })
      ).map((item) => item.postId)
    : [];

  // 招募帖作者附带认证身份（公司 + 在职/离职），同派公司优先
  const recruitRows = recruitPosts.map((post) =>
    withPostIdentity({ ...post, liked: likedIds.includes(post.id) }, post.faction.companyId),
  );

  // 活动发起人展示认证身份；本人所在派附带管理台身份（派主/副派主可管报名）
  const activityRows = upcomingActivities.map(({ creator, faction, ...activityRow }) => {
    const { employments, ...author } = creator;
    const mine = memberships.find((item) => item.factionId === faction.id);
    return {
      activity: {
        ...activityRow,
        creator: { ...author, identity: pickUserIdentity(employments, faction.companyId) },
      },
      slug: faction.slug,
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
      activities={activityRows.map((row) => ({ ...row, going: goingIds.has(row.activity.id) }))}
      recruitPosts={recruitRows}
      tickerItems={tickerItems}
    />
  );
}
