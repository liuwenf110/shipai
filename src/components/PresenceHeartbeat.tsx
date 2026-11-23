"use client";

import { useEffect } from "react";
import { withBasePath } from "@/lib/base-path";

/** 与服务端 TOUCH_THROTTLE_MS 保持一致（presence.ts 是 server-only，客户端不能导入） */
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * 在线心跳：页面处于前台时每 30 秒上报一次，补上「开着页面但不发请求」的在线场景。
 * 页签切到后台即停止计时，回到前台立刻补一拍，配合服务端 90 秒窗口形成真实在线/离线。
 */
export function PresenceHeartbeat() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const beat = () => {
      void fetch(withBasePath("/api/v1/heartbeat"), {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => {
        // 网络抖动忽略，下一拍自然补上
      });
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };

    const start = () => {
      stop();
      beat();
      timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    if (document.visibilityState === "visible") start();

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
