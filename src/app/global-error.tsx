"use client";

/**
 * 全局错误边界：捕获 Server Action ID 失效（部署后旧页面缓存）等未处理异常，
 * 避免用户看到 Next.js 默认的红色错误页。点击「刷新页面」重新获取最新产物。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isStaleAction = error?.message?.includes("Failed to find Server Action");

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
          <div style={{ fontSize: 56, marginBottom: 16 }}>🔄</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#14110f", margin: "0 0 12px" }}>
            {isStaleAction ? "页面已更新" : "出错了"}
          </h2>
          <p style={{ fontSize: 15, color: "#6b6158", lineHeight: 1.6, margin: "0 0 28px" }}>
            {isStaleAction
              ? "检测到版本更新，请刷新页面以继续使用"
              : "页面遇到了意外错误，请刷新重试"}
          </p>
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
        </div>
      </body>
    </html>
  );
}
