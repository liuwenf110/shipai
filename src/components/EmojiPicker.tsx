"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_EMOJI_GROUP, EMOJI_GROUPS } from "@/lib/emoji";
import { cn } from "@/lib/utils";

/**
 * 表情面板：贴在 textarea 上方/旁边的可折叠面板，按分组 tab 展示系统 emoji 清单。
 * 由调用方持有 textarea 的 ref，选中 emoji 时通过 onPick 回调把字符 + 目标 DOM 一起回传，
 * 便于外部按 selectionStart 精确插入而不是无脑追加。
 */
export function EmojiPicker({
  onPick,
  align = "left",
  compact = false,
}: {
  onPick: (emoji: string) => void;
  align?: "left" | "right";
  /** 紧凑模式：面板附在工具条里时按钮取 h-7 w-7，与侧边同高 */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string>(DEFAULT_EMOJI_GROUP);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const active = EMOJI_GROUPS.find((item) => item.key === activeKey) ?? EMOJI_GROUPS[0];

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        aria-label="插入表情"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center justify-center rounded-lg border leading-none transition",
          compact ? "h-7 w-7 text-[14px]" : "h-9 w-9 text-[18px]",
          open
            ? "border-brand bg-brand-soft"
            : "border-ink-line bg-white hover:border-brand/60",
        )}
      >
        {open ? "✨" : "😊"}
      </button>

      {open ? (
        <div
          className={cn(
            "absolute top-full z-30 mt-1.5 w-[280px] rounded-2xl border border-ink-line bg-white p-2.5 shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <div className="flex items-center gap-1 border-b border-ink-line/60 pb-1.5">
            {EMOJI_GROUPS.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => setActiveKey(group.key)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold transition",
                  group.key === active.key
                    ? "bg-ink text-white"
                    : "text-ink-mute hover:text-ink",
                )}
              >
                {group.label}
              </button>
            ))}
          </div>
          <div className="mt-2 grid max-h-[196px] grid-cols-8 gap-1 overflow-y-auto">
            {active.items.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onPick(emoji);
                }}
                title={emoji}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[18px] leading-none transition hover:bg-cream"
              >
                {emoji}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-mute">
            选中即插到光标位置；单个 emoji 按 2 字符计入 500 字上限。
          </p>
        </div>
      ) : null}
    </div>
  );
}
