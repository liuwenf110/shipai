import "server-only";

import { prisma } from "@/lib/db";

/**
 * 派活跃度：每次请求实时聚合，刻意不落冗余字段。
 * 站点里 memberCount / postCount 这类冗余计数已经有过「写入点漏改就永久漂移」的教训，
 * 而活跃度天然是多信号加权结果，落库就要在发帖、评论、点赞、退派等所有写入点同步维护，
 * 收益（省几毫秒排序）远小于成本（一堆对不上的数字）。派只有几十个，聚合查询是常数条。
 *
 * 注意：排序不以 score 为主键（见 rankFactions），这里的分值与评论/点赞只用于两项
 * 收口比较和后台展示「活跃度明细」，所以聚合不能省。
 */

/** 近期窗口：这段时间内的发帖与评论按翻倍权重计入 */
export const ACTIVITY_WINDOW_DAYS = 30;

export type FactionActivity = {
  members: number;
  posts: number;
  comments: number;
  likes: number;
  recentPosts: number;
  recentComments: number;
  score: number;
};

// 权重口径：成员 1 / 动态 2 / 评论 1 / 点赞 0.5；近 30 天的动态与评论权重翻倍（各再 +2 / +1）
const W_MEMBER = 1;
const W_POST = 2;
const W_COMMENT = 1;
const W_LIKE = 0.5;
const RECENT_POST_BONUS = 2;
const RECENT_COMMENT_BONUS = 1;

const EMPTY: FactionActivity = {
  members: 0,
  posts: 0,
  comments: 0,
  likes: 0,
  recentPosts: 0,
  recentComments: 0,
  score: 0,
};

/**
 * 全站派的活跃度，返回 factionId → 明细与分值。
 * 评论与点赞只挂在 Post 上，所以先取「已发布帖 → 派」的归属表，再把按 postId 聚合的结果归到派。
 */
export async function loadFactionActivity(): Promise<Map<string, FactionActivity>> {
  const since = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [ownedPosts, memberGroups, postGroups, recentPostGroups, commentGroups, recentCommentGroups, likeGroups] =
    await Promise.all([
      prisma.post.findMany({ where: { status: "PUBLISHED" }, select: { id: true, factionId: true } }),
      prisma.factionMember.groupBy({ by: ["factionId"], where: { status: "ACTIVE" }, _count: { _all: true } }),
      prisma.post.groupBy({ by: ["factionId"], where: { status: "PUBLISHED" }, _count: { _all: true } }),
      prisma.post.groupBy({
        by: ["factionId"],
        where: { status: "PUBLISHED", createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.comment.groupBy({ by: ["postId"], where: { status: "PUBLISHED" }, _count: { _all: true } }),
      prisma.comment.groupBy({
        by: ["postId"],
        where: { status: "PUBLISHED", createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.postLike.groupBy({ by: ["postId"], _count: { _all: true } }),
    ]);

  // 只统计已发布帖底下的评论与点赞，隐藏/删除的帖子不该再把热度贡献给派
  const ownerOf = new Map(ownedPosts.map((post) => [post.id, post.factionId]));
  const map = new Map<string, FactionActivity>();
  const entry = (factionId: string): FactionActivity => {
    const current = map.get(factionId);
    if (current) return current;
    const fresh = { ...EMPTY };
    map.set(factionId, fresh);
    return fresh;
  };

  for (const group of memberGroups) entry(group.factionId).members = group._count._all;
  for (const group of postGroups) entry(group.factionId).posts = group._count._all;
  for (const group of recentPostGroups) entry(group.factionId).recentPosts = group._count._all;
  for (const group of commentGroups) {
    const factionId = ownerOf.get(group.postId);
    if (factionId) entry(factionId).comments += group._count._all;
  }
  for (const group of recentCommentGroups) {
    const factionId = ownerOf.get(group.postId);
    if (factionId) entry(factionId).recentComments += group._count._all;
  }
  for (const group of likeGroups) {
    const factionId = ownerOf.get(group.postId);
    if (factionId) entry(factionId).likes += group._count._all;
  }

  for (const activity of map.values()) {
    activity.score =
      activity.members * W_MEMBER +
      activity.posts * W_POST +
      activity.comments * W_COMMENT +
      activity.likes * W_LIKE +
      activity.recentPosts * RECENT_POST_BONUS +
      activity.recentComments * RECENT_COMMENT_BONUS;
  }

  return map;
}

/** 取单个派的活跃度，没参与过任何互动时返回全 0 */
export function activityOf(map: Map<string, FactionActivity>, factionId: string): FactionActivity {
  return map.get(factionId) ?? EMPTY;
}

type RankableFaction = { id: string; sortOrder: number; memberCount: number; createdAt: Date };

/**
 * 派列表的统一排序：运营在后台设的「展示位置权重」仍然最优先（钉住的派恒在前面），
 * 权重相同的派之间**先看成员数、再看动态数**——这是用户能直接看到的两个规模指标，
 * 谁多谁在前，不会出现「5 人的派因为评论多排在 7 人的派前面」这种解释不通的顺序。
 * 之后再依次用近 30 天动态+评论、综合活跃度分值收口，最后按建派时间保证同序稳定可复现。
 * 状态不再参与排序——此前 status asc 会让筹备中的派因字母序插到运营中的派前面。
 * 返回新数组，不改动入参。
 */
export function rankFactions<T extends RankableFaction>(rows: T[], activity: Map<string, FactionActivity>): T[] {
  return [...rows].sort((a, b) => {
    const byWeight = b.sortOrder - a.sortOrder;
    if (byWeight) return byWeight;
    const byMembers = b.memberCount - a.memberCount;
    if (byMembers) return byMembers;
    const byPosts = activityOf(activity, b.id).posts - activityOf(activity, a.id).posts;
    if (byPosts) return byPosts;
    const byRecent = recentActivityOf(activity, b.id) - recentActivityOf(activity, a.id);
    if (byRecent) return byRecent;
    const byScore = activityOf(activity, b.id).score - activityOf(activity, a.id).score;
    if (byScore) return byScore;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/** 近 30 天的动态与评论之和，作为成员数、动态数都相同时的第三档比较 */
export function recentActivityOf(map: Map<string, FactionActivity>, factionId: string): number {
  const activity = activityOf(map, factionId);
  return activity.recentPosts + activity.recentComments;
}

/**
 * 排序后取分页：动态数要按「已发布」口径统计，SQL 层的 orderBy 排不出来，
 * 只能先取全量再内存排序后切片。派的数量级是几十，全量取回代价低于给每个派维护一个同步得分字段。
 */
export function sliceFactions<T extends RankableFaction>(
  rows: T[],
  activity: Map<string, FactionActivity>,
  skip = 0,
  take?: number,
): T[] {
  const ranked = rankFactions(rows, activity);
  return take === undefined ? ranked.slice(skip) : ranked.slice(skip, skip + take);
}
