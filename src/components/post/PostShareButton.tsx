"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { withBasePath } from "@/lib/base-path";

declare global {
  interface Window {
    __wxjs_environment?: string;
  }
}

/** 小程序 web-view 判定：官方环境变量为主，UA 与 from=wxapp 参数兜底（与 FactionShareButton 同口径） */
function inMiniProgramWebView() {
  if (typeof window === "undefined") return false;
  if (window.__wxjs_environment === "miniprogram") return true;
  if (/miniProgram/i.test(window.navigator.userAgent)) return true;
  return window.location.search.includes("from=wxapp");
}

/**
 * 帖子详情页「转发」按钮：把帖子外链发给小程序外的用户，对方浏览器直接打开即可匿名观看。
 * - 普通浏览器：优先调起系统分享面板（navigator.share），不支持或用户取消时回退复制链接；
 * - 小程序 web-view 内：无法调起系统分享，直接复制链接并提示到浏览器打开。
 */
export function PostShareButton({
  title,
  path,
}: {
  title: string;
  /** 帖子站内干净路径（不含部署前缀），如 /posts/xxx */
  path: string;
}) {
  const [feedback, setFeedback] = useState("");

  function showFeedback(text: string) {
    setFeedback(text);
    window.setTimeout(() => setFeedback(""), 2400);
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // http 或旧浏览器下 clipboard API 不可用，退回临时 textarea
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    showFeedback("链接已复制");
  }

  async function onShare() {
    const url = `${window.location.origin}${withBasePath(path)}`;
    if (inMiniProgramWebView()) {
      await copyLink(url);
      showFeedback("链接已复制，请发到微信外浏览器打开");
      return;
    }
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // 用户主动取消就不再回退复制；其余失败（如微信内置浏览器受限）落到复制
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copyLink(url);
  }

  return (
    <span className="relative inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => void onShare()}
        className="flex items-center gap-1 text-[11.5px] font-semibold text-ink-mute transition hover:text-brand"
      >
        <Icon name="share" size={14} />
        转发
      </button>
      {feedback ? (
        <span className="absolute right-full top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-[10.5px] font-semibold text-white">
          {feedback}
        </span>
      ) : null}
    </span>
  );
}
