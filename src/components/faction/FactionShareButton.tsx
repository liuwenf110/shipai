"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { stripBasePath, withBasePath } from "@/lib/base-path";
import { inMiniProgramWebView } from "@/lib/wx-jssdk";

/**
 * 构造分享用的查询串：只携带 ref=share 与环境标记 from=wxapp，
 * 丢掉一次性参数（壳拼的 _t 时间戳、页内 ok/error 提示），避免转发的链接又脏又长。
 * 壳侧自己会拼 from=wxapp，给小程序的 path 不重复保留。
 */
function shareQuery(search: string, keepFrom = true) {
  const current = new URLSearchParams(search);
  const out = new URLSearchParams();
  const from = keepFrom ? current.get("from") : null;
  if (from) out.set("from", from);
  out.set("ref", "share");
  return `?${out.toString()}`;
}

/**
 * 分享按钮（派页与活动详情页共用）：点击展开分享面板。
 * - 普通浏览器：生成带 ?ref=share 的当前页链接，支持复制文案+链接/仅链接与系统分享。
 * - 小程序 web-view 内：H5 无法主动调起微信分享面板，只能把分享信息 postMessage 给壳，
 *   引导用户改点右上角「···」转发。
 */
export function FactionShareButton({
  slogan,
  scope = "faction",
  path,
  image,
}: {
  slogan: string;
  /** 分享对象：整个派（默认）或派内某场活动，只差文案与链接约定 */
  scope?: "faction" | "activity";
  /** 分享目标页的站内干净路径（不含部署前缀）：列表卡上分享另一页时传，不传则分享当前页 */
  path?: string;
  /** 分享卡片封面图：可传站内相对路径，组件内补成小程序能拉的 https 绝对地址 */
  image?: string;
}) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  // 给壳／中转页的分享三要素（必须在客户端才能拼出绝对地址）
  const [shareTarget, setShareTarget] = useState<{
    title: string;
    path: string;
    image: string;
  } | null>(null);
  const [mp, setMp] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      const { origin, pathname, search } = window.location;
      // 跨页分享（如发现页热门活动卡）目标路径由服务端传入，需自行补部署前缀
      const target = path ? withBasePath(path) : pathname;
      setLink(`${origin}${target}${shareQuery(search)}`);
      setShareTarget({
        title: slogan,
        // 给壳的是去掉部署前缀的干净路径，壳侧与 H5_BASE（自带 /shipai）拼接
        path: `${path ?? stripBasePath(pathname)}${shareQuery(search, false)}`,
        image: image ? (image.startsWith("http") ? image : `${origin}${image}`) : "",
      });
      setMp(inMiniProgramWebView());
    }
  }, [open, path, image, slogan]);

  // 小程序内展开面板：注入 jweixin 并把分享信息 postMessage 给壳（右上角转发时壳会收到）
  useEffect(() => {
    if (!open || !mp || !shareTarget) return;
    const payload = { type: "share", ...shareTarget };
    const post = () => window.wx?.miniProgram?.postMessage({ data: payload });
    if (window.wx?.miniProgram) {
      post();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";
    script.onload = post;
    document.head.appendChild(script);
    // 不主动移除：登录页微信按钮等组件也在复用同一份 jweixin
  }, [open, mp, shareTarget]);

  // 点击面板外区域收起
  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // http 或旧浏览器下 clipboard API 不可用，退回临时 textarea
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1800);
  }

  const canNativeShare =
    typeof window !== "undefined" && typeof window.navigator?.share === "function";

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        aria-label={scope === "activity" ? "分享这个活动" : "分享这个派"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={open ? "btn-sm btn-primary" : "btn-ghost btn-sm"}
      >
        <Icon name="share" size={13} />
        分享
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-[290px] rounded-2xl border border-ink-line bg-white p-3.5 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-black leading-snug text-ink">{slogan}</p>
            <button
              type="button"
              aria-label="关闭分享面板"
              onClick={() => setOpen(false)}
              className="shrink-0 text-ink-mute hover:text-ink"
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          {mp ? (
            <div className="mt-2.5 rounded-xl border border-[#07C160]/30 bg-[#E8F8EE] px-3 py-2.5">
              <p className="text-[12px] font-bold text-[#07C160]">点右上角「···」→ 发送给朋友</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                {scope === "activity"
                  ? "分享卡片标题已设为上方口号，对方点开即直达这场活动，微信一键登录后加入本派即可报名。"
                  : "分享卡片标题已设为上方口号，对方点开即直达本派页，微信一键登录后可加入。"}
              </p>
            </div>
          ) : (
            <>
              <p className="mt-2 break-all rounded-xl bg-cream px-2.5 py-2 text-[11px] leading-relaxed text-ink-soft">
                {link}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => copy("all", `${slogan}\n${link}`)}
                  className="btn-primary btn-sm"
                >
                  {copied === "all" ? "已复制 ✓" : "复制文案+链接"}
                </button>
                <button
                  type="button"
                  onClick={() => copy("link", link)}
                  className="btn-ghost btn-sm"
                >
                  {copied === "link" ? "已复制 ✓" : "仅复制链接"}
                </button>
                {canNativeShare ? (
                  <button
                    type="button"
                    onClick={() => {
                      window.navigator.share({ title: slogan, text: slogan, url: link }).catch(() => {});
                    }}
                    className="btn-ghost btn-sm"
                  >
                    更多
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-[10.5px] leading-relaxed text-ink-mute">
                {scope === "activity"
                  ? "发给还没入派的老同事，TA 打开链接注册加入本派后就能报名这场活动。"
                  : "发给还没入派的老同事，TA 打开链接注册后就能回到这个派。"}
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
