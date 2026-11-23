import Link from "next/link";
import { prisma } from "@/lib/db";
import { ADMIN_USER, PUBLIC_USER } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/Section";
import { QueryNotice } from "@/components/Notice";
import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { reviewLeaderAction } from "@/lib/actions/admin";
import { withBasePath } from "@/lib/base-path";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

const TABS = [
  { key: "PENDING", label: "待审核" },
  { key: "APPROVED", label: "已通过" },
  { key: "REJECTED", label: "已驳回" },
];

export default async function AdminLeadersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; company?: string; ok?: string; error?: string }>;
}) {
  const query = await searchParams;
  const status = TABS.some((item) => item.key === query.status) ? query.status! : "PENDING";
  const companyId = query.company ?? "";

  const [applications, counts, companies] = await Promise.all([
    prisma.leaderApplication.findMany({
      where: { status, ...(companyId ? { faction: { companyId } } : {}) },
      include: {
        user: { select: ADMIN_USER },
        faction: { include: { company: true, leader: { select: PUBLIC_USER } } },
        reviewer: { select: ADMIN_USER },
      },
      orderBy: { createdAt: "asc" },
      take: 40,
    }),
    prisma.leaderApplication.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.company.findMany({ orderBy: { verifiedCount: "desc" }, select: { id: true, shortName: true } }),
  ]);

  const countMap = new Map(counts.map((item) => [item.status, item._count._all]));

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-bold tracking-[0.22em] text-brand">LEADER REVIEW</p>
        <h1 className="mt-1 text-[22px] font-black tracking-tight">派主认证</h1>
        <p className="mt-1 text-[12px] text-ink-mute">
          通过后自动授予派主 / 副派主权限，并可进入派主管理台
        </p>
      </div>

      <QueryNotice ok={query.ok} error={query.error} />

      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/leaders?status=${item.key}${companyId ? `&company=${companyId}` : ""}`}
            className={cn("tab-pill", status === item.key && "tab-pill-active")}
          >
            {item.label}
            <span className="ml-1 text-[10px] opacity-70">{countMap.get(item.key) ?? 0}</span>
          </Link>
        ))}
        <form action={withBasePath("/admin/leaders")} className="ml-auto flex items-center gap-1.5">
          <input type="hidden" name="status" value={status} />
          <select name="company" defaultValue={companyId} className="input py-1.5 text-[11.5px]">
            <option value="">全部公司</option>
            {companies.map((item) => (
              <option key={item.id} value={item.id}>
                {item.shortName}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-quiet btn-sm">
            筛选
          </button>
        </form>
      </div>

      {applications.length ? (
        <div className="space-y-2.5">
          {applications.map((application) => (
            <div key={application.id} className="card p-4">
              <div className="flex flex-wrap items-start gap-2.5">
                <Avatar
                  name={application.user.nickname}
                  color={application.user.avatarColor}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-[13px] font-bold text-ink">{application.user.nickname}</p>
                    <Badge tone={application.requestedRole === "LEADER" ? "brand" : "violet"}>
                      {application.requestedRole === "LEADER" ? "申请派主" : "申请副派主"}
                    </Badge>
                    {application.faction.status === "REVIEWING" ? (
                      <Badge tone="warn">新派筹备中</Badge>
                    ) : null}
                    {application.faction.leaderId ? (
                      <Badge tone="mute">该派已有派主</Badge>
                    ) : (
                      <Badge tone="warn">招募派主中</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[11.5px] text-ink-soft">
                    {application.faction.name} · {application.faction.company.shortName} ·{" "}
                    {application.faction.memberCount} 位成员
                  </p>
                  <p className="text-[10.5px] text-ink-mute">
                    {application.user.email ?? application.user.phone ?? "未绑定账号"} · 提交于{" "}
                    {timeAgo(application.createdAt)}
                  </p>
                </div>
                <Link
                  href={`/factions/${application.faction.slug}`}
                  className="text-[11px] font-semibold text-ink-mute hover:text-brand"
                >
                  查看派 →
                </Link>
              </div>

              <div className="mt-2.5 grid gap-2 md:grid-cols-2">
                <div className="rounded-xl bg-cream px-3 py-2">
                  <p className="text-[10px] font-bold text-ink-mute">申请理由</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-[11.5px] leading-relaxed text-ink-soft">
                    {application.reason}
                  </p>
                </div>
                <div className="rounded-xl bg-cream px-3 py-2">
                  <p className="text-[10px] font-bold text-ink-mute">运营计划</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-[11.5px] leading-relaxed text-ink-soft">
                    {application.plan}
                  </p>
                </div>
              </div>
              {application.experience ? (
                <p className="mt-2 text-[11px] text-ink-mute">
                  过往经验：{application.experience}
                </p>
              ) : null}

              {application.proofImage ? (
                <a
                  href={withBasePath(application.proofImage)}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative mt-2 block w-32 overflow-hidden rounded-xl ring-1 ring-ink-line"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={withBasePath(application.proofImage)}
                    alt="过往带队截图"
                    className="h-24 w-32 object-cover"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-0.5 text-center text-[9px] font-bold text-white">
                    过往带队截图
                  </span>
                </a>
              ) : null}

              {application.status === "PENDING" ? (
                <AdminActionForm
                  className="mt-3"
                  action={reviewLeaderAction}
                  hidden={{ applicationId: application.id }}
                  field={{ name: "note", placeholder: "审核备注（驳回时请写明原因）" }}
                  buttons={[
                    {
                      value: "approve",
                      label: "通过并授予权限",
                      className: "btn-primary btn-sm",
                      pendingText: "处理中…",
                    },
                    {
                      value: "reject",
                      label: "驳回",
                      className: "btn-quiet btn-sm",
                      pendingText: "处理中…",
                    },
                  ]}
                  hint="通过后派状态自动转为「运营中」"
                />
              ) : (
                <p className="mt-2 rounded-xl bg-cream px-3 py-2 text-[11px] text-ink-soft">
                  {application.reviewer?.nickname ?? "运营"} ·{" "}
                  {application.reviewedAt ? formatDateTime(application.reviewedAt) : ""}
                  {application.reviewerNote ? `：${application.reviewerNote}` : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon="flag"
            title={status === "PENDING" ? "没有待审核的派主认证" : "这里还没有记录"}
            desc="用户申请派主认证或新建派后，会在这里等待审核"
          />
        </div>
      )}
    </div>
  );
}
