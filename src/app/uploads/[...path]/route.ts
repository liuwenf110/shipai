import { readFile } from "node:fs/promises";
import path from "node:path";
import { MIME_BY_EXT, resolveUploadPath } from "@/lib/upload";

/**
 * 运行期上传附件的兜底读取。
 *
 * 生产环境 `next start` 只在进程启动时把 public/ 目录扫成一份清单缓存起来，
 * 启动之后才落盘的图片（离职证明材料、帖子配图、活动配图）不在清单里，
 * 请求会直接 404，表现为后台审核页和用户端时间线一片破图，只能靠重启服务恢复。
 * 这里按请求实时读盘补上这条路径：启动前就存在的文件继续走静态通道，
 * 两者 URL 完全一致（库里存的仍是 /uploads/xxx），前端与历史数据都无需改动。
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  // 多级路径会被 resolveUploadPath 的字符白名单拒绝，这里只拼单层文件名
  const target = resolveUploadPath(segments.join("/"));
  if (!target) return new Response("Not found", { status: 404 });

  const buffer = await readFile(target).catch(() => null);
  if (!buffer) return new Response("Not found", { status: 404 });

  const type = MIME_BY_EXT[path.extname(target).toLowerCase()] ?? "application/octet-stream";
  const headers = new Headers({
    "Content-Type": type,
    "Content-Length": `${buffer.byteLength}`,
    // 文件名含随机串，内容不会原地变更，可以放心长缓存
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
  if (type === "application/pdf") headers.set("Content-Disposition", "inline");

  return new Response(buffer, { headers });
}
