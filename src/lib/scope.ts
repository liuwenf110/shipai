import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * 大厂 / 非大厂人群隔离的**单一真源**。
 *
 * 隔离以「派」为唯一单元：跨阵营用户看不到对方阵营的派，派内的帖子、活动、评论、
 * 成员名单因此天然被隔离，无需在每处内容查询里再补一遍用户过滤。
 * 只有三类不经过派的人群出口需要单独判定：用户主页、私信可达、关注与搜索命中人
 * （统一走 canViewUser）。
 *
 * 人群三值：
 *   CORP     大厂——持有 12 家（Company.scope=CORP）任一公司的 VERIFIED 认证
 *   OUTSIDER 非大厂——通过外部人工审核认证，或注册后尚未做任何认证
 *   ADMIN    运营账号在前台按全量浏览，便于自测与巡检（后台本来就全量）
 *
 * 两条刻意留出的口子：
 *   GUEST_AUDIENCE 未登录游客的口径，改一个常量即可整体切回「游客看大厂」；
 *   成员豁免     运营跨阵营指派派主、历史成员等场景下，治理者不该看不见自己管的派。
 */

export type Audience = "CORP" | "OUTSIDER" | "ADMIN";

/** 未登录游客与未认证用户同口径：只看勾选了「非大厂」的派。 */
export const GUEST_AUDIENCE: Exclude<Audience, "ADMIN"> = "OUTSIDER";

/** 公司阵营：只有显式标 OUTSIDER 的行算非大厂，12 家存量公司不填即大厂（零迁移） */
export function companyScope(company?: { scope?: string | null } | null): "CORP" | "OUTSIDER" {
  return company?.scope === "OUTSIDER" ? "OUTSIDER" : "CORP";
}

type ScopeEmployment = { company?: { scope?: string | null } | null };

type AudienceViewer = {
  user?: { role?: string } | null;
  verifiedEmployments?: ScopeEmployment[];
} | null | undefined;

/** 运营账号前台也按全量，避免未认证的管理员自己看不到大厂派 */
export function isAdminViewer(viewer: AudienceViewer): boolean {
  return viewer?.user?.role === "ADMIN";
}

/** 由已认证雇佣关系推导人群：只要有一家大厂认证就归大厂（互斥规则在提交认证时保证） */
export function audienceOfEmployments(verified: ScopeEmployment[]): Exclude<Audience, "ADMIN"> {
  return verified.some((item) => (item.company?.scope ?? "CORP") === "CORP") ? "CORP" : "OUTSIDER";
}

/** 当前浏览者的人群口径：游客 → GUEST_AUDIENCE；运营 → ADMIN；无任何认证 → OUTSIDER */
export function audienceOfViewer(viewer: AudienceViewer): Audience {
  if (isAdminViewer(viewer)) return "ADMIN";
  if (!viewer) return GUEST_AUDIENCE;
  return audienceOfEmployments(viewer.verifiedEmployments ?? []);
}

/** 派本身可见的条件（不含成员豁免） */
export function factionScopeWhere(audience: Audience): Record<string, boolean> {
  if (audience === "ADMIN") return {};
  return audience === "CORP" ? { visibleToCorp: true } : { visibleToOutsider: true };
}

/**
 * 派列表/详情的完整可见条件：阵营可见 **或** 本人已在该派内。
 * 未登录时无从豁免，只按阵营过滤。
 */
export function factionAccessWhere(audience: Audience, userId?: string | null) {
  const scope = factionScopeWhere(audience);
  if (audience === "ADMIN") return scope;
  if (!userId) return scope;
  return {
    OR: [
      scope,
      { members: { some: { userId, status: { in: ["ACTIVE", "PENDING"] } } } },
    ],
  };
}

/** 帖子 / 活动按所属派过滤的关系条件（内容不单独判定，跟随派） */
export function contentScopeWhere(audience: Audience, userId?: string | null) {
  const faction = userId ? factionAccessWhere(audience, userId) : factionScopeWhere(audience);
  // 空条件时不包一层 faction，Prisma 对空对象的关系过滤等价于全部，但显式判断更省一次 JOIN
  return Object.keys(faction).length === 0 ? {} : { faction };
}

/** 派可见人群的一句话描述：后台列表标识与操作审计共用，避免两处各写一套文案 */
export function factionScopeLabel(
  faction: { visibleToCorp: boolean; visibleToOutsider: boolean },
): string {
  if (faction.visibleToCorp && faction.visibleToOutsider) return "大厂+非大厂";
  return faction.visibleToCorp ? "仅大厂" : "仅非大厂";
}

/** 单个派是否对该人群可见（服务端二次校验，防止直接猜 slug 访问） */
export function factionVisibleTo(
  faction: { visibleToCorp: boolean; visibleToOutsider: boolean },
  audience: Audience,
): boolean {
  if (audience === "ADMIN") return true;
  return audience === "CORP" ? faction.visibleToCorp : faction.visibleToOutsider;
}

/** 用户间可见性：同口径才可见，即大厂 ↔ 非大厂/未认证 互不可见 */
export function audiencesVisible(a: Audience, b: Audience): boolean {
  return a === "ADMIN" || b === "ADMIN" ? true : a === b;
}

