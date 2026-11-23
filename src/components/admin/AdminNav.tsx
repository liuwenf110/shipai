"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { stripBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";

export type AdminNavItem = { href: string; label: string; icon: IconName; key: string };

/** 管理端左侧导航：高亮当前模块，待办数量以徽标展示 */
export function AdminNav({
  items,
  counts,
}: {
  items: AdminNavItem[];
  counts: Record<string, number>;
}) {
  const pathname = stripBasePath(usePathname());

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0">
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-[12.5px] font-semibold transition md:border-transparent",
              active
                ? "border-brand/60 bg-white text-ink ring-1 ring-brand/25"
                : "border-ink-line/60 bg-white text-ink-soft hover:border-brand/50 hover:text-ink md:bg-transparent",
            )}
          >
            <Icon name={item.icon} size={15} className={active ? "text-brand" : "text-ink-mute"} />
            {item.label}
            {counts[item.key] ? (
              <span className="ml-auto rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">
                {counts[item.key]}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
