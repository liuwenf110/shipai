import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PLATFORM_DESC, PLATFORM_NAME, PLATFORM_SLOGAN } from "@/lib/constants";

export const metadata: Metadata = {
  title: {
    default: `${PLATFORM_NAME} · ${PLATFORM_SLOGAN}`,
    template: `%s · ${PLATFORM_NAME}`,
  },
  description: PLATFORM_DESC,
};

export const viewport: Viewport = {
  themeColor: "#FBF7F2",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // 手机适配：禁止捏合/双击缩放页面（微信 webview 与安卓认这个标记；iOS Safari 靠 globals.css 的 touch-action 兑底）
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
