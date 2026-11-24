"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { stripBasePath, withBasePath } from "@/lib/base-path";

declare global {
  interface Window {
    __wxjs_environment?: string;
    wx?: {
      miniProgram?: {
        postMessage(opts: { data: unknown }): void;
        navigateTo(opts: { url: string }): void;
      };
    };
  }
}

/** 小程序 web-view 判定：官方环境变量为主，UA 与 from=wxapp 参数兜底（与 FactionShareButton 同口径） */
function inMiniProgramWebView() {
  if (typeof window === "undefined") return false;
  if (window.__wxjs_environment === "miniprogram") return true;
  if (/miniProgram/i.test(window.navigator.userAgent)) return true;
  return window.location.search.includes("from=wxapp");
}

/** 分享链接的查询串：只保留环境标记 from=wxapp 与来源 ref=share，剥掉一次性参数 */
function shareQuery(search: string, keepFrom = true) {
  const current = new URLSearchParams(search);
  const out = new URLSearchParams();
  const from = keepFrom ? current.get("from") : null;
  if (from) out.set("from", from);
  out.set("ref", "share");
  return `?${out.toString()}`;
}

/**
 * 帖子详情页整页分享按钮：点击展开分享面板。
 * - 普通浏览器：给出帖子绝对链接，支持「复制文案+链接 / 仅复制链接 / 系统分享面板」；
 * - 小程序 web-view 内：把分享三要素（标题、path、封面）postMessage 给壳，引导用户点
 *   右上角「···→ 发送给朋友」，让对方点开卡片直接落到这条帖子详情页。
 * 分享的永远是整页 URL（含 ref=share），不再是片段。
 */
export function PostShareButton({
  title,
  path,
  image,
  summary,
}: {
  /** 分享卡片标题：一般为帖标 */
  title: string;
  /** 帖子站内干净路径（不含部署前缀），如 /posts/xxx */
  path: string;
  /** 可选封面图：站内相对路径或 https 绝对地址；组件内补成小程序可拉的绝对 https */
  image?: string;
  /** 可选一句话摘要：给浏览器面板下辅助文案用，小程序卡片仍只用 title */
  summary?: string;
}) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [shareTarget, setShareTarget] = useState<{
    title: string;
    path: string;
    image: string;
  } | null>(null);
  const [mp, setMp] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const { origin, pathname, search } = window.location;
    const target = withBasePath(path);
    setLink(`${origin}${target}${shareQuery(search)}`);
    setShareTarget({
      title,
      // 给壳的是不含部署前缀的干净路径，壳侧与 H5_BASE 拼接
      path: `${stripBasePath(target)}${shareQuery(search, false)}`,
      image: image ? (image.startsWith("http") ? image : `${origin}${image}`) : "",
    });
    setMp(inMiniProgramWebView());
  }, [open, path, image, title]);

  // 小程序内展开面板：注入 jweixin 并把分享信息 postMessage 给壳（右上角转发时壳会收到）
  useEffect(() => {
    if (!open || !mp || !shareTarget) return;
    const payload = { type: "share", ...shareTarget };
    const post = () => window.wx?.miniProgram?.postMessage({ data: payload });
    if (window.wx?.miniProgram) {
      post();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";
    script.onload = post;
    document.head.appendChild(script);
    // 不主动移除：其他组件（登录页/派页分享）也在复用同一份 jweixin
  }, [open, mp, shareTarget]);

  // 点击面板外区域收起
  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // http 或旧浏览器下 clipboard API 不可用，退回临时 textarea
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1800);
  }

  const canNativeShare =
    typeof window !== "undefined" && typeof window.navigator?.share === "function";

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        aria-label="分享这条帖子"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={
          open
            ? "flex items-center gap-1 text-[11.5px] font-semibold text-brand"
            : "flex items-center gap-1 text-[11.5px] font-semibold text-ink-mute transition hover:text-brand"
        }
      >
        <Icon name="share" size={14} />
        分享
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-[290px] rounded-2xl border border-ink-line bg-white p-3.5 text-left shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-black leading-snug text-ink">{title}</p>
            <button
              type="button"
              aria-label="关闭分享面板"
              onClick={() => setOpen(false)}
              className="shrink-0 text-ink-mute hover:text-ink"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
          {summary ? (
            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-mute">{summary}</p>
          ) : null}

          {mp ? (
            <div className="mt-2.5 rounded-xl border border-[#07C160]/30 bg-[#E8F8EE] px-3 py-2.5">
              <p className="text-[12px] font-bold text-[#07C160]">点右上角「···」→ 发送给朋友</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                已把这条帖子的整页链接准备好，对方点开卡片就能直达帖子详情，微信一键登录后可评论点赞。
              </p>
            </div>
          ) : (
            <>
              <p className="mt-2 break-all rounded-xl bg-cream px-2.5 py-2 text-[11px] leading-relaxed text-ink-soft">
                {link}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => copy("all", `${title}\n${link}`)}
                  className="btn-primary btn-sm"
                >
                  {copied === "all" ? "已复制 ✓" : "复制文案+链接"}
                </button>
                <button
                  type="button"
                  onClick={() => copy("link", link)}
                  className="btn-ghost btn-sm"
                >
                  {copied === "link" ? "已复制 ✓" : "仅复制链接"}
                </button>
                {canNativeShare ? (
                  <button
                    type="button"
                    onClick={() => {
                      window.navigator
                        .share({ title, text: summary || title, url: link })
                        .catch(() => {});
                    }}
                    className="btn-ghost btn-sm"
                  >
                    更多
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-[10.5px] leading-relaxed text-ink-mute">
                整页链接包含帖子详情与评论，对方打开后即在浏览器里落到本条帖子。
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
