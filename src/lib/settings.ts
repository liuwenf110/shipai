import "server-only";

import { prisma } from "@/lib/db";

/**
 * 运营侧前台开关：一 key 一行存在 SiteSetting，值统一用 "1"/"0" 字符串。
 * 只放「随时可能要关」的展示类开关（派主墙这种），业务状态一律不进这里，
 * 避免这里变成第二套真相来源。读不到行时按调用方给的默认值走。
 */

export const SITE_FLAGS = {
  /** 发现页派主墙：关掉后前台不再展示，派主照片在派卡片/派详情页仍照常 */
  LEADER_WALL: "leaderWall",
} as const;

export type SiteFlagKey = (typeof SITE_FLAGS)[keyof typeof SITE_FLAGS];

/** 逐条不上墙的开关键前缀：leaderWall:<factionId>，避开与总开关同名 */
const LEADER_WALL_HIDE_PREFIX = `${SITE_FLAGS.LEADER_WALL}:`;

export async function getSiteFlag(key: SiteFlagKey, fallback = true): Promise<boolean> {
  const row = await prisma.siteSetting.findUnique({ where: { key } });
  if (!row) return fallback;
  return row.value === "1";
}

/** 写开关：upsert 保证第一次也能落库，调用方（后台 action）负责鉴权与 revalidate */
export async function setSiteFlag(key: SiteFlagKey, on: boolean): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key },
    update: { value: on ? "1" : "0" },
    create: { key, value: on ? "1" : "0" },
  });
}

/** 派主墙里被单独关掉「上墙」的派 id 集合（无行即默认上墙） */
export async function getHiddenLeaderWallFactionIds(): Promise<Set<string>> {
  const rows = await prisma.siteSetting.findMany({
    where: { key: { startsWith: LEADER_WALL_HIDE_PREFIX }, value: "0" },
    select: { key: true },
  });
  return new Set(rows.map((row) => row.key.slice(LEADER_WALL_HIDE_PREFIX.length)));
}

/** 单条上墙开关：同一张 kv 表存 factionId 后缀，不为展示需求再给 Faction 加字段 */
export async function setLeaderWallHidden(factionId: string, hidden: boolean): Promise<void> {
  const key = `${LEADER_WALL_HIDE_PREFIX}${factionId}`;
  await prisma.siteSetting.upsert({
    where: { key },
    update: { value: hidden ? "0" : "1" },
    create: { key, value: hidden ? "0" : "1" },
  });
}
