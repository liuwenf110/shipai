import type { Metadata } from "next";
import { BASE_PATH } from "@/lib/base-path";

/**
 * 站外可访问根（含部署前缀），微信内置浏览器 / 公众号文章式分享卡片依赖绝对 URL。
 * 未设 env 时兜底生产域名，与 src/lib/sec.ts 同口径。
 */
const SITE_ORIGIN = process.env.WX_PUBLIC_ORIGIN ?? "https://www.xiaomaizhipin.com";
export const SITE_BASE = `${SITE_ORIGIN}${BASE_PATH}`;

export function absSiteUrl(cleanPath: string): string {
  const p = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
  return `${SITE_BASE}${p}`;
}

/**
 * 站内相对图路径 → https 绝对地址；已是绝对 https 直接返回；空值返回 undefined。
 * 用于 og:image / twitter:image，微信内置浏览器读它渲染分享缩略图。
 */
export function absImageUrl(rel?: string | null): string | undefined {
  if (!rel) return undefined;
  if (/^https?:\/\//i.test(rel)) return rel;
  const p = rel.startsWith("/") ? rel : `/${rel}`;
  return `${SITE_BASE}${p}`;
}

/**
 * 组装公众号文章风格的分享元数据：<title> + og:title/description/image/url + twitter.card + 备用 canonical。
 * 微信内置浏览器在「右上角 → 发送给朋友」时会读取 OG 标签生成富卡片；无 OG 时退化为纯链接文字。
 * 小程序 web-view 分享由 PostShareButton/ActivityShare 直接 postMessage 给壳，不吃这里，两套并行。
 */
export function buildShareMetadata({
  title,
  description,
  image,
  url,
}: {
  title: string;
  description: string;
  image?: string | null;
  url: string;
}): Metadata {
  const imageAbs = absImageUrl(image);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title,
      description,
      siteName: "上十派",
      images: imageAbs ? [{ url: imageAbs }] : undefined,
    },
    twitter: {
      card: imageAbs ? "summary_large_image" : "summary",
      title,
      description,
      images: imageAbs ? [imageAbs] : undefined,
    },
    other: {
      // 微信内置浏览器读取该字段作为「发送给朋友」卡片的缩略图 fallback
      "wechat-thumbnail": imageAbs ?? "",
    },
  };
}
