"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

/**
 * 帖子外链卡片（公众号文章 / 外站文章）。
 * H5 浏览器：整卡可点，新窗口打开原文；
 * 小程序 web-view：微信会拦截业务域名之外的跳转（mp 文章也仅支持公众号关联主体），
 * 统一改为复制链接并提示「请在浏览器打开」，与分享复制的既有体验一致。
 */
export function LinkCard({
  url,
  title,
  image,
  description,
  className,
}: {
  url: string;
  title?: string | null;
  image?: string | null;
  description?: string | null;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  let hostname = url;
  let isWechat = false;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname.replace(/^www\./, "");
    isWechat = parsed.hostname === "mp.weixin.qq.com";
  } catch {
    // 展示用，非法 URL 保留原文
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // http 或旧内核下 clipboard API 不可用，退回临时 textarea（与分享按钮同款回退）
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    const wxWindow = window as Window & { __wxjs_environment?: string };
    if (wxWindow.__wxjs_environment === "miniprogram" || /miniprogram/i.test(navigator.userAgent)) {
      event.preventDefault();
      void copyLink();
    }
  }

  return (
    <>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className={cn(
          "flex items-stretch gap-2.5 rounded-xl border border-ink-line/70 bg-cream-sunk/50 p-2.5 transition hover:border-brand/40 hover:bg-cream-sunk",
          className,
        )}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-[58px] w-[58px] shrink-0 rounded-lg bg-cream-sunk object-cover"
          />
        ) : (
          <span className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-lg bg-cream-sunk text-ink-mute">
            <Icon name="link" size={20} />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <span className="line-clamp-2 text-[13px] font-bold leading-snug text-ink">
            {title || url}
          </span>
          {description && description !== title ? (
            <span className="line-clamp-1 text-[11px] text-ink-mute">{description}</span>
          ) : null}
          <span className="flex items-center gap-1 text-[10.5px] text-ink-mute/90">
            {isWechat ? <span className="rounded bg-[#07C160]/10 px-1 font-bold text-[#07A953]">公众号</span> : null}
            {hostname}
          </span>
        </span>
      </a>
      {copied ? (
        <p className="mt-1.5 text-[11px] font-semibold text-brand-dark">
          链接已复制，请在手机浏览器中打开查看
        </p>
      ) : null}
    </>
  );
}
