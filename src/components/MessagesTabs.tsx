import Link from "next/link";
import { cn } from "@/lib/utils";

/** 「通知 / 私信」分段控件：/notifications 与 /messages 两页顶部复用 */
export function MessagesTabs({
  active,
  unreadNotifications,
  unreadMessages,
}: {
  active: "notifications" | "messages";
  unreadNotifications?: number;
  unreadMessages?: number;
}) {
  const item = (key: "notifications" | "messages", label: string, href: string, unread: number) => (
    <Link
      href={href}
      className={cn(
        "relative flex-1 rounded-full px-4 py-1.5 text-center text-[13px] font-semibold transition",
        active === key ? "bg-white text-ink shadow-sm" : "text-ink-mute hover:text-ink",
      )}
    >
      {label}
      {unread > 0 ? (
        <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white align-[-1px]">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );

  return (
    <div className="inline-flex w-full max-w-xs rounded-full bg-cream-sunk p-1">
      {item("notifications", "通知", "/notifications", unreadNotifications ?? 0)}
      {item("messages", "私信", "/messages", unreadMessages ?? 0)}
    </div>
  );
}
