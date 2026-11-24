import sanitizeHtml from "sanitize-html";
import { BASE_PATH } from "@/lib/base-path";

/**
 * 帖子正文富文本工具：编辑器产出 HTML → 服务端白名单净化后入库；
 * 老帖与纯文本帖不含标签，各渲染点按 looksRichText 分流保持原样展示。
 */

// 只匹配真实标签起始形态；用户手敲的 &lt;p&gt; 实体不会命中，老纯文本帖不会被误判
const RICH_TAG_RE =
  /<\/?\s*(?:p|div|br|b|strong|i|em|u|s|strike|del|a|img|ul|ol|li|blockquote|h[1-6]|code|pre|hr|span|sub|sup)\b/i;

export function looksRichText(text: string): boolean {
  return RICH_TAG_RE.test(text);
}

/** 站内上传图地址归一：剥部署前缀后必须落在 /uploads/，否则视为外链丢弃 */
function normalizeUploadSrc(src: string): string | null {
  let value = src.trim();
  if (BASE_PATH && value.startsWith(BASE_PATH + "/")) value = value.slice(BASE_PATH.length);
  if (value.startsWith("/uploads/")) return value;
  // 编辑器在本机 origin 下粘贴时可能带绝对地址，仅接受同站的 /uploads 路径
  try {
    const url = new URL(src);
    const path = BASE_PATH && url.pathname.startsWith(BASE_PATH + "/") ? url.pathname.slice(BASE_PATH.length) : url.pathname;
    if (path.startsWith("/uploads/")) return path;
  } catch {
    /* 相对以外的畸形地址丢弃 */
  }
  return null;
}

/**
 * 行内 style 白名单过滤：只保留少量无副作用的字体/颜色/对齐属性，
 * 丢弃 url()/expression()/javascript: 与 CSS 变量，避免 xss 与信息泄露。
 */
function filterInlineStyle(value: string): string {
  const allowed = new Set([
    "color", "background-color", "font-size", "font-weight", "font-style",
    "font-family", "text-align", "text-decoration", "line-height", "letter-spacing",
  ]);
  const kept: string[] = [];
  for (const rawProp of value.split(";")) {
    const prop = rawProp.trim();
    if (!prop || prop.includes(":") === false) continue;
    const [k, ...rest] = prop.split(":");
    const key = k.trim().toLowerCase();
    const val = rest.join(":").trim();
    if (!allowed.has(key) || !val) continue;
    if (/url\s*\(|expression\s*\(|javascript:|@import|var\s*\(/i.test(val)) continue;
    kept.push(`${key}: ${val}`);
  }
  return kept.join("; ");
}

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "div", "br", "b", "strong", "i", "em", "u", "s", "strike", "del",
    "a", "img", "ul", "ol", "li", "blockquote",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "code", "pre", "hr", "span", "sub", "sup",
  ],
  allowedAttributes: {
    // target/rel 由下方 transformTags 强制注入，需列入白名单否则会被过滤掉
    a: ["href", "target", "rel"],
    img: ["src", "alt"],
    // 保留少量行内样式：颜色/背景色/字号/对齐，其他丢弃
    "*": ["style"],
  },
  allowedSchemes: ["http", "https"],
  transformTags: {
    // 外站链接统一新窗口打开并切断 opener；站内 /uploads 图片保留，其余图片来源整标签丢弃
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" },
    }),
    img: (tagName, attribs): sanitizeHtml.Tag => {
      const src = normalizeUploadSrc(attribs.src ?? "");
      return src ? { tagName, attribs: { src, alt: attribs.alt ?? "图片" } } : { tagName: "span", attribs: {} };
    },
    // 行内 style 只允许白名单属性，丢弃 url()/expression()/javascript: 与自定义属性
    "*": (tagName, attribs) => {
      if (!attribs.style) return { tagName, attribs };
      const safe = filterInlineStyle(attribs.style);
      const next = { ...attribs };
      if (safe) next.style = safe;
      else delete next.style;
      return { tagName, attribs: next };
    },
  },
};

/** 入库前净化：白名单标签 + 站内图 + http(s) 链接，javascript:/onerror 等全部剥除 */
export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS).trim();
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** 剥标签取纯文本：供摘要、字数校验与内容安全送检使用；非富文本原样返回 */
export function richTextToPlainText(source: string): string {
  if (!looksRichText(source)) return source;
  const withBreaks = source
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:p|div|blockquote|li|h[1-6]|pre)[^>]*>/gi, "\n")
    .replace(/<img[^>]*>/gi, "[图片]")
    .replace(/<[^>]+>/g, "");
  return decodeBasicEntities(withBreaks).replace(/\n{3,}/g, "\n\n").trim();
}

/** 提取正文内已上传的图片相对路径（/uploads/xxx），供媒体送检 */
export function extractRichImagePaths(html: string): string[] {
  const paths = new Set<string>();
  for (const match of html.matchAll(/<img[^>]+src="([^"]+)"/gi)) {
    const path = normalizeUploadSrc(match[1]);
    if (path) paths.add(path);
  }
  return [...paths];
}

/** 详情页渲染用：再净化一遍（防老帖手敲标签的漏网）+ 把站内图补上部署前缀 */
export function prepareRichTextForRender(html: string): string {
  return sanitizeRichText(html).replaceAll('src="/uploads/', `src="${BASE_PATH}/uploads/`);
}

/** HTML 安全转义纯文本段 */
function escapePlainTextSegment(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 将纯文本中的 URL 自动包成 <a>（先转义后插入）：包括 http(s)://…，www. 开头，

 * 与 mp.weixin.qq.com 开头的无协议微信文章链接。服务端净化会保留 <a> 并强制 target=_blank。
 */
export function linkifyPlainText(text: string): string {
  const escaped = escapePlainTextSegment(text);
  const urlRe = /(?:https?:\/\/|www\.|mp\.weixin\.qq\.com)[^\s<>"]+/gi;
  return escaped.replace(urlRe, (raw) => {
    const trimmed = raw.replace(/[，。；、：！？)\]》〉]+$/u, "");
    if (!trimmed) return raw;
    const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const tail = raw.slice(trimmed.length);
    return `<a href="${href}">${trimmed}</a>${tail}`;
  });
}
