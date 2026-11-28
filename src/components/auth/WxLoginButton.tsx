"use client";

import { useEffect, useState } from "react";
import { ensureJweixin, mpBridgeReady } from "@/lib/wx-jssdk";

/**
 * 小程序 web-view 内的「微信登录」按钮：
 * 通过 jweixin 的 wx.miniProgram.navigateTo 跳到壳里的授权中转页拿 code。
 * 仅在小程序环境（from=wxapp 进入）由登录页条件渲染。
 */
export function WxLoginButton({ text = "微信登录" }: { text?: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // jweixin 统一走 wx-jssdk 共享加载器（幂等、预加载就绪则同步用），避免多处硬编码不同版本。
    if (typeof window === "undefined") return;
    if (mpBridgeReady()) {
      setReady(true);
      return;
    }
    let cancelled = false;
    void ensureJweixin().then((ok) => {
      if (!cancelled && ok) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function goWxAuth() {
    if (window.wx?.miniProgram) {
      window.wx.miniProgram.navigateTo({ url: "/pages/auth/index" });
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
