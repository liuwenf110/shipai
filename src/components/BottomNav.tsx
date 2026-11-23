"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { stripBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";

const ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "首页", icon: "home" },
  { href: "/discover", label: "发现", icon: "compass" },
  { href: "/notifications", label: "消息", icon: "bell" },
  { href: "/me", label: "我的", icon: "user" },
];

export function BottomNav({
  unreadCount = 0,
  unreadMessages = 0,
  signedIn = false,
}: {
  unreadCount?: number;
  unreadMessages?: number;
  signedIn?: boolean;
}) {
  // usePathname 在子路径部署时会带上前缀，先剥掉再比较高亮
  const pathname = stripBasePath(usePathname());

  // 未登录时不展示「发现」「消息」入口（发现页仅登录可见，消息无内容可看）
  const leading = ITEMS.slice(0, 2).filter((item) => signedIn || item.href !== "/discover");
  const trailing = ITEMS.slice(2).filter((item) => signedIn || item.href !== "/notifications");

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-ink-line/80 bg-white/92 backdrop-blur-xl md:hidden">
      <div className="relative mx-auto flex max-w-md items-end justify-around px-2 pt-1.5">
        {leading.map((item) => (
          <NavItem key={item.href} item={item} active={isActive(item.href)} />
        ))}

        <Link
          href="/publish"
          className="relative -mt-6 flex flex-col items-center gap-1"
          aria-label="发布"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white shadow-[0_10px_24px_-8px_rgba(255,90,31,0.9)] transition active:scale-95">
            <Icon name="plus" size={22} strokeWidth={2.2} />
          </span>
          <span className="text-[10px] font-semibold text-ink-mute">发布</span>
        </Link>

        {trailing.map((item) => (
          <NavItem
            key={item.href}
            item={item}
            active={isActive(item.href)}
            // 私信不再写通知后，底部消息角标要自己合并两类未读，否则收私信无提示
            badge={item.href === "/notifications" ? unreadCount + unreadMessages : 0}
          />
        ))}
      </div>
    </nav>
  );
}

function NavItem({
  item,
  active,
  badge = 0,
}: {
  item: { href: string; label: string; icon: IconName };
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={item.href}
      className={cn(
        "relative flex w-16 flex-col items-center gap-0.5 rounded-xl py-2 transition",
        active ? "text-ink" : "text-ink-mute",
      )}
    >
      <span className="relative">
        <Icon name={item.icon} size={21} strokeWidth={active ? 2.1 : 1.7} />
        {badge > 0 ? (
          <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      <span className={cn("text-[10px]", active ? "font-bold" : "font-medium")}>{item.label}</span>
    </Link>
  );
}
