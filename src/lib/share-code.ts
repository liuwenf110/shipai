import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 带参小程序码（getUnlimited）的 scene 短码映射。
 *
 * 为什么需要：getUnlimited 的 `page` 不能带 query，参数只能塞进 `scene`，且 scene 最长 32 字符。
 * 派页 `/factions/<slug>` 一般放得下（线上 28 张招募海报就是这么做的），但帖子 `/posts/<24 位 cuid>`
 * 已经 31 字符、活动 `/factions/<slug>/activities/<24 位 cuid>` 直接爆表，所以长路径统一换成
 * `/s/<8 位短码>`（7 字符）保住余量，扫码后由 /s/[code] 落地页还原成真实路径再跳转。
 *
 * 为什么落文件不落库：一批 scene 一旦印进海报就永久不可变（换码等于所有已流通的码作废），
 * 因此必须跨发布稳定。项目里同类的不可变产物已经有一套文件形态（sharp 的 .thumb-cache、
 * 上传的 public/uploads），整树发布的 tar 也只带 .next，新增一张表反而要 db push + generate
 * 才能上线。文件放在应用根，与 node_modules 同级，不受 .next 替换影响。
 */
export type ShareCode = { code: string; target: string; scene: string };

const FILE = path.join(process.cwd(), ".share-codes.json");
// 去掉 O/0/I/1/l 这几个海报上容易看错的字符；校验正则必须与 ALPHABET 同字集，
// 否则生成的码会被自己的读表校验判为非法（曾经 a-hj-np-z 误把 o 放进字母表）
const CODE_SAFE = /^[A-HJ-NP-Za-hj-np-z2-9]{8}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz";
/** scene 硬上限，超出微信直接报错 */
export const SCENE_MAX = 32;
/** 派页这类短路径直接烤进 scene，省掉一层映射，历史海报码口径也保持一致 */
export function sceneForCleanPath(cleanPath: string): string | null {
  const scene = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
  if (scene.length > SCENE_MAX) return null;
  return /^\/[A-Za-z0-9._~-]*(\/[A-Za-z0-9._~-]*)*$/.test(scene) ? scene : null;
}

type CodeMap = Record<string, string>;

async function readMap(): Promise<CodeMap> {
  const raw = await readFile(FILE, "utf8").catch(() => null);
  if (!raw) return {};
  const parsed = JSON.parse(raw) as unknown;
  // 文件被改坏时宁可当成空表重新分配，也不能让扫码链路整个 500
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: CodeMap = {};
  for (const [target, code] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof code === "string" && CODE_SAFE.test(code)) out[target] = code;
  }
  return out;
}

// 写入串行化：同一次部署里连开几个海报页会并发写同一份文件
let writing: Promise<void> = Promise.resolve();
async function writeMap(map: CodeMap): Promise<void> {
  const body = JSON.stringify(map, null, 1);
  writing = writing.then(async () => {
    await mkdir(path.dirname(FILE), { recursive: true }).catch(() => null);
    await writeFile(FILE, body).catch((error) => {
      console.error("[share-code] 短码表写入失败（扫码深链可能丢失，需重出码）:", error instanceof Error ? error.message : error);
    });
  });
  await writing;
}

function newCode(taken: Set<string>): string | null {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const bytes = randomBytes(8);
    let code = "";
    for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
    if (!taken.has(code)) return code;
  }
  return null;
}

/**
 * 取（或分配）某个站内路径的小程序码 scene。
 * 同一 target 永远拿到同一个码，重复生成图片不会让已流通的海报作废。
 */
export async function getShareCode(cleanPath: string): Promise<ShareCode | null> {
  const target = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
  const direct = sceneForCleanPath(target);
  if (direct) return { code: "", target, scene: direct };

  const map = await readMap();
  const taken = new Set(Object.values(map));
  let code = map[target];
  if (!code || !CODE_SAFE.test(code)) {
    code = newCode(taken) ?? "";
    if (!code) {
      console.error("[share-code] 连续 5 次短码碰撞，放弃分配:", target);
      return null;
    }
    map[target] = code;
    await writeMap(map);
  }
  return { code, target, scene: `/s/${code}` };
}

/** 扫码落地：短码 → 站内干净路径 */
export async function resolveShareCode(code: string): Promise<string | null> {
  if (!CODE_SAFE.test(code)) return null;
  const map = await readMap();
  // scene 里的字符集里 `/` 只可能是分隔符，仍要求单段以防万一
  for (const [target, value] of Object.entries(map)) {
    if (value === code && target.startsWith("/") && !target.startsWith("//")) return target;
  }
  return null;
}
