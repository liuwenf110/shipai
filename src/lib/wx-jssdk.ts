/**
 * 小程序 web-view 内共享的 jweixin 加载器与跳转工具。
 *
 * 两条硬约束（真机踩过的坑）：
 * 1) jweixin 必须在用户可能点「分享」之前就加载好，不能点击时才注入（脚本命中缓存时 onload 不再触发）；
 * 2) `wx.miniProgram.navigateTo` 在部分机型上会被 jweixin 静默吞掉，且 success/fail 都不回调，
 *    所以跳转必须「双通道 + 可见性自校验」，不能把 navigateTo 调用出去就当成功。
 */

declare global {
  interface Window {
    __wxjs_environment?: string;
    __jweixinLoading?: Promise<boolean>;
    WeixinJSBridge?: {
      invoke(name: string, params: Record<string, unknown>, cb?: (res: unknown) => void): void;
    };
    wx?: {
      miniProgram?: {
        postMessage(opts: { data: unknown }): void;
        getEnv(cb: (res: { miniprogram?: boolean }) => void): void;
        navigateTo(opts: {
          url: string;
          success?: () => void;
          fail?: (err: unknown) => void;
        }): void;
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

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** 页面是否还在前台：真跳走时 web-view 所在页会被隐藏，这是唯一可信的「跳转成功了」信号 */
function stillVisible() {
  return typeof document === "undefined" || document.visibilityState === "visible";
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

/**
 * 用官方通道确认「确实跑在小程序 web-view 里」。
 * `inMiniProgramWebView` 里的 from=wxapp 只是壳拼的参数，转发出去的链接被同事在微信
 * 内置浏览器里打开时同样带着它，此时没有 miniProgram bridge，navigateTo 会静默无反应，
 * 必须在这里退回普通浏览器分享链路。
 */
export async function confirmMiniProgramEnv(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (window.__wxjs_environment === "miniprogram") return true;
  const uaInMp = /miniProgram/i.test(window.navigator.userAgent);
  const ready = await ensureJweixin();
  if (!ready || !window.wx?.miniProgram?.getEnv) return uaInMp;
  return new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (value: boolean) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    // getEnv 回调在个别机型不触发，800ms 后退回 UA 判定
    window.setTimeout(() => finish(uaInMp), 800);
    try {
      window.wx?.miniProgram?.getEnv((res) => finish(Boolean(res?.miniprogram)));
    } catch {
      finish(uaInMp);
    }
  });
}

/** navigateTo 的 fail 参数形态不一（string / {errMsg}），统一抽成短文本供提示与排查 */
function errText(error: unknown) {
  if (typeof error === "string") return error;
  const msg = (error as { errMsg?: string } | null)?.errMsg;
  return msg || "未知错误";
}

export type MpNavResult = { ok: boolean; errMsg: string; via: "jweixin" | "bridge" | "none" };

/**
 * 跳转小程序原生页：jweixin 通道 + 原生 JSBridge 通道依次尝试，每条都用「页面是否还在前台」
 * 自校验，避免老版 jweixin 把调用静默吞掉时上层误判为已跳转。
 */
export async function mpNavigateToPage(url: string): Promise<MpNavResult> {
  const result: MpNavResult = { ok: false, errMsg: "", via: "none" };
  if (typeof window === "undefined") return result;
  const ready = await ensureJweixin();

  if (ready && window.wx?.miniProgram?.navigateTo) {
    const errMsg = await new Promise<string>((resolve) => {
      let settled = false;
      const finish = (msg: string) => {
        if (settled) return;
        settled = true;
        resolve(msg);
      };
      window.wx!.miniProgram!.navigateTo({
        url,
        success: () => finish(""),
        fail: (error) => finish(errText(error)),
      });
      // 两个回调都可能不触发：800ms 后按可见性自行定论（还看得见 = 没跳走）
      window.setTimeout(() => finish(stillVisible() ? "navigateTo 无响应" : ""), 800);
    });
    if (!errMsg) return { ok: true, errMsg: "", via: "jweixin" };
    result.errMsg = errMsg;
  }

  // 兜底通道：绕过 jweixin 直接喊微信原生 JSBridge（jweixin 内部走的也是这条）
  if (window.WeixinJSBridge?.invoke) {
    window.WeixinJSBridge.invoke(
      "invokeMiniProgramAPI",
      { name: "navigateTo", arg: JSON.stringify({ url }) },
      () => {},
    );
    await delay(800);
    if (!stillVisible()) return { ok: true, errMsg: result.errMsg, via: "bridge" };
  }

  return result;
}
