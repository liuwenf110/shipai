import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";

export function Notice({
  message,
  tone = "ok",
  className,
}: {
  message?: string | null;
  tone?: "ok" | "error" | "info";
  className?: string;
}) {
  if (!message) return null;

  const styles = {
    ok: "bg-[#E9F6EF] text-moss ring-[#C8E8D8]",
    error: "bg-[#FDECEC] text-[#B42318] ring-[#F5CDCB]",
    info: "bg-[#EEF4FF] text-ocean ring-[#D3E2FB]",
  }[tone];

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-medium ring-1",
        styles,
        className,
      )}
    >
      <Icon
        name={tone === "error" ? "flag" : tone === "info" ? "sparkle" : "check"}
        size={16}
        className="mt-0.5 shrink-0"
      />
      <span>{message}</span>
    </div>
  );
}

export function QueryNotice({
  ok,
  error,
  className,
}: {
  ok?: string | string[];
  error?: string | string[];
  className?: string;
}) {
  const okMessage = Array.isArray(ok) ? ok[0] : ok;
  const errorMessage = Array.isArray(error) ? error[0] : error;
  return (
    <>
      <Notice message={okMessage} tone="ok" className={className} />
      <Notice message={errorMessage} tone="error" className={className} />
    </>
  );
}
