"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { stripBasePath } from "@/lib/base-path";
import { ensureJweixin, inMiniProgramWebView, mpBridgeReady } from "@/lib/wx-jssdk";

/** document.title 里带模板后缀「 · 上十派」时剥掉，分享卡片只留具体页名 */
function pageTitle() {
  const raw = typeof document !== "undefined" ? document.title : "";
  return raw.replace(/ · 上十派$/, "");
}

/**
 * 小程序 web-view 分享灯塔：
 * 1) 挂载即预加载 jweixin，保证用户点「分享」时 wx.miniProgram 已就绪，navigateTo 不再竞态卡住；
 * 2) 每次路由变化把「当前页 clean path + 页面 title」postMessage 给壳作为最近一次分享意图，
 *    保证用户不点分享按钮、直接点右上角"···→ 发送给朋友"时卡片也落到当前页而不是首页。
 */
export function MpShareBeacon() {
  const pathname = usePathname();
  const search = useSearchParams();

  // 预加载 jweixin：进入小程序站内即触发，与是否点分享无关
  useEffect(() => {
    if (!inMiniProgramWebView()) return;
    void ensureJweixin();
  }, []);

  useEffect(() => {
    if (!inMiniProgramWebView()) return;
    if (!pathname) return;
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
    if (mpBridgeReady()) {
      post();
      return;
    }
    // bridge 还没就绪时等 jweixin 加载完再上报
    let cancelled = false;
    void ensureJweixin().then((ready) => {
      if (!cancelled && ready) post();
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, search]);

  return null;
}
