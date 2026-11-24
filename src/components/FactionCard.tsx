import Link from "next/link";
import type { ReactNode } from "react";
import type { Company, Faction } from "@prisma/client";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Icon } from "@/components/Icon";
import { categoryOf, FACTION_STATUS } from "@/lib/constants";
import type { PublicUser } from "@/lib/revive";

type FactionCardData = Faction & {
  company: Company;
  leader: PublicUser | null;
};

// 卡片外壳：linkable=false 时降级为普通 div，连 href 都不生成（未登录落地页只展示、不可点进派主页）
function CardShell({
  linkable,
  slug,
  children,
}: {
  linkable: boolean;
  slug: string;
  children: ReactNode;
}) {
  const className =
    "group card block overflow-hidden transition" +
    (linkable ? " hover:-translate-y-0.5 hover:shadow-float" : "");
  return linkable ? (
    <Link href={`/factions/${slug}`} className={className}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

export function FactionCard({
  faction,
  joined = false,
  compact = false,
  showStats = true,
  linkable = true,
}: {
  faction: FactionCardData;
  joined?: boolean;
  compact?: boolean;
  showStats?: boolean;
  linkable?: boolean;
}) {
  const meta = categoryOf(faction.category);
  const status = FACTION_STATUS[faction.status as keyof typeof FACTION_STATUS];

  // 公司 logo 方块。展示规则：无派主（派主虚位以待）的派不展示公司标识
  const companyLogo = (
    <span
      className="flex shrink-0 items-center justify-center rounded-[5px] px-1 text-[8px] font-bold leading-none text-white"
      style={{ background: faction.company.color, height: 18, minWidth: 18 }}
    >
      {faction.company.logoText}
    </span>
  );

  // 身份标识组：有派主 = 公司 logo+短名；无派主 = 不展示公司，仅保留行内提示。
  // 「我的派」徽章取决于用户是否加入，与派主无关，两种情况都保留（无派主时落在行右侧）。
  // 非 compact 放在派主行右侧 ml-auto 组内；compact 无派主行，放在计数行左侧同组内
  const identityGroup = (
    <>
      {faction.leader ? (
        <>
          {companyLogo}
          <span className="truncate text-[11.5px] font-semibold text-ink-soft">
            {faction.company.shortName}
          </span>
        </>
      ) : null}
      {joined ? <Badge tone="brand">我的派</Badge> : null}
    </>
  );

  return (
    <CardShell linkable={linkable} slug={faction.slug}>
      <div
        className="relative px-4 pb-3 pt-3.5"
        style={{ backgroundImage: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(255,255,255,0.55),transparent_55%)]" />
        <div className="relative flex items-start justify-between">
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-ink/70 backdrop-blur">
              {meta.label}
            </span>
            {faction.status !== "ACTIVE" ? (
              <span className="rounded-full bg-ink/75 px-2 py-0.5 text-[10px] font-bold text-white">
                {status?.label ?? "审核中"}
              </span>
            ) : null}
          </div>
          <span className="text-2xl drop-shadow-sm">{faction.emoji}</span>
        </div>
        <h3 className="relative mt-3 text-[17px] font-black leading-tight tracking-tight text-ink/90">
          {faction.name}
        </h3>
        <p className="relative mt-0.5 line-clamp-1 text-[11.5px] font-medium text-ink/60">
          {faction.tagline}
        </p>
      </div>

      <div className="px-4 pb-3 pt-2.5">
        {compact || showStats ? (
          <div className={`flex items-center ${compact ? "justify-between" : "justify-end"}`}>
            {compact ? <span className="flex min-w-0 items-center gap-1.5">{identityGroup}</span> : null}
            {showStats ? (
              <span className="flex shrink-0 items-center gap-2.5 text-[11px] text-ink-mute">
                <span className="flex items-center gap-0.5">
                  <Icon name="users" size={12} />
                  {faction.memberCount}
                </span>
                <span className="flex items-center gap-0.5">
                  <Icon name="message" size={12} />
                  {faction.postCount}
                </span>
              </span>
            ) : null}
          </div>
        ) : null}

        {!compact ? (
          <div className="mt-2 flex items-center gap-1.5 border-t border-dashed border-ink-line/70 pt-2">
            {faction.leader ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <Avatar
                  name={faction.leader.nickname}
                  color={faction.leader.avatarColor}
                  src={faction.leader.avatarImage}
                  size="xs"
                />
                <span className="truncate text-[11px] text-ink-mute">
                  派主 · {faction.leader.nickname}
                </span>
              </span>
            ) : (
              <Badge tone="warn">招募派主</Badge>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-1.5">{identityGroup}</span>
            {linkable ? (
              <span className="ml-2 shrink-0 text-[11px] font-semibold text-brand opacity-0 transition group-hover:opacity-100">
                进入 →
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </CardShell>
  );
}
