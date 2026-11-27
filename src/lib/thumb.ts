import { BASE_PATH, withBasePath } from "@/lib/base-path";

/**
 * 站内图片缩略地址。
 *
 * 动机（实测）：发现页 16 张唯一图片合计 12.09MB，其中 9.7MB 只是两张被缩进 max-h-28 列表卡的
 * 帖子原图，其余是 36px 圆圈里加载的 0.5~0.8MB 头像原图。站点又是 HTTP/1.1（同域最多 6 条并发连接），
 * 这些下载会和「切页的 RSC 请求」「尚未加载完的 JS chunk」抢连接——限速复现过：
 * 图还在飞时点底部标签，2.7s 内页面毫无反应，最后走整页跳转。
 * 所以列表侧一律走 ?w= 缩略（实测 6.19MB 原图 → 720w webp 70.6KB），详情侧继续用原图。
 */

/** 允许的宽度档位：与卡片实际渲染尺寸（含 2x DPR）对齐，超出档位就近取大 */
export const THUMB_WIDTHS = [160, 480, 750, 1080];

/** 头像与列表小锚点：最大渲染 80px（xl 头像），2x DPR 取 160 */
export const THUMB_AVATAR = 160;
/** 精简卡封面：最大渲染约 350px 宽 × 112px 高，2x DPR 取 750 已够，缩到 480 视觉无损 */
export const THUMB_CARD_COMPACT = 480;
/** 完整卡封面：内容区最大 768px 宽 */
export const THUMB_CARD = 750;

/** 把任意请求宽度收敛到档位，非法值退回完整卡宽度（入参直接来自 query，允许字符串） */
export function clampThumbWidth(width: string | number | null | undefined): number {
  const value = Number(width);
  if (!Number.isFinite(value) || value <= 0) return THUMB_CARD;
  return THUMB_WIDTHS.find((item) => item >= value) ?? THUMB_WIDTHS[THUMB_WIDTHS.length - 1];
}

// 与 lib/upload.resolveUploadPath 同形态的单层文件名白名单；不合规的一律不生成缩略地址
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;

/**
 * 库里存的 `/uploads/xxx.jpg` → 缩略图地址。
 * 非站内上传图（外链头像、data URI、已经带前缀的地址）原样返回，交给 withBasePath 处理。
 * 注意：返回值已带部署前缀，调用方不要再套一次 withBasePath。
 */
export function thumbSrc(src: string | null | undefined, width: number): string | undefined {
  if (!src) return undefined;
  const rel = BASE_PATH && src.startsWith(BASE_PATH) ? src.slice(BASE_PATH.length) : src;
  if (!rel.startsWith("/uploads/")) return withBasePath(src);
  const name = decodeURIComponent(rel.slice("/uploads/".length));
  if (!SAFE_NAME.test(name)) return withBasePath(src);
  return `${BASE_PATH}/api/v1/thumb/${encodeURIComponent(name)}?w=${clampThumbWidth(width)}`;
}
