import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/Section";
import { categoryOf } from "@/lib/constants";

export const metadata = { title: "发布内容" };

export default async function PublishPage() {
  const user = await requireUser("/publish");

  // 只列已正式加入的派，待审批的还不能发帖/发起活动
  const memberships = await prisma.factionMember.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    include: { faction: { include: { company: true } } },
    orderBy: { joinedAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <Link
        href="/"
        className="flex items-center gap-1 text-[12px] font-semibold text-ink-mute hover:text-ink"
      >
        <Icon name="back" size={14} />
        首页
      </Link>

      <div className="mt-3">
        <p className="text-[11px] font-bold tracking-[0.22em] text-brand">CREATE</p>
        <h1 className="mt-1 text-[24px] font-black tracking-tight">发布内容</h1>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-mute">
          选一个你已加入的派，发条动态或发起一场活动。
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {memberships.length ? (
          memberships.map(({ faction }) => {
            const meta = categoryOf(faction.category);
            return (
              <div key={faction.id} className="card p-3">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[20px]"
                    style={{
                      backgroundImage: `linear-gradient(135deg, ${meta.from}, ${meta.to})`,
                    }}
                  >
                    {faction.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-ink">{faction.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-ink-mute">
                      {faction.company.shortName} · {faction.memberCount} 人
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link
                    href={`/factions/${faction.slug}?tab=posts`}
                    className="btn-primary btn-sm flex items-center justify-center gap-1"
                  >
                    <Icon name="message" size={14} />
                    发帖
                  </Link>
                  <Link
                    href={`/factions/${faction.slug}?tab=activities`}
                    className="btn-ghost btn-sm flex items-center justify-center gap-1"
                  >
                    <Icon name="calendar" size={14} />
                    发起活动
                  </Link>
                </div>
              </div>
            );
          })
        ) : (
          <div className="card">
            <EmptyState
              icon="compass"
              title="你还没有加入任何派"
              desc="加入兴趣派后即可在里面发动态、约活动"
              actionLabel="去发现兴趣派"
              actionHref="/discover"
            />
          </div>
        )}
      </div>

      {memberships.length ? (
        <Link
          href="/factions/new"
          className="mt-4 flex items-center justify-center gap-1 text-[12px] font-semibold text-ink-mute hover:text-brand"
        >
          <Icon name="plus" size={13} />
          没有找到想要的派？组建一个新的派
        </Link>
      ) : null}
    </div>
  );
}
