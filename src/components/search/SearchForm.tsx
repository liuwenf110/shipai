"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";

/**
 * 搜索表单：用 router.push 做客户端软导航，替代原先 GET 表单整页提交。
 * 小程序 web-view 里整页 reload 会触发一次「域名」系统提示，软导航可避免这次弹窗。
 * basePath 由 Next 运行时自动处理，push 路径不带 /shipai 前缀。
 */
export function SearchForm({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-3 flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const keyword = q.trim();
        startTransition(() => {
          router.push(keyword ? `/search?q=${encodeURIComponent(keyword)}` : "/search");
        });
      }}
    >
      <div className="relative flex-1">
        <Icon
          name="search"
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute"
        />
        <input
          name="q"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="搜索派名、公司、动态关键词…"
          className="input pl-9"
          autoFocus={!initialQuery}
        />
      </div>
      <button type="submit" className="btn-primary btn-sm h-10" disabled={pending}>
        {pending ? "搜索中…" : "搜索"}
      </button>
    </form>
  );
}
