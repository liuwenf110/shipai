import { Badge } from "@/components/Badge";
import { EMPLOYMENT_KIND } from "@/lib/constants";
import type { UserIdentity } from "@/lib/identity";

/**
 * 认证公司徽章：「公司短名」或「公司短名 · 在职/离职」。
 * 在职用绿色、离职用紫色，与派成员列表的跨公司徽章保持同一视觉语言。
 * showKind = false 时只展示公司名（派系内活动/发帖场景）；
 * showUnverified = true 时无认证公司改为展示「未认证」占位。
 */
export function CompanyBadge({
  identity,
  className,
  showKind = true,
  showUnverified = false,
}: {
  identity?: UserIdentity | null;
  className?: string;
  showKind?: boolean;
  showUnverified?: boolean;
}) {
  if (!identity) {
    return showUnverified ? (
      <Badge tone="mute" className={className}>
        未认证
      </Badge>
    ) : null;
  }

  return (
    <Badge tone={identity.kind === "ALUMNI" ? "violet" : "ok"} className={className}>
      {identity.companyShortName}
      {showKind ? ` · ${EMPLOYMENT_KIND[identity.kind].short}` : null}
    </Badge>
  );
}
