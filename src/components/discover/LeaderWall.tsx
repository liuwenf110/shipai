import Link from "next/link";
import type { Faction } from "@prisma/client";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { categoryOf } from "@/lib/constants";
import type { PublicUser } from "@/lib/revive";

type LeaderRow = Faction & { leader: PublicUser };

/**
 * 派主墙：发现页「热门活动」与派列表之间的一横滑小卡带。
 * 只收录已有派主的派——派主是派的门面，照片 + 简介 + 派宣传三件套比派名更能拉人进派。
 * 排序沿用派列表口径（后台权重 → 成员数 → 动态数…），由调用方排好后传入。
 */
export function LeaderWall({ rows }: { rows: LeaderRow[] }) {
  if (!rows.length) return null;

  return (
    <section className="mx-auto max-w-5xl px-4 pt-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[16px] font-black tracking-tight text-ink">
          <Icon name="users" size={16} /> 派主墙
        </h2>
        <span className="text-[11px] text-ink-mute">每个派的主理人，先认人再入派</span>
      </div>

      {/* 横向滚动：负 margin 让首尾卡片贴屏边，滚动条收掉以免挤占高度 */}
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {rows.map((faction) => {
          const leader = faction.leader;
          const meta = categoryOf(faction.category);
          return (
            <Link
              key={faction.id}
              href={`/factions/${faction.slug}`}
              className="group card block w-[176px] shrink-0 overflow-hidden transition hover:-translate-y-0.5 hover:shadow-float"
            >
              <div
                className="relative flex h-12 items-start justify-between px-3 pt-2"
                style={{ backgroundImage: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(255,255,255,0.55),transparent_55%)]" />
                <span className="relative flex items-center gap-1 truncate rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-ink/70 backdrop-blur">
                  <span className="text-[12px] leading-none">{faction.emoji}</span>
                  {faction.name}
                </span>
                <span className="relative rounded-full bg-ink/65 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                  派主
                </span>
              </div>

              <div className="px-3 pb-3">
                <div className="-mt-6 flex justify-center">
                  <Avatar name={leader.nickname} color={leader.avatarColor} src={leader.avatarImage} size="lg" ring />
                </div>
                <p className="mt-1.5 truncate text-center text-[13px] font-black leading-tight text-ink">
                  {leader.nickname}
                </p>
                <p className="mt-2 line-clamp-2 text-center text-[11px] leading-relaxed text-ink-soft">
                  {leader.bio?.trim() || "还没写简介，进派聊聊就知道。"}
                </p>

                <p className="mt-2 line-clamp-2 rounded-lg bg-cream px-2 py-1.5 text-center text-[10.5px] leading-relaxed text-ink-mute">
                  {faction.tagline}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
