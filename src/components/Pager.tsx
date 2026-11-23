import Link from "next/link";
import { cn } from "@/lib/utils";

/** 服务端分页条：链接式翻页，保留原有查询参数 */
export function Pager({
  basePath,
  page,
  pageSize,
  total,
  query = {},
  className,
}: {
  basePath: string;
  page: number;
  pageSize: number;
  total: number;
  query?: Record<string, string | undefined>;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const hrefFor = (target: number) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    if (target > 1) params.set("page", String(target));
    const search = params.toString();
    return search ? `${basePath}?${search}` : basePath;
  };

  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <nav className={cn("flex items-center justify-between gap-2 px-4 py-3", className)}>
      {prevDisabled ? (
        <span className="btn-quiet btn-sm cursor-not-allowed opacity-40">上一页</span>
      ) : (
        <Link href={hrefFor(page - 1)} className="btn-quiet btn-sm">
          上一页
        </Link>
      )}
      <span className="text-[11px] font-semibold text-ink-mute">
        第 {page} / {totalPages} 页 · 共 {total} 条
      </span>
      {nextDisabled ? (
        <span className="btn-quiet btn-sm cursor-not-allowed opacity-40">下一页</span>
      ) : (
        <Link href={hrefFor(page + 1)} className="btn-quiet btn-sm">
          下一页
        </Link>
      )}
    </nav>
  );
}
