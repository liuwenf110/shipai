import "server-only";

import crypto from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const MAX_SIZE = 6 * 1024 * 1024;
const ALLOWED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
];

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "application/pdf": ".pdf",
};

/** 按扩展名回推响应类型，供 /uploads 动态路由使用 */
export const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml",
};

/** 附件落盘目录：库里存相对路径，展示时按部署前缀拼接 */
export const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/**
 * 校验文件名并解析为磁盘绝对路径。
 * 只接受 `saveProofFile` 生成的 `<时间戳36>-<8位hex>.<ext>` 形态（含历史遗留名），
 * 拒绝任何带分隔符的名字，避免动态路由被用作任意文件读取。
 */
export function resolveUploadPath(name: string): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(name)) return null;
  const target = path.join(UPLOAD_DIR, name);
  const rel = path.relative(UPLOAD_DIR, target);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return target;
}

/** 保存上传的证明材料到 public/uploads，返回可访问的相对路径 */
export async function saveProofFile(file: File | null): Promise<string | null> {
  if (!file || typeof file === "string" || file.size === 0) return null;
  if (file.size > MAX_SIZE) {
    throw new Error("附件不能超过 6MB");
  }
  if (!ALLOWED.includes(file.type)) {
    throw new Error("仅支持 JPG / PNG / WEBP / PDF 格式");
  }

  await mkdir(UPLOAD_DIR, { recursive: true });

  const ext = EXT_BY_TYPE[file.type] ?? path.extname(file.name) ?? ".bin";
  const filename = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  // 库里只存相对路径，展示时再按部署前缀拼接
  return `/uploads/${filename}`;
}
