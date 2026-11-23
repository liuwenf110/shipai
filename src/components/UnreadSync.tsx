"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * 未读角标实时同步（挂在 (app)/layout）：
 * TopBar/BottomNav 的未读数由 layout 服务端渲染，SPA 内跳转时 layout 不重新取数，
 * 读完私信/通知后角标会滞后。路由变化即 refresh 一次，让角标始终跟库内已读态一致；
 * 页面重新回到前台（小程序壳切后台再回来、切浏览器标签）也补一次。
 */
export function UnreadSync() {
  const router = useRouter();
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    // 首屏挂载时服务端刚算过角标，无需多发一次请求
    if (first.current) {
      first.current = false;
      return;
    }
    router.refresh();
  }, [pathname, router]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  return null;
}

/**
 * 「进入即已读」页面（私信线程页、通知详情页）专用：
 * 已读是服务端渲染时的写库副作用，渲染完成后 layout 角标仍是进入前的旧值；
 * 挂载后 refresh 一次把角标追平。router.refresh 不会重新挂载客户端组件，
 * 空依赖只触发一次，不会与刷新后的重渲染形成循环。
 */
export function MarkReadSync() {
  const router = useRouter();

  useEffect(() => {
    router.refresh();
  }, [router]);

  return null;
}
