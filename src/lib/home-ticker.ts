import { prisma } from "@/lib/db";
import { PLATFORM_NAME } from "@/lib/constants";
import { filterViewableUserIds, factionAccessWhere, factionScopeWhere, type Audience } from "@/lib/scope";
import { timeAgo } from "@/lib/utils";

/** 首页消息栏的一条轮播消息：文案在服务端拼好，客户端只负责轮播与跳转 */
export type HomeTickerItem = {
  id: string;
  /** 消息类别标签，如「派主回归」「新活动」；图标由展示组件按标签映射 */
  tag: string;
  /** 完整文案 */
  text: string;
  /** 点击去向 */
  href: string;
  /** 展示用的相对时间（服务端算好：timeAgo 在客户端跑会因渲染时刻不同导致水合文本不一致） */
  when: string;
  /** 排序用的事件时间（毫秒） */
  at: number;
};

/** 消息栏总条数上限：太多反而没人看完 */
const TOTAL = 10;
/** 近 30 天视为「新鲜」 */
const RECENT_MS = 30 * 24 * 60 * 60 * 1000;
/** 标题/正文摘取长度，轮播是单行，长了要截断 */
const MAX_TITLE = 24;

function clip(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > MAX_TITLE ? `${text.slice(0, MAX_TITLE)}…` : text;
}

/**
 * 构造首页消息栏：派主待办审批 + 派主回归 + 近 30 天新活动 + 近 30 天热议帖。
 *
 * 「派主回归」的判定口径（与用户确认过）：回归指回归兴趣平台、不是回公司，
 * 因此只要该派的派主本人持有这家公司的离职认证（Employment.kind=ALUMNI 且 VERIFIED），
 * 他就是「原 XX 公司老派主」，仍在任并活跃即视为回归上十派。
 * 待办审批只统计当前用户自己管的派，因此需要 userId；游客不渲染消息栏、不会走到这里。
 * audience 为大厂 / 非大厂口径：轮播文案会带出派名、派主昵称，跳向的还是用户主页，
 * 所以既要按派过滤，也要对文案里出现的用户再判一次可见。
 * 全部文案由真实数据拼出，查不到就少播一条，不用假消息凑数。
 */
export async function buildHomeTicker(userId: string, audience: Audience): Promise<HomeTickerItem[]> {
  const since = new Date(Date.now() - RECENT_MS);

  const [managedFactions, leaders, activities, hotPosts] = await Promise.all([
    // 当前用户能以派主/副派主身份审批的派
    prisma.faction.findMany({
      where: {
        status: "ACTIVE",
        members: { some: { userId, status: "ACTIVE", role: { in: ["LEADER", "ADMIN"] } } },
      },
      select: { id: true, name: true, slug: true },
    }),
    // 派主仍是在任派主（leaderId 指向本人）；离职认证是否属于该派公司，在应用层再筛
    prisma.faction.findMany({
      where: {
        status: "ACTIVE",
        leaderId: { not: null },
        ...factionScopeWhere(audience),
      },
      include: {
        company: true,
        leader: {
          select: {
            id: true,
            nickname: true,
            // 取该派所属公司的离职认证记录，作为「原 XX 公司」的出处
            employments: {
              where: { kind: "ALUMNI", status: "VERIFIED" },
              select: { companyId: true, company: { select: { shortName: true } } },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 12,
    }),
    prisma.activity.findMany({
      where: {
        createdAt: { gt: since },
        faction: { AND: [{ status: "ACTIVE" }, factionAccessWhere(audience, userId)] },
      },
      include: { faction: true, creator: { select: { id: true, nickname: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.post.findMany({
      where: {
        status: "PUBLISHED",
        createdAt: { gt: since },
        faction: {
          AND: [{ status: "ACTIVE" }, factionAccessWhere(audience, userId)],
        },
        OR: [{ commentCount: { gte: 3 } }, { likeCount: { gte: 3 } }],
      },
      include: { faction: true, author: { select: { id: true, nickname: true } } },
      orderBy: [{ commentCount: "desc" }, { likeCount: "desc" }, { createdAt: "desc" }],
      take: 6,
    }),
  ]);

  const items: HomeTickerItem[] = [];

  // 文案里会点名、点进去还会跳到个人主页的几个人（派主 / 发起人 / 作者），跨阵营就整条不播；
  // 与「查不到就少播一条」同一原则，不留一个点进去 404 的入口
  const visibleUserIds = await filterViewableUserIds(
    audience,
    userId,
    [
      ...leaders.map((item) => item.leader?.id ?? ""),
      ...activities.map((item) => item.creatorId),
      ...hotPosts.map((item) => item.authorId),
    ].filter(Boolean),
  );

  // 待办审批排在最前：派主打开首页第一眼就该看到要处理的申请
  if (managedFactions.length) {
    const pendingGroups = await prisma.factionMember.groupBy({
      by: ["factionId"],
      where: { factionId: { in: managedFactions.map((item) => item.id) }, status: "PENDING" },
      _count: { _all: true },
      _max: { appliedAt: true },
    });
    for (const group of pendingGroups) {
      const faction = managedFactions.find((item) => item.id === group.factionId);
      if (!faction || !group._count._all) continue;
      const at = group._max.appliedAt?.getTime() ?? 0;
      items.push({
        id: `todo-${faction.id}`,
        tag: "待办审批",
        text: `「${faction.name}」有 ${group._count._all} 条加入申请等你审批`,
        href: `/factions/${faction.slug}/manage?tab=members`,
        when: at ? timeAgo(new Date(at)) : "刚刚",
        at,
      });
    }
  }

  for (const faction of leaders) {
    const leader = faction.leader;
    if (!leader) continue;
    if (!visibleUserIds.has(leader.id)) continue;
    // 只认「该派所属公司」的离职认证，避免拿他在别家的校友身份硬凑文案
    const alumni = leader.employments.find((employment) => employment.companyId === faction.companyId);
    if (!alumni) continue;
    items.push({
      id: `leader-${faction.id}`,
      tag: "派主回归",
      text: `恭喜「${faction.name}」原${alumni.company.shortName}老派主${leader.nickname}回归${PLATFORM_NAME}`,
      href: `/users/${leader.id}`,
      when: timeAgo(faction.updatedAt),
      at: faction.updatedAt.getTime(),
    });
  }

  for (const activity of activities) {
    if (!visibleUserIds.has(activity.creatorId)) continue;
    items.push({
      id: `activity-${activity.id}`,
      tag: "新活动",
      text: `${activity.creator.nickname} 在「${activity.faction.name}」发起了「${clip(activity.title)}」`,
      href: `/users/${activity.creatorId}`,
      when: timeAgo(activity.createdAt),
      at: activity.createdAt.getTime(),
    });
  }

  for (const post of hotPosts) {
    if (!visibleUserIds.has(post.authorId)) continue;
    const summary = clip(post.title ?? post.content);
    items.push({
      id: `post-${post.id}`,
      tag: "热议",
      text: `「${post.faction.name}」的《${summary}》已有 ${post.commentCount} 条评论`,
      href: `/users/${post.authorId}`,
      when: timeAgo(post.createdAt),
      at: post.createdAt.getTime(),
    });
  }

  // 待办审批 > 派主回归（本次需求主角）> 其他动态，同类再按事件时间由新到旧
  const rank = (item: HomeTickerItem) =>
    item.tag === "待办审批" ? 2 : item.tag === "派主回归" ? 1 : 0;
  return items
    .sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(b) - rank(a);
      return b.at - a.at;
    })
    .slice(0, TOTAL);
}
