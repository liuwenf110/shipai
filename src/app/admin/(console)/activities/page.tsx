import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/Badge";
import { CompanyBadge } from "@/components/CompanyBadge";
import { EmptyState } from "@/components/Section";
import { Pager } from "@/components/Pager";
import { QueryNotice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmSubmit } from "@/components/content/ConfirmSubmit";
import { Disclosure } from "@/components/Disclosure";
import { AdminActivityForm } from "@/components/admin/AdminActivityForm";
import { adminUpdateActivityAction } from "@/lib/actions/admin";
import { pickUserIdentity } from "@/lib/identity";
import { richTextToPlainText } from "@/lib/rich-text";
import { capacityLabel, cn, formatActivityTime, timeAgo, toDateTimeLocal } from "@/lib/utils";

const TABS = [
  { key: "OPEN", label: "报名中" },
  { key: "CLOSED", label: "已关闭" },
  { key: "ALL", label: "全部" },
];

export const metadata = { title: "活动治理" };

const PAGE_SIZE = 20;

export default async function AdminActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; ok?: string; error?: string }>;
}) {
  const query = await searchParams;
  const status = TABS.some((item) => item.key === query.status) ? query.status! : "OPEN";
  const redirectTo = `/admin/activities?status=${status}`;

  const where = status === "ALL" ? {} : { status };
  const total = await prisma.activity.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(Number(query.page) || 1, 1), totalPages);

  const activities = await prisma.activity.findMany({
    where,
    include: {
      faction: { include: { company: true } },
      creator: {
        select: {
          nickname: true,
          employments: {
            where: { status: "VERIFIED" },
            select: { companyId: true, kind: true, company: { select: { shortName: true } } },
          },
        },
      },
      _count: { select: { signups: true } },
    },
    orderBy: { startAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const factions = await prisma.faction.findMany({
    where: { status: "ACTIVE" },
    include: { company: true },
    orderBy: { memberCount: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-bold tracking-[0.22em] text-brand">ACTIVITIES</p>
        <h1 className="mt-1 text-[22px] font-black tracking-tight">活动治理</h1>
        <p className="mt-1 text-[12px] text-ink-mute">
          关闭报名后成员无法再报名；删除会一并清除报名记录
        </p>
      </div>

      <QueryNotice ok={query.ok} error={query.error} />

      <Disclosure
        className="card overflow-hidden"
        summaryClassName="flex list-none items-center justify-between px-4 py-3"
        summary={
          <>
            <span className="text-[12.5px] font-bold text-ink">代派主发布活动</span>
            <span className="text-[11px] text-ink-mute">展开填写</span>
          </>
        }
      >
        <AdminActivityForm
          mode="create"
          className="border-t border-ink-line/60 px-4 py-3"
          factionOptions={factions.map((faction) => ({
            id: faction.id,
            label: `${faction.company.shortName} · ${faction.name}`,
          }))}
        />
      </Disclosure>

      <div className="flex items-center gap-1.5">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/activities?status=${item.key}`}
            className={cn("tab-pill", status === item.key && "tab-pill-active")}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {activities.length ? (
        <div className="space-y-2.5">
          {activities.map((activity) => {
            const creatorIdentity = pickUserIdentity(
              activity.creator.employments,
              activity.faction.companyId,
            );
            return (
              <div key={activity.id} className="card p-3.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12.5px] font-bold text-ink">{activity.title}</span>
                  <Badge
                    tone={
                      activity.status === "OPEN"
                        ? "ok"
                        : activity.status === "CANCELLED"
                          ? "bad"
                          : "mute"
                    }
                  >
                    {activity.status === "OPEN"
                      ? "报名中"
                      : activity.status === "CANCELLED"
                        ? "已取消"
                        : "已关闭"}
                  </Badge>
                  <Badge tone="mute">派 · {activity.faction.company.shortName}</Badge>
                  <span className="text-[10px] text-ink-mute">{timeAgo(activity.createdAt)}</span>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-ink-mute">
                  {formatActivityTime(activity.startAt)} · {activity.location} · 报名{" "}
                  {capacityLabel(activity.signupCount, activity.capacity)}（报名记录 {activity._count.signups} 条）
                  <span>· 发起人 {activity.creator.nickname}</span>
                  <CompanyBadge identity={creatorIdentity} showKind={false} showUnverified />
                </p>
                <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-ink-soft">
                  {richTextToPlainText(activity.description)}
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  <Link
                    href={`/factions/${activity.faction.slug}?tab=activities`}
                    className="btn-quiet btn-sm"
                  >
                    前往派内
                  </Link>
                  <form action={adminUpdateActivityAction}>
                    <input type="hidden" name="activityId" value={activity.id} />
                    <input type="hidden" name="redirectTo" value={redirectTo} />
                    <input type="hidden" name="action" value={activity.status === "OPEN" ? "close" : "reopen"} />
                    <SubmitButton className="btn-ghost btn-sm" pendingText="…">
                      {activity.status === "OPEN" ? "关闭报名" : "恢复报名"}
                    </SubmitButton>
                  </form>
                  <form action={adminUpdateActivityAction}>
                    <input type="hidden" name="activityId" value={activity.id} />
                    <input type="hidden" name="redirectTo" value={redirectTo} />
                    <input type="hidden" name="action" value="delete" />
                    <ConfirmSubmit
                      confirmText="删除会一并清除报名记录，确定吗？"
                      className="text-[11px] font-semibold text-ink-mute transition hover:text-[#B42318]"
                    >
                      删除
                    </ConfirmSubmit>
                  </form>
                </div>

                <Disclosure
                  className="mt-2.5 border-t border-ink-line/60 pt-2.5"
                  summaryClassName="text-[11px] font-semibold text-ink-mute hover:text-brand"
                  summary="编辑活动信息"
                >
                  <AdminActivityForm
                    mode="update"
                    className="mt-2.5"
                    activityId={activity.id}
                    defaults={{
                      title: activity.title,
                      startAt: toDateTimeLocal(activity.startAt),
                      location: activity.location,
                      capacity: String(activity.capacity),
                      description: activity.description,
                    }}
                  />
                </Disclosure>
              </div>
            );
          })}
          <Pager
            basePath="/admin/activities"
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            query={status === "OPEN" ? {} : { status }}
            className="card"
          />
        </div>
      ) : (
        <div className="card">
          <EmptyState icon="calendar" title="没有匹配的活动" desc="换个筛选条件看看" />
        </div>
      )}
    </div>
  );
}
