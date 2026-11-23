import Link from "next/link";
import { prisma } from "@/lib/db";
import { activityOf, loadFactionActivity, rankFactions } from "@/lib/activity";
import { PUBLIC_USER } from "@/lib/api";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/Section";
import { QueryNotice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { setFactionStatusAction } from "@/lib/actions/admin";
import { categoryOf, FACTION_STATUS } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";

const TABS = [
  { key: "ALL", label: "全部" },
  { key: "ACTIVE", label: "运营中" },
  { key: "REVIEWING", label: "筹备中" },
  { key: "ARCHIVED", label: "已关闭" },
];

export default async function AdminFactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; ok?: string; error?: string }>;
}) {
  const query = await searchParams;
  const status = TABS.some((item) => item.key === query.status) ? query.status! : "ALL";

  const [candidates, activity] = await Promise.all([
    prisma.faction.findMany({
      where: status === "ALL" ? {} : { status },
      include: { company: true, leader: { select: PUBLIC_USER } },
      take: 100,
    }),
    loadFactionActivity(),
  ]);

  // 与前台完全同一口径：展示位置权重钉顶，其余先看成员数再看动态数，管理员看到的顺序就是用户看到的顺序
  const factions = rankFactions(candidates, activity).slice(0, 60);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-bold tracking-[0.22em] text-brand">CLUBS</p>
        <h1 className="mt-1 text-[22px] font-black tracking-tight">兴趣派管理</h1>
        <p className="mt-1 text-[12px] text-ink-mute">
          可在此直接上线或关闭派；关闭后成员仍保留数据，但无法发帖与报名
        </p>
        <p className="mt-1 text-[11.5px] text-ink-mute">
          前台默认序：先比成员数、再比动态数（成员多的在前，成员相同则动态多的在前），两项都相同时再比近
          30 天动态与评论、综合活跃度分值；编辑里的「展示位置」大于 0 时该派固定钉在列表顶部，不参与上述比较
        </p>
      </div>

      <QueryNotice ok={query.ok} error={query.error} />

      <div className="flex items-center gap-1.5">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/factions?status=${item.key}`}
            className={cn("tab-pill", status === item.key && "tab-pill-active")}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {factions.length ? (
        <div className="space-y-2.5">
          {factions.map((faction, index) => {
            const meta = categoryOf(faction.category);
            const statusMeta =
              FACTION_STATUS[faction.status as keyof typeof FACTION_STATUS] ?? FACTION_STATUS.ACTIVE;
            const act = activityOf(activity, faction.id);
            return (
              <div key={faction.id} className="card p-3.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[18px]"
                    style={{ backgroundImage: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}
                  >
                    {faction.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/factions/${faction.slug}`}
                        className="text-[13px] font-bold text-ink hover:text-brand"
                      >
                        {faction.name}
                      </Link>
                      <Badge tone={statusMeta.tone as "ok" | "warn" | "mute"}>
                        {statusMeta.label}
                      </Badge>
                      <Badge tone="mute">{meta.label}</Badge>
                      {faction.sortOrder > 0 ? <Badge tone="warn">置顶 权重{faction.sortOrder}</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-ink-mute">
                      {faction.company.shortName} · {faction.memberCount} 人 · {faction.postCount} 条动态
                      {faction.leader ? ` · 派主 ${faction.leader.nickname}` : " · 招募派主"} ·
                      建派 {formatDate(faction.createdAt)}
                    </p>
                    <p
                      className="mt-1 text-[10.5px] font-semibold text-ink-soft"
                      title={`排序依据：成员 ${act.members} → 动态 ${act.posts} → 近30天 ${act.recentPosts + act.recentComments}；综合活跃度 ${act.score.toFixed(1)} = 成员 ${act.members}×1 + 动态 ${act.posts}×2 + 评论 ${act.comments}×1 + 点赞 ${act.likes}×0.5 + 近30天动态 ${act.recentPosts}×2 + 近30天评论 ${act.recentComments}×1`}
                    >
                      前台第 {index + 1} 位 · 成员 {act.members} · 动态 {act.posts} · 活跃度{" "}
                      {act.score.toFixed(1)}
                      {act.recentPosts || act.recentComments
                        ? `（近30天 ${act.recentPosts} 帖 / ${act.recentComments} 评）`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Link href={`/admin/factions/${faction.id}`} className="btn-quiet btn-sm">
                      编辑
                    </Link>
                    {faction.status !== "ACTIVE" ? (
                      <form action={setFactionStatusAction}>
                        <input type="hidden" name="factionId" value={faction.id} />
                        <input type="hidden" name="status" value="ACTIVE" />
                        <SubmitButton className="btn-primary btn-sm" pendingText="…">
                          上线
                        </SubmitButton>
                      </form>
                    ) : null}
                    {faction.status !== "ARCHIVED" ? (
                      <form action={setFactionStatusAction}>
                        <input type="hidden" name="factionId" value={faction.id} />
                        <input type="hidden" name="status" value="ARCHIVED" />
                        <SubmitButton className="btn-quiet btn-sm" pendingText="…">
                          关闭
                        </SubmitButton>
                      </form>
                    ) : null}
                    {faction.status === "ARCHIVED" ? (
                      <form action={setFactionStatusAction}>
                        <input type="hidden" name="factionId" value={faction.id} />
                        <input type="hidden" name="status" value="REVIEWING" />
                        <SubmitButton className="btn-quiet btn-sm" pendingText="…">
                          转筹备
                        </SubmitButton>
                      </form>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <EmptyState icon="compass" title="没有匹配的兴趣派" desc="换个状态筛选看看" />
        </div>
      )}
    </div>
  );
}
