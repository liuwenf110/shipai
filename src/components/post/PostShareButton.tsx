"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { stripBasePath, withBasePath } from "@/lib/base-path";
import { shareCoverSrc } from "@/lib/thumb";
import { confirmMiniProgramEnv, inMiniProgramWebView, mpBridgeReady, mpNavigateToPage } from "@/lib/wx-jssdk";

/**
 * 分享卡片封面：站内上传图统一换成 5:4 居中裁切的缩略地址。
 * 微信对卡片图的比例约定是 5:4，直接把帖子首图原样交给壳，竖图会被压成两边留白、
 * 横长图会被裁掉主体；外链图（非 /uploads 开头）保持原地址不动。
 */
function shareImageAbs(image?: string) {
  if (!image) return "";
  if (image.startsWith("http")) return image;
  // shareCoverSrc 返回的是带部署前缀的站内地址，卡片要的是绝对 https，再补一次 origin
  return `${window.location.origin}${shareCoverSrc(image) ?? withBasePath(image)}`;
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
 * - 小程序 web-view 内：H5 无法主动调起微信原生分享，navigateTo 到壳的原生中转页 pages/share，
 *   由那一页的 open-type="share" 按钮一键拉起转发面板；真跳转失败时退回 postMessage + 右上角引导；
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
    toastTimer.current = window.setTimeout(() => setToast(""), 5000);
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
      imageAbs: shareImageAbs(image),
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

  /**
   * 原生中转页的跳转地址。手工 encodeURIComponent 而不用 URLSearchParams：
   * 后者会把空格编成 `+`，中转页 decodeURIComponent 后标题里就留下一个加号。
   */
  function mpShareTarget(mpPath: string, imageAbs: string) {
    const parts = [
      `title=${encodeURIComponent(title)}`,
      `path=${encodeURIComponent(mpPath)}`,
    ];
    if (imageAbs) parts.push(`image=${encodeURIComponent(imageAbs)}`);
    parts.push(`kind=${kind}`);
    return `/pages/share/index?${parts.join("&")}`;
  }

  async function onShare() {
    const { url, mpPath, imageAbs } = buildPayload();

    // 小程序 web-view：H5 自身调不起微信转发面板，最直达的做法是 navigateTo 到壳的原生中转页，
    // 那一页有一个 open-type="share" 大按钮，点一下就拉起原生分享面板。
    // bridge 已就绪时（MpShareBeacon 进站即预加载），必须让 navigateTo 落在点击的同步栈里，
    // 所以这里不能先 await 环境确认；只有 bridge 没就绪时，才分不清「预加载没赶上的真小程序」
    // 还是「带 from=wxapp 的微信内置浏览器假阳性」（那种环境没有 bridge，navigateTo 会静默无反应），
    // 此时才用官方 getEnv 坐实环境再尽力跳。
    if (inMiniProgramWebView()) {
      // mpBridgeReady() 为真时短路，不会 await，保证后续 navigateTo 仍在同步栈
      const isMp = mpBridgeReady() || (await confirmMiniProgramEnv());
      if (isMp) {
        const payload = { type: "share", title, path: mpPath, image: imageAbs };
        const nav = await mpNavigateToPage(mpShareTarget(mpPath, imageAbs));
        if (nav.ok) return;
        // 跳转没成（iOS web-view 常把 navigateTo 静默吞掉）：先 postMessage 把当前这条内容的分享意图交给灯塔，
        // 再引导用户走右上角——微信里唯一能 100% 拉起原生转发面板的入口，且内容已由灯塔备好在当前这条。
        // 这里不再回显 errMsg：那是开发取证用词，对真实用户只会像报错。
        window.wx?.miniProgram?.postMessage({ data: payload });
        showToast("已为你准备好这条内容的分享，点右上角「···」→「发送给朋友」即可发出");
        return;
      }
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
        // 把提示固定在屏幕底部居中，避免按钮靠右时 right-full 将 toast 顶到屏外看不见；
        // 失败原因回显较长，所以限宽允许换行而不是 nowrap
        <span className="pointer-events-none fixed left-1/2 top-[78vh] z-50 max-w-[84vw] -translate-x-1/2 whitespace-normal break-all rounded-2xl bg-ink/90 px-3.5 py-1.5 text-center text-[11.5px] font-semibold leading-relaxed text-white shadow-lg">
          {toast}
        </span>
      ) : null}
    </span>
  );
}
