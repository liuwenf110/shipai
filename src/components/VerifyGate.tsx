"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { stripBasePath } from "@/lib/base-path";

/** 认证引导不拦的路径：认证页自身、登录注册找回密码，以及「我的」（要留着看认证进度和退出登录） */
const ALLOW_PREFIXES = ["/verify", "/login", "/register", "/forgot", "/reset", "/me"];
/** 审核中允许本次会话先逛逛的临时放行标记（人工审核期间把人彻底锁死会直接流失） */
const DISMISS_KEY = "shipai.verify-gate.dismissed";

/**
 * 未认证用户的强制认证引导层。
 *
 * 注册完成、或以「未通过任何身份认证」的账号登录后，除白名单路径外的所有站内页面都被这一层盖住，
 * 只留一个「去公司身份认证」的出口；认证通过（Employment.status=VERIFIED）后 viewer.isVerified 变真，
 * 服务端不再渲染这一层，页面自然解锁。
 *
 * 认证材料已提交但仍在人工审核（PENDING，非大厂认证必走人工）时不把人锁死：
 * 文案改为「审核中」，并给出「我知道了，先看看」的会话级临时放行。
 *
 * 数据可见口径不在这里判定，仍由 src/lib/scope.ts 收口：非大厂/未认证只见勾了非大厂的派，
 * 大厂只见勾了大厂的派，这层只负责把用户推到认证页去。
 */
export function VerifyGate({
  verified,
  pending,
  nickname,
}: {
  verified: boolean;
  pending: boolean;
  nickname: string;
}) {
  // 子路径部署时 usePathname 会带 /shipai 前缀，与 BottomNav 同一口径先剥掉
  const pathname = stripBasePath(usePathname());
  // 首屏默认不放行（与服务端渲染一致），只在客户端读到会话标记后才放行，避免审核中用户闪一下内容
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const allowed = ALLOW_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const blocked = !verified && !allowed && !(pending && dismissed);

  // 盖住期间锁掉背景滚动，避免用户在遮罩下误点内容
  useEffect(() => {
    if (!blocked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [blocked]);

  if (!blocked) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-cream px-5">
      <div className="card w-full max-w-sm p-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand-dark">
          <Icon name="shield" size={22} />
        </span>
        <h2 className="mt-3 text-[17px] font-black tracking-tight text-ink">
          {pending ? "身份认证审核中" : `${nickname}，先完成身份认证`}
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
          {pending
            ? "你的认证材料已提交，运营人工审核通过后自动解锁全部页面。审核期间部分兴趣派与活动看不到。"
            : "为了你的使用体验和站内安全环境，请先完成公司身份认证。未完成认证时，部分兴趣派和活动看不到，也无法加入派、报名活动。"}
        </p>

        <Link href="/verify" className="btn-primary mt-4 flex w-full items-center justify-center gap-1">
          <Icon name="shield" size={15} />
          {pending ? "查看认证进度" : "去公司身份认证"}
        </Link>

        {pending ? (
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.setItem(DISMISS_KEY, "1");
              } catch {
                // 隐私模式下写不进 sessionStorage，退化为每次导航都再弹一次
              }
              setDismissed(true);
            }}
            className="mt-2 flex w-full items-center justify-center py-2 text-[12px] font-semibold text-ink-mute hover:text-ink"
          >
            我知道了，先看看
          </button>
        ) : null}
      </div>
    </div>
  );
}
