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

const JWEIXIN_SRC = "https://res.wx.qq.com/open/js/jweixin-1.6.7.js";

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
    const existing = document.querySelector<HTMLScriptElement>('script[src*="jweixin-"]');
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

/** navigateTo 的 fail / bridge 回调形态不一（string / {errMsg} / {err_msg}），统一抽成短文本供提示与排查；无法识别时回传原始 JSON 以免被“未知错误”吞掉真信息 */
function errText(error: unknown) {
  if (typeof error === "string") return error;
  const e = error as { errMsg?: string; err_msg?: string } | null;
  if (e?.errMsg) return e.errMsg;
  if (e?.err_msg) return e.err_msg;
  try {
    return error ? JSON.stringify(error) : "未知错误";
  } catch {
    return "未知错误";
  }
}

export type MpNavResult = { ok: boolean; errMsg: string; via: "jweixin" | "bridge" | "none" };

/**
 * 跳转小程序原生页。
 * 关键约束（真机踩过的坑）：bridge 已就绪时，navigateTo 必须在调用方「用户点击」的同步栈里
 * 立刻发出，不能先 await 任何东西（哪怕已 resolve 的 Promise）——跨微任务会丢用户手势上下文，
 * 部分机型 navigateTo 会被 jweixin 静默吞掉、success/fail 都不回调。
 * 因此这里先同步发跳转，再用「success 回调 / 页面是否被隐藏」异步校验是否真跳走，
 * 没跳通则再走原生 JSBridge 兜底。
 */
export function mpNavigateToPage(url: string): Promise<MpNavResult> {
  if (typeof window === "undefined") {
    return Promise.resolve({ ok: false, errMsg: "", via: "none" });
  }

  // bridge 已就绪：同步发出 navigateTo，随后异步校验（保住用户手势）
  if (mpBridgeReady() && window.wx?.miniProgram?.navigateTo) {
    return navigateThenVerify(url);
  }

  // bridge 还没就绪（预加载没赶上）：只能先加载再跳，此时用户手势已不可保，尽力而为
  return ensureJweixin().then((ready) => {
    if (ready && window.wx?.miniProgram?.navigateTo) return navigateThenVerify(url);
    // jweixin 没能挂上 window.wx（真机实测）：直接走原生 WeixinJSBridge，并等其就绪再 invoke
    return bridgeInvokeNav(url, { ok: false, errMsg: "", via: "none" });
  });
}

/** 同步发出 jweixin navigateTo，再用 success 回调 + 可见性双重校验是否真跳走 */
function navigateThenVerify(url: string): Promise<MpNavResult> {
  let successFired = false;
  let failMsg = "";
  // 真正的一跳：此刻仍在用户点击的同步调用栈内，不能在其前面插入任何 await
  window.wx!.miniProgram!.navigateTo({
    url,
    success: () => {
      successFired = true;
    },
    fail: (error) => {
      failMsg = errText(error);
    },
  });

  // 异步校验：success 回调触发或页面被隐藏都算跳成；都没发生则视为被吞，转 JSBridge 兜底
  return new Promise<MpNavResult>((resolve) => {
    window.setTimeout(() => {
      if (successFired || !stillVisible()) {
        resolve({ ok: true, errMsg: "", via: "jweixin" });
        return;
      }
      if (failMsg) {
        resolve({ ok: false, errMsg: failMsg, via: "jweixin" });
        return;
      }
      resolve(bridgeInvokeNav(url, { ok: false, errMsg: "navigateTo 无响应", via: "jweixin" }));
    }, 800);
  });
}

/**
 * 兜底通道：绕过 jweixin 直接喊微信原生 WeixinJSBridge。
 * 真机实测（snap）：web-view 里 window.wx 可能始终 undefined（jweixin 没挂上），
 * 但 window.WeixinJSBridge 对象是存在的，只是刚进页时 .invoke 尚未就绪——
 * 必须等 `WeixinJSBridgeReady` 事件（或轮询 .invoke 出现）再 invoke，否则直接返回会误判“不可用”。
 * invoke 的回调形态不一，统一把 errMsg 回传，并以“页面是否被隐藏”为唯一可信的跳成信号。
 */
function bridgeInvokeNav(url: string, result: MpNavResult): Promise<MpNavResult> {
  return new Promise<MpNavResult>((resolve) => {
    let cbErr = "";
    let settled = false;
    const verify = () => {
      // 真跳走时 web-view 页会被隐藏；仍可见则用回调 errMsg 定性失败原因
      delay(1000).then(() => {
        if (settled) return;
        settled = true;
        resolve(!stillVisible() ? { ok: true, errMsg: "", via: "bridge" } : { ok: false, errMsg: cbErr || "invoke后页面仍可见", via: "bridge" });
      });
    };
    const doInvoke = () => {
      if (settled) return;
      if (!window.WeixinJSBridge?.invoke) {
        settled = true;
        resolve({ ...result, errMsg: cbErr || "WeixinJSBridge.invoke未就绪" });
        return;
      }
      try {
        window.WeixinJSBridge.invoke(
          "invokeMiniProgramAPI",
          { name: "navigateTo", arg: JSON.stringify({ url }) },
          (res: unknown) => {
            cbErr = errText(res);
          },
        );
      } catch (error) {
        cbErr = "invoke异常:" + errText(error);
      }
      verify();
    };
    if (window.WeixinJSBridge?.invoke) {
      doInvoke();
      return;
    }
    // 就绪前：监听 WeixinJSBridgeReady；并轮询 .invoke 出现兼底（事件在部分内核不重复触发），最多等 4s
    document.addEventListener("WeixinJSBridgeReady", doInvoke, false);
    const started = Date.now();
    const poll = window.setInterval(() => {
      if (settled) {
        window.clearInterval(poll);
        return;
      }
      if (window.WeixinJSBridge?.invoke) {
        window.clearInterval(poll);
        doInvoke();
      } else if (Date.now() - started > 4000) {
        window.clearInterval(poll);
        if (!settled) {
          settled = true;
          resolve({ ...result, errMsg: "等WeixinJSBridge就绪超时" });
        }
      }
    }, 150);
  });
}
