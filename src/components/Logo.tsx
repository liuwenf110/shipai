import Link from "next/link";
import { PLATFORM_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Logo({
  href = "/",
  compact = false,
  className,
}: {
  href?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("group flex items-center gap-2", className)}>
      <span className="relative flex h-9 w-9 items-center justify-center rounded-[13px] bg-ink text-white shadow-[0_6px_16px_-8px_rgba(20,17,15,0.8)]">
        <span className="absolute inset-0 rounded-[13px] bg-gradient-to-br from-brand/90 via-brand/40 to-transparent opacity-90" />
        <span className="relative text-[15px] font-black tracking-tight">派</span>
      </span>
      {!compact ? (
        <span className="flex flex-col leading-none">
          <span className="text-[17px] font-black tracking-tight text-ink">{PLATFORM_NAME}</span>
          <span className="mt-1 text-[10px] font-medium tracking-[0.18em] text-ink-mute">
            CAMPUS ALUMNI CLUBS
          </span>
        </span>
      ) : null}
    </Link>
  );
}
