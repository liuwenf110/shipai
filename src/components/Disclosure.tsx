"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * JS 状态驱动的折叠面板，替代原生 <details>/<summary>。
 * 小程序 web-view（Android X5/XWEB 内核）里 <summary> 点击不触发原生折叠，
 * 审核曾因此判定「协议功能点击无响应」；改用 React state 切换，全内核可靠。
 * 内容用 hidden 保留挂载而非卸载，避免折叠后表单字段从 DOM 移除被 form.reset 丢值。
 */
export function Disclosure({
  summary,
  children,
  open: openProp,
  onOpenChange,
  defaultOpen = false,
  className,
  summaryClassName,
  id,
}: {
  summary: ReactNode;
  children: ReactNode;
  /** 受控模式：由父组件接管展开状态（如点协议名联动展开） */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  className?: string;
  summaryClassName?: string;
  id?: string;
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolled;

  function toggle() {
    const next = !open;
    if (!isControlled) setUncontrolled(next);
    onOpenChange?.(next);
  }

  return (
    <div id={id} className={className}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle();
          }
        }}
        className={cn("cursor-pointer select-none", summaryClassName)}
      >
        {summary}
      </div>
      <div className={cn(open ? "block" : "hidden")}>{children}</div>
    </div>
  );
}
