/**
 * 小程序 web-view 内共享的 jweixin 加载器：
 * 全站只注入一份 jweixin-1.6.0，加载完成后 window.wx.miniProgram 才可用。
 * 灯塔在 layout 挂载时就预加载，避免用户点「分享」时才懒加载导致 navigateTo 竞态卡住。
 */

declare global {
  interface Window {
    __wxjs_environment?: string;
    __jweixinLoading?: Promise<boolean>;
    wx?: {
      miniProgram?: {
        postMessage(opts: { data: unknown }): void;
        navigateTo(opts: { url: string; fail?: (err: unknown) => void }): void;
      };
    };
  }
}

const JWEIXIN_SRC = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";

/** 与 FactionShareButton/PostShareButton/MpShareBeacon 同口径的小程序 web-view 判定 */
export function inMiniProgramWebView() {
  if (typeof window === "undefined") return false;
  if (window.__wxjs_environment === "miniprogram") return true;
  if (/miniProgram/i.test(window.navigator.userAgent)) return true;
  return window.location.search.includes("from=wxapp");
}

/** wx.miniProgram 是否已就绪 */
export function mpBridgeReady() {
  return Boolean(typeof window !== "undefined" && window.wx?.miniProgram);
}

/**
 * 确保 jweixin 已加载，resolve 表示 wx.miniProgram 是否可用。
 * 幂等：已加载直接返回；正在加载复用同一个 Promise；否则注入脚本并等待 onload/onerror。
 */
export function ensureJweixin(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (mpBridgeReady()) return Promise.resolve(true);
  if (window.__jweixinLoading) return window.__jweixinLoading;

  window.__jweixinLoading = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src*="jweixin-1.6.0"]');
    if (existing) {
      // 已有标签但还没触发 load（可能刚注入），监听一次
      existing.addEventListener("load", () => resolve(mpBridgeReady()));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.src = JWEIXIN_SRC;
    script.async = true;
    script.onload = () => resolve(mpBridgeReady());
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
    // 兜底：个别环境 onload/onerror 不触发，2.5s 后按当前状态判定
    window.setTimeout(() => resolve(mpBridgeReady()), 2500);
  });
  return window.__jweixinLoading;
}
