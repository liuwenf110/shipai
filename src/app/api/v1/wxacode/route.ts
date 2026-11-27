import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { apiError, requireApiUser } from "@/lib/api";
import { getStableAccessToken } from "@/lib/sec";
import { SCENE_MAX, getShareCode, sceneForCleanPath } from "@/lib/share-code";

/**
 * GET /api/v1/wxacode?path=/factions/music  带参小程序码（getUnlimited）出图。
 *
 * 用途：招募海报、公众号推文、群图片里那枚「人人可扫」的码。派页这类短路径直接把落地
 * 路径烤进 scene（与线上已流通的 28 张分派海报同口径），帖子/活动这类超长的走 /s/<短码> 映射，
 * 由 /s/[code] 落地页还原成真实详情页。
 *
 * 三条硬约束（实测）：page 不能带 query；scene 最长 32 字符；旧方形码接口已下线只有
 * getwxacodeunlimit 可用，且失败时返回 JSON 而非图片，批量脚本只按 content-type 判成功
 * 会把 404 空体当成一张 0 字节的码写出去，所以这里同时校验 content-type 与字节数。
 *
 * 码图按 scene 落盘复用（.wxacode-cache）：同一目标的 scene 恒定，出图结果也恒定，
 * 印进海报的码绝不能变，因此重复生成不打微信接口。
 */
export const dynamic = "force-dynamic";

const CACHE_DIR = path.join(process.cwd(), ".wxacode-cache");
/** web-view 壳的容器页：scene 由它 onLoad.query.scene 解析成 H5 子页路径 */
const MP_PAGE = process.env.WX_MP_PAGE ?? "pages/webview/index";
const MIN_JPEG = 200;

async function resolveTarget(input: { path?: string | null; kind?: string | null; id?: string | null }): Promise<string | null> {
  const raw = (input.path ?? "").trim();
  if (raw) {
    // 只收站内干净路径：必须单斜杠开头，不能带协议、域名或 // 开头（那是协议相对 URL）
    if (!raw.startsWith("/") || raw.startsWith("//") || /^[a-z]:/i.test(raw)) return null;
    if (raw.length > 120 || /[?#\s]/.test(raw)) return null;
    return raw;
  }
  const id = (input.id ?? "").trim();
  if (!id) return null;
  if (input.kind === "post") {
    const post = await prisma.post.findUnique({ where: { id }, select: { id: true } });
    return post ? `/posts/${post.id}` : null;
  }
  if (input.kind === "activity") {
    const activity = await prisma.activity.findUnique({
      where: { id },
      select: { id: true, faction: { select: { slug: true } } },
    });
    return activity ? `/factions/${activity.faction.slug}/activities/${activity.id}` : null;
  }
  return null;
}

function jsonError(res: Response, buffer: Buffer) {
  const text = buffer.subarray(0, 300).toString("utf8");
  try {
    const parsed = JSON.parse(text) as { errcode?: number; errmsg?: string };
    return `${parsed.errcode ?? res.status} ${parsed.errmsg ?? "微信未返回图片"}`;
  } catch {
    return `${res.status} 响应不是图片`;
  }
}

export async function GET(request: Request) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  // 出码要消耗微信接口配额且图可公开访问，只放行运营后台
  if (user?.role !== "ADMIN") return apiError("仅运营后台可生成小程序码", 403);

  const url = new URL(request.url);
  const target = await resolveTarget({
    path: url.searchParams.get("path"),
    kind: url.searchParams.get("kind"),
    id: url.searchParams.get("id"),
  });
  if (!target) return apiError("缺少或非法的落地路径（path 或 kind+id）", 400);

  const entry = await getShareCode(target);
  if (!entry) return apiError("短码分配失败，请重试", 500);
  // 派页这类直连 scene 与映射 scene 分开算：映射后必然更短
  const scene = sceneForCleanPath(target) ?? entry.scene;
  if (scene.length > SCENE_MAX) return apiError(`scene 超出 ${SCENE_MAX} 字符上限：${scene}`, 400);

  const rawWidth = Number(url.searchParams.get("width") ?? 280);
  const width = Math.min(1280, Math.max(280, Number.isFinite(rawWidth) ? rawWidth : 280));

  // 文件名不能直接用 scene（含 `/`），用内容摘要当 key，可读性靠 map 文件与日志
  const key = Buffer.from(`${scene}|${width}`).toString("hex").slice(0, 32);
  const cachedFile = path.join(CACHE_DIR, `${key}.jpg`);
  const headers = {
    "Content-Type": "image/jpeg",
    // 码图本身恒定，但 env_version=release 之前生成的码对普通用户不可扫，缓存一天足够
    "Cache-Control": "public, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    "X-Share-Scene": encodeURIComponent(scene),
  };
  const cached = await readFile(cachedFile).catch(() => null);
  if (cached && cached.length > MIN_JPEG) return new Response(new Uint8Array(cached), { headers });

  const token = await getStableAccessToken();
  if (!token) return apiError("微信凭据未配置或取 token 失败（WX_APPID/WX_SECRET）", 502);

  const wxRes = await fetch(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scene,
      page: MP_PAGE,
      width,
      // 目标页在小程序里就是壳的容器页，check_path 关掉避免「页面未发布」误报
      check_path: false,
      // release：只有已发布版本生成的码才对普通用户可扫
      env_version: "release",
      line_color: { r: 26, g: 26, b: 26 },
    }),
  }).catch(() => null);

  if (!wxRes) return apiError("微信接口请求失败", 502);
  const buffer = Buffer.from(await wxRes.arrayBuffer());
  const contentType = wxRes.headers.get("content-type") ?? "";
  if (contentType.includes("json") || buffer.length < MIN_JPEG) {
    console.error("[wxacode] 出码失败:", scene, jsonError(wxRes, buffer));
    return apiError(`微信出码失败：${jsonError(wxRes, buffer)}`, 502);
  }

  await mkdir(CACHE_DIR, { recursive: true }).catch(() => null);
  // 落盘失败只影响下次复用速度，不能拖垮本次响应
  await writeFile(cachedFile, buffer).catch(() => null);
  return new Response(new Uint8Array(buffer), { headers });
}
