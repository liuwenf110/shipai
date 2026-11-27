import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { MIME_BY_EXT, resolveUploadPath } from "@/lib/upload";
import { THUMB_SHARE_H, THUMB_SHARE_W, clampThumbWidth } from "@/lib/thumb";

/**
 * GET /api/v1/thumb/<文件名>?w=480  站内上传图的按需缩略。
 *
 * 为什么需要：列表页把 0.5~6.2MB 的原图缩进 36px 头像圈和 max-h-28 封面里，
 * 发现页一次要拉 12MB 图片；站点是 HTTP/1.1（同域 6 条连接上限），这些下载会挤掉
 * 切页的 RSC 请求和未加载完的 JS chunk，真机上就表现为「点了标签半天不动」。
 * 实测 6.19MB 原图缩到 720w webp 只要 70.6KB。
 *
 * 安全与兜底：文件名沿用 resolveUploadPath 的单层白名单（拒绝任何带分隔符的名字），
 * 只有能解码的位图才走缩略，PDF / SVG / 解码失败一律回原文件字节，绝不因为缩略把图弄破。
 * 产物按 `原名@宽度.webp` 落盘复用；文件名本身含随机串不会原地变更，所以响应可以长缓存。
 */
export const dynamic = "force-dynamic";

const CACHE_DIR = path.join(process.cwd(), ".thumb-cache");
const QUALITY = 74;
// 只缩位图；其余扩展名直接回原文件
const RESIZABLE = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp", ".avif", ".gif"]);

// 同一 key 的并发请求合并成一次缩略，避免首屏十几张图同时打开时重复算
const pending = new Map<string, Promise<Buffer | null>>();

async function renderThumb(source: string, name: string, width: number, cover: boolean): Promise<Buffer | null> {
  // 5:4 卡片封面单独一个 key 后缀：它不是等宽缩放，与 ?w= 产物的长短边关系不同
  const key = cover ? `${name}@share54` : `${name}@${width}`;
  const cachedFile = path.join(CACHE_DIR, key);
  const hit = await readFile(cachedFile).catch(() => null);
  if (hit?.length) return hit;

  if (pending.has(key)) return pending.get(key)!;

  const task = (async () => {
    // rotate() 让 sharp 按 EXIF 摆正方向：手机直出的照片不转的话缩略后是躺着的
    const pipeline = sharp(source, { failOn: "error", limitInputPixels: 268402689 }).rotate();
    // 5:4 卡片封面走居中裁切（fit:cover 会把小图放大填满），其余按档位等宽缩略（不放大）
    const sized = cover
      ? pipeline.resize({ width: THUMB_SHARE_W, height: THUMB_SHARE_H, fit: "cover", position: "centre" })
      : pipeline.resize({ width, withoutEnlargement: true });
    const buffer = await sized.webp({ quality: QUALITY }).toBuffer();
    await mkdir(CACHE_DIR, { recursive: true });
    // 写失败（磁盘满/只读）只影响下次复用速度，不能拖垮本次响应
    await writeFile(cachedFile, buffer).catch(() => null);
    return buffer;
  })()
    .catch((error) => {
      console.error("[thumb] 缩略失败，回退原图:", name, error instanceof Error ? error.message : error);
      return null;
    })
    .finally(() => pending.delete(key));

  pending.set(key, task);
  return task;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const target = resolveUploadPath(name);
  if (!target) return new Response("Not found", { status: 404 });

  const width = clampThumbWidth(new URL(request.url).searchParams.get("w"));
  // ?cover=54：分享卡片封面固定 5:4 居中裁切（微信对卡片图的比例约定，原图比例随机会被裁得面目全非）
  const cover = new URL(request.url).searchParams.get("cover") === "54";
  const ext = path.extname(target).toLowerCase();
  const buffer = RESIZABLE.has(ext) ? await renderThumb(target, name, width, cover) : null;

  const headers = new Headers({
    // 地址带宽度参数但同一地址内容恒定，可以放心 immutable 长缓存
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });

  if (buffer) {
    headers.set("Content-Type", "image/webp");
    headers.set("Content-Length", `${buffer.byteLength}`);
    return new Response(new Uint8Array(buffer), { headers });
  }

  // 回退路径：非位图或缩略失败，原样回原文件（行为与 /uploads/xxx 一致）
  const raw = await readFile(target).catch(() => null);
  if (!raw) return new Response("Not found", { status: 404 });
  headers.set("Content-Type", MIME_BY_EXT[ext] ?? "application/octet-stream");
  headers.set("Content-Length", `${raw.byteLength}`);
  return new Response(new Uint8Array(raw), { headers });
}
