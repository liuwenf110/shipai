"use client";

import { useState } from "react";
import type { ReactNode } from "react";

/**
 * 「查看更多 / 收起」折叠壳：调用方把超出首屏的内容作为 children 传进来，默认整体隐藏。
 * 用 state 驱动而不是原生 details/summary——安卓小程序 web-view 的 X5 内核不响应 summary 点击。
 * children 只被 hidden 掉不卸载，展开时无需二次请求。
 */
export function ShowMore({ count, children }: { count: number; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className={expanded ? undefined : "hidden"}>{children}</div>
      {count > 0 ? (
        <div className="mt-3 flex justify-center">
          <button type="button" onClick={() => setExpanded((value) => !value)} className="btn-ghost px-4">
            {expanded ? (
              "收起"
            ) : (
              <>
                查看更多
                <span className="ml-1 text-ink-mute">（还有 {count} 个）</span>
              </>
            )}
          </button>
        </div>
      ) : null}
    </>
  );
}