/** 目标用户所属人群：按其 VERIFIED 认证所挂公司的 scope 判定，无任何认证即非大厂口径 */
export async function audienceOfUser(userId: string): Promise<Exclude<Audience, "ADMIN">> {
  const corp = await prisma.employment.findFirst({
    where: { userId, status: "VERIFIED", company: { scope: "CORP" } },
    select: { id: true },
  });
  return corp ? "CORP" : "OUTSIDER";
}

/**
 * 只持有 session user 的人群口径（页面与 API 通用）：一次认证表查询，
 * 比 getViewer 轻得多，给那些本来就没取 viewer 的落点用。
 */
export async function audienceOfUserOrAdmin(
  user: { id: string; role: string } | null,
): Promise<Audience> {
  if (!user) return GUEST_AUDIENCE;
  if (user.role === "ADMIN") return "ADMIN";
  return audienceOfUser(user.id);
}

/**
 * 单派访问闸门：阵营不可见且本人不在派内即视为不存在。
 * 派详情页、活动详情、API 与写操作 action 共用同一判定，语义与 factionAccessWhere 一致。
 */
export async function canAccessFaction(
  factionId: string,
  audience: Audience,
  userId?: string | null,
): Promise<boolean> {
  if (audience === "ADMIN") return true;
  const scopeField = audience === "CORP" ? "visibleToCorp" : "visibleToOutsider";
  const hit = await prisma.faction.findFirst({
    where: {
      id: factionId,
      OR: [
        { [scopeField]: true },
        ...(userId
          ? [{ members: { some: { userId, status: { in: ["ACTIVE", "PENDING"] } } } }]
          : []),
      ],
    },
    select: { id: true },
  });
  return Boolean(hit);
}

/**
 * 身份互斥校验：一侧认证进行中或已通过时，不允许再提交另一侧，返回拦下的提示语（null 即放行）。
 * 人群口径由 VERIFIED 认证推导，若两侧同时通过，隔离就只剩一边生效；
 * PENDING 也一并拦住，否则两条待审记录并存时「谁先被通过」随机决定归属。
 * 提交侧与后台审核放行侧都要过这道闸（防两边同时提交、先后审核的竞态）。
 */
export async function identityScopeConflict(
  userId: string,
  want: "CORP" | "OUTSIDER",
): Promise<string | null> {
  const rows = await prisma.employment.findMany({
    where: { userId, status: { in: ["VERIFIED", "PENDING"] } },
    select: { status: true, company: { select: { scope: true } } },
  });

  const other = want === "CORP" ? "OUTSIDER" : "CORP";
  const hit = rows.find((item) => companyScope(item.company) === other);
  if (!hit) return null;

  const label = other === "CORP" ? "大厂" : "非大厂";
  return hit.status === "PENDING"
    ? `你的${label}身份认证正在审核中，出结果前不能同时认证另一种身份`
    : `你已完成${label}身份认证，如需改认证${want === "CORP" ? "非大厂" : "大厂"}身份，请联系运营`;
}

/**
 * 当前浏览者能否看到目标用户——用户主页、私信、关注、搜索人四处共用同一判定。
 * 本人对自己恒可见。
 */
export async function canViewUser(
  viewerAudience: Audience,
  viewerUserId: string | null,
  targetUserId: string,
): Promise<boolean> {
  if (viewerAudience === "ADMIN") return true;
  if (viewerUserId === targetUserId) return true;
  return audiencesVisible(viewerAudience, await audienceOfUser(targetUserId));
}

/**
 * 用户维度的阵营过滤片段（直接铺进 user.findMany 的 where，或包在 to-one 关系的 is 里）。
 * OUTSIDER 取「不是大厂认证」的反集，天然包含注册未认证人群；ADMIN 返回 undefined 即不收口。
 * 能用 SQL 收口的列表优先用它，而不是拉回来再按人过滤，不然分页条数会泄人数。
 */
export function userScopeWhere(audience: Audience): Prisma.UserWhereInput | undefined {
  if (audience === "ADMIN") return undefined;
  const corp: Prisma.UserWhereInput = {
    employments: { some: { status: "VERIFIED", company: { scope: "CORP" } } },
  };
  return audience === "CORP" ? corp : { NOT: corp };
}

/**
 * 批量判定可见用户：轮播、成员名单这类一次要判很多人的落点用它，避免 N+1。
 * 语义与 canViewUser 一致（运营全量、本人恒可见）。
 */
export async function filterViewableUserIds(
  viewerAudience: Audience,
  viewerUserId: string | null,
  userIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(userIds)];
  if (viewerAudience === "ADMIN") return new Set(ids);
  if (!ids.length) return new Set();

  const rows = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      employments: {
        where: { status: "VERIFIED", company: { scope: "CORP" } },
        select: { id: true },
      },
    },
  });

  const visible = new Set<string>();
  for (const row of rows) {
    const target: Audience = row.employments.length ? "CORP" : "OUTSIDER";
    if (row.id === viewerUserId || audiencesVisible(viewerAudience, target)) visible.add(row.id);
  }
  return visible;
}
