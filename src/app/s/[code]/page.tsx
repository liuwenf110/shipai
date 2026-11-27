import { notFound, redirect } from "next/navigation";
import { resolveShareCode } from "@/lib/share-code";

/**
 * 带参小程序码的落地页：scene `/s/<短码>` → 壳透传给 H5 的这条路径 → 302 到真实内容。
 *
 * 帖子与活动的 id 是 24 位 cuid，直接烤进 scene 会超过 32 字符上限，所以长路径统一走短码；
 * 派页这类短路径仍然直接深链（历史海报的码不依赖这里）。
 * 落地一律补 `ref=share`：详情页靠它旁路派隔离，未登录扫码的人才能直接看到内容。
 */
export default async function ShareCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const target = await resolveShareCode(decodeURIComponent(code));
  if (!target) notFound();
  redirect(`${target}${target.includes("?") ? "&" : "?"}ref=share`);
}
