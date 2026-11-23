import { Icon, type IconName } from "@/components/Icon";
import { cn } from "@/lib/utils";

type Meta = {
  icon: IconName;
  label: string;
  tone: "brand" | "ok" | "warn" | "violet" | "ocean";
};

export const NOTIFICATION_META: Record<string, Meta> = {
  VERIFY: { icon: "shield", label: "身份认证", tone: "ok" },
  LEADER: { icon: "flag", label: "派主认证", tone: "brand" },
  POST: { icon: "message", label: "派内互动", tone: "ocean" },
  COMMENT: { icon: "message", label: "帖子互动", tone: "ocean" },
  MENTION: { icon: "message", label: "有人@你", tone: "ocean" },
  ACTIVITY: { icon: "calendar", label: "活动", tone: "violet" },
  MESSAGE: { icon: "message", label: "私信", tone: "ocean" },
  FOLLOW: { icon: "users", label: "关注", tone: "brand" },
  SYSTEM: { icon: "bell", label: "系统", tone: "warn" },
};

const TONE_BOX: Record<Meta["tone"], string> = {
  ok: "bg-[#E9F6EF] text-moss",
  brand: "bg-brand-soft text-brand-dark",
  violet: "bg-[#F1EAFE] text-plum",
  ocean: "bg-[#E8F1FE] text-ocean",
  warn: "bg-cream-sunk text-ink-soft",
};

export function notificationMeta(type: string): Meta {
  return NOTIFICATION_META[type] ?? NOTIFICATION_META.SYSTEM;
}

export function NotificationIcon({
  type,
  size = "md",
}: {
  type: string;
  size?: "md" | "lg";
}) {
  const meta = notificationMeta(type);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center",
        size === "lg" ? "h-11 w-11 rounded-2xl" : "h-8 w-8 rounded-xl",
        TONE_BOX[meta.tone],
      )}
    >
      <Icon name={meta.icon} size={size === "lg" ? 20 : 15} />
    </span>
  );
}
