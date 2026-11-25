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
        navigateTo(opts: { url: string; fail?: (err: unknown) => void }): void;
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
 * 帖子详情页「整页分享」按钮：一次点击即触发系统 / 微信原生的分享面板，
 * 不再弹内嵌的复制文本面板。
 * - 支持 navigator.share 的浏览器（微信内置 Safari/Chrome/iOS）：直接调起系统分享，
 *   分享内容为整页 URL + 帖标 + 摘要 + 首图，用户可继续选微信/微博/复制链接等；
 * - 小程序 web-view 内：H5 无法主动调起微信原生分享，把整页分享三要素 postMessage 给壳，
 *   并弹出「点右上角·发送给朋友」轻提示；
 * - 老浏览器兜底：直接复制整页链接到剪贴板并给出提示。
 */
export function PostShareButton({
  title,
  path,
  image,
  summary,
  label = "整页分享",
  kind = "post",
}: {
  /** 分享卡片标题：一般为帖标 */
  title: string;
  /** 站内干净路径（不含部署前缀），如 /posts/xxx、/factions/xx/activities/yy */
  path: string;
  /** 可选封面图：站内相对路径或 https 绝对地址；组件内补成小程序可拉的绝对 https */
  image?: string;
  /** 可选一句话摘要：给系统 share sheet 的 text 字段用 */
  summary?: string;
  /** 按钮 aria-label：默认“整页分享”，分享活动/其他页时可自定义 */
  label?: string;
  /** 小程序中转页卡片预览时的标签页标题，只影响展示文案 */
  kind?: "post" | "activity" | "faction";
}) {
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | null>(null);

  function showToast(text: string) {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  }

  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  function buildPayload() {
    const { origin, pathname, search } = window.location;
    const target = withBasePath(path);
    return {
      url: `${origin}${target}${shareQuery(search)}`,
      // 给壳的 path 需剥部署前缀，壳会与 H5_BASE 拼接
      mpPath: `${stripBasePath(target)}${shareQuery(search, false)}`,
      imageAbs: image ? (image.startsWith("http") ? image : `${origin}${image}`) : "",
      // 少数浏览器从当前 pathname 分享时才用它，正常走 path prop
      fromCurrent: pathname,
    };
  }

  async function copyFallback(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      showToast("整页链接已复制");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast("整页链接已复制");
    }
  }

  async function onShare() {
    const { url, mpPath, imageAbs } = buildPayload();
    // 先给一个可见反馈，避免 jweixin 懒加载失败时用户以为卡了
    showToast("准备分享…");

    // 小程序 web-view：无法直接调起微信原生分享面板，H5 能做的最直达动作就是 navigateTo 原生中转页，
    // 中转页里一个 open-type="share" 大按钮一下就拉到微信原生分享面板（卡片标题/落地/封面三要素直接传参）
    if (inMiniProgramWebView()) {
      const q = new URLSearchParams();
      q.set("title", title);
      q.set("path", mpPath);
      if (imageAbs) q.set("image", imageAbs);
      q.set("kind", kind);
      const target = `/pages/share/index?${q.toString()}`;
      const payload = { type: "share", title, path: mpPath, image: imageAbs };
      const goto = () => {
        if (window.wx?.miniProgram?.navigateTo) {
          window.wx.miniProgram.navigateTo({
            url: target,
            fail: () => {
              // 老壳没有 pages/share 时降级：直接 navigate 到 webview 页 + 灯塔已追平 path
              window.wx?.miniProgram?.postMessage({ data: payload });
              showToast("点右上角「···」→ 发送给朋友");
            },
          });
          return true;
        }
        return false;
      };
      if (goto()) return;
      // jweixin 未注入时先懒加载，加载成功立刻跳；失败则降级 postMessage + toast，不留给用户无反馈
      const script = document.createElement("script");
      script.src = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";
      script.onload = () => {
        if (!goto()) {
          window.wx?.miniProgram?.postMessage({ data: payload });
          showToast("已准备分享，点右上角「···」→ 发送给朋友");
        }
      };
      script.onerror = () => showToast("分享组件加载失败，请重启小程序重试");
      document.head.appendChild(script);
      return;
    }

    // 微信内置浏览器（非小程序）：navigator.share 不会拉到微信自己的面板，
    // 只能引导用户走右上角菜单；同时 OG 卡片已写入 HTML head 保证富卡片。
    if (/MicroMessenger/i.test(window.navigator.userAgent)) {
      showToast("点右上角「···」→ 发送给朋友");
      return;
    }

    // 普通浏览器：直接调起系统 share sheet 完成整页分享
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title,
          text: summary || title,
          url,
        });
        return;
      } catch (error) {
        // 用户主动取消不再回退；其他异常（如微信内置浏览器受限）落到复制
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copyFallback(url);
  }

  return (
    <span className="relative inline-flex items-center gap-1.5">
      <button
        type="button"
        aria-label={label}
        onClick={(event) => {
          // 避免在 form 里默默变成 submit，导致页面刷新且 onShare 不上跑
          event.preventDefault();
          event.stopPropagation();
          void onShare();
        }}
        className="flex items-center gap-1 text-[11.5px] font-semibold text-ink-mute transition hover:text-brand active:scale-[0.96]"
      >
        <Icon name="share" size={14} />
        分享
      </button>
      {toast ? (
        // 把提示固定在屏幕底部居中，避免按钮靠右时 right-full 将 toast 顶到屏外看不见
        <span className="pointer-events-none fixed left-1/2 top-[78vh] z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink/90 px-3.5 py-1.5 text-[11.5px] font-semibold text-white shadow-lg">
          {toast}
        </span>
      ) : null}
    </span>
  );
}
