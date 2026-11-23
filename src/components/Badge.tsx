import { cn } from "@/lib/utils";

export type Tone = "brand" | "ok" | "warn" | "bad" | "mute" | "violet" | "ocean";

const TONES: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand-dark",
  ok: "bg-[#E7F5EE] text-moss",
  warn: "bg-[#FFF4D6] text-[#9A6B00]",
  bad: "bg-[#FDECEC] text-[#B42318]",
  mute: "bg-cream-sunk text-ink-mute",
  violet: "bg-[#F1EAFE] text-plum",
  ocean: "bg-[#E8F1FE] text-ocean",
};

export function Badge({
  children,
  tone = "mute",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-5",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({
  status,
  map,
}: {
  status: string;
  map: Record<string, { label: string; tone: string }>;
}) {
  const meta = map[status] ?? { label: status, tone: "mute" };
  return <Badge tone={meta.tone as Tone}>{meta.label}</Badge>;
}
