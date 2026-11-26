"use client";

import { useEffect, useState } from "react";

/**
 * 全局错误边界：主要接住 Server Action ID 失效（发布后旧页面/旧 tab 仍带上一版 ID）。
 * 这类错误服务端只回 404 且不写任何日志，用户侧看到的就是「提交报错」，极易被误判成功能坏了，
 * 所以这里对 stale action 直接自动整页刷新一次，把「坏了」变成「闪一下恢复」。
 */

const STALE_KEY = "shipai-stale-action-reload-at";

/**
 * 是否允许本次自动刷新：60s 内已经为 stale action 刷过就不再刷。
 * 微信 web-view 会把 HTML 缓得很死，刷新后可能又拿到同一份旧 ID 的 HTML，不设闸就是死循环。
 */
function claimAutoReload() {
  try {
    const last = Number(sessionStorage.getItem(STALE_KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(STALE_KEY, String(Date.now()));
    return true;
  } catch {
    // 隐私模式下 sessionStorage 会抛：宁可不自动刷，也别把用户困在循环里
    return false;
  }
}

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isStaleAction = error?.message?.includes("Failed to find Server Action");
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (!isStaleAction || !claimAutoReload()) return;
    setReloading(true);
    const timer = window.setTimeout(() => window.location.reload(), 900);
    return () => window.clearTimeout(timer);
  }, [isStaleAction]);

  const title = reloading ? "检测到新版本" : isStaleAction ? "页面已更新" : "出错了";
  const desc = reloading
    ? "正在自动刷新，请稍候…"
    : isStaleAction
      ? "刚刚做过一次版本更新，本页的提交通道已失效。刷新后请重新填写表单，配图需要再选一次。"
      : "页面遇到了意外错误，请刷新重试";

  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FBF7F2",
          fontFamily: '"PingFang SC","Hiragino Sans GB",system-ui,sans-serif',
        }}
      >
        <div style={{ textAlign: "center", padding: "40px 24px", maxWidth: 360 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>{reloading ? "⏳" : "🔄"}</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#14110f", margin: "0 0 12px" }}>
            {title}
          </h2>
          <p style={{ fontSize: 15, color: "#6b6158", lineHeight: 1.6, margin: "0 0 28px" }}>
            {desc}
          </p>
          {reloading ? null : (
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "12px 36px",
                fontSize: 16,
                fontWeight: 700,
                color: "#fff",
                background: "#E8590C",
                border: "none",
                borderRadius: 12,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(232,89,12,.25)",
              }}
            >
              刷新页面
            </button>
          )}
        </div>
      </body>
    </html>
  );
}
