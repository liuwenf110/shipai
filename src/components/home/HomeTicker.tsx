"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import type { HomeTickerItem } from "@/lib/home-ticker";

/** 标签到图标的映射放在展示层：lib 只出文案与去向，不关心长什么样 */
const TAG_ICON: Record<string, IconName> = {
  待办审批: "check",
  派主回归: "users",
  新活动: "calendar",
  热议: "message",
};

/** 单条停留时长：太短看不清，长了又显得不活跃 */
const INTERVAL_MS = 4500;

/**
 * 首页顶部消息栏：把「老派主回归上十派」等真实动态单行轮播出来。
 * 只渲染当前一条（不做整列堆叠），高度恒定，切换用透明度过渡，
 * 窄屏下文案单行截断，靠右箭头暗示可点。
 * 消息栏不提供关闭入口：里面混排了派主的待审批待办，关掉就等于漏审。
 * 文案字号保持不动，靠撑开控件（内边距 / 图标 / 指示点）把整条抬高半行、左右加宽。
 * 同一套约定再抬高：用户要的「半行」是竖向半个文字距离（约 6px），不是一整个行高，
 * 所以整条从 56px 到实测 64px（竖约半个文字），字号仍固定 12.5px。
 */
export function HomeTicker({ items }: { items: HomeTickerItem[] }) {
  const [index, setIndex] = useState(0);

  // 系统要求减少动效时不自动翻页，用户仍可点按圆点手动切换
  useEffect(() => {
    if (items.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % items.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [items.length]);

  if (!items.length) return null;

  const current = items[Math.min(index, items.length - 1)];
  const icon = TAG_ICON[current.tag] ?? "sparkle";
  // 待办审批是只面向本人的事，比公共动态更该抢视线，单独用亮红文案（与身份卡提醒同色）
  const isTodo = current.tag === "待办审批";

  return (
    <section
      aria-label="首页消息栏"
      className="card flex items-center gap-3.5 px-5 py-4"
    >
      <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-soft px-3.5 py-2 text-[10.5px] font-black text-brand-dark">
        <Icon name="bell" size={15} />
        消息
      </span>

      <Link
        href={current.href}
        className="flex min-w-0 flex-1 items-center gap-2"
        aria-live="polite"
      >
        <Icon name={icon} size={18} className={isTodo ? "shrink-0 text-[#D92B20]" : "shrink-0 text-brand"} />
        <span
          key={current.id}
          className={
            isTodo
              ? "ticker-line min-w-0 flex-1 truncate text-[12.5px] font-black text-[#D92B20]"
              : "ticker-line min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink"
          }
        >
          {current.text}
        </span>
        {/* 时间差在窄屏让位给文案：轮播条首要让人看清「谁干了什么」 */}
        <span className="hidden shrink-0 text-[10.5px] text-ink-mute sm:block">{current.when}</span>
        <Icon name="right" size={18} className="shrink-0 text-ink-mute" />
      </Link>

      {/* 窄屏用计数代替一排圆点：十条消息就是十个点，比文案还宽 */}
      {items.length > 1 ? (
        <>
          <div className="hidden shrink-0 items-center gap-1 sm:flex">
            {items.map((item, position) => (
              <button
                key={item.id}
                type="button"
                aria-label={`查看第 ${position + 1} 条消息`}
                aria-current={position === index}
                onClick={() => setIndex(position)}
                className={
                  position === index
                    ? "h-2.5 w-5 rounded-full bg-brand transition-all"
                    : "h-2.5 w-2.5 rounded-full bg-ink-line transition-all hover:bg-ink-mute"
                }
              />
            ))}
          </div>
          <button
            type="button"
            aria-label={`查看第 ${index + 1} 条消息，共 ${items.length} 条`}
            onClick={() => setIndex((value) => (value + 1) % items.length)}
            className="shrink-0 rounded-md bg-cream-sunk px-2 py-1.5 text-[10.5px] font-bold text-ink-mute tabular-nums sm:hidden"
          >
            {index + 1}/{items.length}
          </button>
        </>
      ) : null}
    </section>
  );
}
