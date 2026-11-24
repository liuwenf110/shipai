"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { stripBasePath } from "@/lib/base-path";

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

/** 与 FactionShareButton/PostShareButton 同口径的小程序 web-view 判定 */
function inMiniProgramWebView() {
  if (typeof window === "undefined") return false;
  if (window.__wxjs_environment === "miniprogram") return true;
  if (/miniProgram/i.test(window.navigator.userAgent)) return true;
  return window.location.search.includes("from=wxapp");
}

/** document.title 里带模板后缀「 · 上十派」时剥掉，分享卡片只留具体页名 */
function pageTitle() {
  const raw = typeof document !== "undefined" ? document.title : "";
  return raw.replace(/ · 上十派$/, "");
}

/**
 * 小程序 web-view 分享灯塔：只要用户在站内浏览（含未点分享按钮的右上角"···→ 发送给朋友"），
 * 就把「当前页 clean path + 页面 title」postMessage 给壳作为最近一次分享意图，
 * 保证壳侧 onShareAppMessage 生成的卡片永远落到当前页而不是首页。
 * 分享面板里的显式按钮仍会 postMessage 一条更丰富的记录（含封面图），后写覆盖前写即可。
 */
export function MpShareBeacon() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    if (!inMiniProgramWebView()) return;
    // 只在真正落到某个页面时上报，登录/注册等屏蔽页由 layout 之外的路径自己控制
    if (!pathname) return;
    // 剥部署前缀 + 保留 ref=share 等分享语义、丢弃一次性参数
    const params = new URLSearchParams(search?.toString() ?? "");
    const ref = params.get("ref");
    const from = params.get("from");
    const clean = new URLSearchParams();
    if (ref) clean.set("ref", ref);
    if (from) clean.set("from", from);
    const qs = clean.toString();
    const path = `${stripBasePath(pathname)}${qs ? `?${qs}` : ""}`;
    const payload = { type: "share", title: pageTitle() || "上十派", path, image: "" };

    const post = () => window.wx?.miniProgram?.postMessage({ data: payload });
    if (window.wx?.miniProgram) {
      post();
      return;
    }
    // jweixin 未注入时懒加载一份，加载完立刻上报（与 FactionShareButton 同源不重复添加）
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="jweixin-1.6.0"]',
    );
    if (existing) {
      existing.addEventListener("load", post);
      return () => existing.removeEventListener("load", post);
    }
    const script = document.createElement("script");
    script.src = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";
    script.onload = post;
    document.head.appendChild(script);
  }, [pathname, search]);

  return null;
}
