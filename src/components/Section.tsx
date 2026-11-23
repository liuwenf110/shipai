import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";

export function EmptyState({
  icon = "sparkle",
  title,
  desc,
  actionLabel,
  actionHref,
}: {
  icon?: IconName;
  title: string;
  desc?: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-cream-sunk text-ink-mute">
        <Icon name={icon} size={24} />
      </div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {desc ? <p className="mt-1 max-w-[280px] text-xs leading-relaxed text-ink-mute">{desc}</p> : null}
      {actionLabel && actionHref ? (
        <Link href={actionHref} className="btn-ghost btn-sm mt-4">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function SectionHeader({
  title,
  desc,
  href,
  linkLabel = "查看全部",
}: {
  title: string;
  desc?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-[17px] font-bold tracking-tight text-ink">{title}</h2>
        {desc ? <p className="mt-0.5 text-xs text-ink-mute">{desc}</p> : null}
      </div>
      {href ? (
        <Link
          href={href}
          className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-ink-mute hover:text-brand"
        >
          {linkLabel}
          <Icon name="right" size={13} />
        </Link>
      ) : null}
    </div>
  );
}
