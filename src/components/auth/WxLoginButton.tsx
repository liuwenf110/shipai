"use client";

import { useEffect, useState } from "react";

/**
 * 小程序 web-view 内的「微信登录」按钮：
 * 通过 jweixin 的 wx.miniProgram.navigateTo 跳到壳里的授权中转页拿 code。
 * 仅在小程序环境（from=wxapp 进入）由登录页条件渲染。
 */
export function WxLoginButton({ text = "微信登录" }: { text?: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // web-view 页默认不带 jweixin，按需注入；wx.miniProgram API 无需签名配置
    if (typeof window === "undefined") return;
    if ((window as { wx?: { miniProgram?: unknown } }).wx?.miniProgram) {
      setReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";
    script.onload = () => setReady(true);
    document.head.appendChild(script);
    return () => script.remove();
  }, []);

  function goWxAuth() {
    const wx = (window as { wx?: { miniProgram?: { navigateTo(opts: { url: string }): void } } }).wx;
    if (wx?.miniProgram) {
      wx.miniProgram.navigateTo({ url: "/pages/auth/index" });
    }
  }

  return (
    <button
      type="button"
      onClick={goWxAuth}
      disabled={!ready}
      className="btn w-full bg-[#07C160] text-white disabled:opacity-60"
    >
      {!ready ? "加载中…" : text}
    </button>
  );
}
