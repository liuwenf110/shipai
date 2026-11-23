import "server-only";

/**
 * 帖子外链预览：归一化用户粘贴的链接（公众号文章 / 任意外站），
 * 服务端抓取 og:title / og:image / og:description 生成卡片快照。
 * 抓取失败不阻断发布：标题退化为域名，封面与摘要留空。
 */

export type LinkSnapshot = {
  linkUrl: string;
  linkTitle: string;
  linkImage: string | null;
  linkDesc: string | null;
};

const MAX_URL_LENGTH = 600;
const FETCH_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 512 * 1024;

/** 拒绝本机与内网地址，防服务端被抓取当 SSRF 跳板 */
function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "") return true;
  if (/^(127|10|0)\./.test(host)) return true;
  if (host.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
  return false;
}

/** 补协议、校验合法性；非法返回 null。公众号分享常为裸链接或 mp.weixin.qq.com 开头 */
export function normalizeLinkUrl(raw: string): string | null {
  let value = raw.trim();
  if (!value || value.length > MAX_URL_LENGTH) return null;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) value = `https://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname.includes(".") || isPrivateHost(url.hostname)) return null;
  return url.toString();
}

export function isWechatArticle(url: string) {
  try {
    return new URL(url).hostname === "mp.weixin.qq.com";
  } catch {
    return false;
  }
}

/** 按优先级从 HTML 提取 meta 内容：property="og:x" 或 name="x" */
function pickMeta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i"),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      const value = match?.[1]?.trim();
      if (value) return decodeEntities(value);
    }
  }
  return null;
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function absoluteUrl(base: string, href: string | null): string | null {
  if (!href) return null;
  try {
    const resolved = new URL(href, base).toString();
    return resolved.startsWith("http") ? resolved : null;
  } catch {
    return null;
  }
}

/** 抓取原文页面元信息。任何网络/解析失败都以空字段降级 */
async function scrape(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        // 用常见浏览器 UA，避免被目标站反爬直接拒绝
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "zh-CN,zh;q=0.9",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("html")) return {};
    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    const titleFromTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
    return {
      title: pickMeta(html, ["og:title", "twitter:title"]) || titleFromTag || null,
      image: absoluteUrl(url, pickMeta(html, ["og:image", "twitter:image"])),
      description: pickMeta(html, ["og:description", "twitter:description", "description"]),
    };
  } catch {
    return {};
  }
}

/** 生成入库快照：调用方先用 normalizeLinkUrl 校验；抓取失败时 title 退化为域名 */
export async function buildLinkSnapshot(rawUrl: string): Promise<LinkSnapshot> {
  const url = normalizeLinkUrl(rawUrl) ?? rawUrl;
  const hostname = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url.slice(0, 60);
    }
  })();
  const meta = await scrape(url);
  return {
    linkUrl: url,
    linkTitle: (meta.title ?? "").slice(0, 160) || hostname,
    linkImage: meta.image ?? null,
    linkDesc: (meta.description ?? "").slice(0, 240) || null,
  };
}
