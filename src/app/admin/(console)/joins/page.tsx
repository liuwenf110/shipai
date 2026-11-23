import Link from "next/link";
import { prisma } from "@/lib/db";
import { ADMIN_USER } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { CompanyBadge } from "@/components/CompanyBadge";
import { Icon } from "@/components/Icon";
import { QueryNotice } from "@/components/Notice";
import { EmptyState } from "@/components/Section";
import { SubmitButton } from "@/components/SubmitButton";
import { adminReviewMemberAction, adminReviewMemberViewAction } from "@/lib/actions/admin";
import { MEMBER_STATUS } from "@/lib/constants";
import { pickUserIdentity } from "@/lib/identity";
import { cn, timeAgo } from "@/lib/utils";

export const metadata = { title: "加入申请" };

const TABS = [
  { key: "ALL", label: "全部" },
  { key: "PENDING", label: "待审批" },
  { key: "ACTIVE", label: "已加入" },
  { key: "LEFT", label: "已退出" },
  { key: "REMOVED", label: "已移出" },
];

const STATUS_TONE: Record<string, "ok" | "warn" | "mute" | "violet"> = {
  ACTIVE: "ok",
  PENDING: "warn",
  LEFT: "mute",
  REMOVED: "violet",
};

const ROLE_LABEL: Record<string, string> = { LEADER: "派主", ADMIN: "副派主", MEMBER: "成员" };

export default async function AdminJoinsPage({
  searchParams,
}: {
  searchParams: Promise<{ factionId?: string; status?: string; ok?: string; error?: string }>;
}) {
  const query = await searchParams;
  const factionId = query.factionId?.trim() ?? "";
  const status = TABS.some((item) => item.key === query.status) ? query.status! : "ALL";

  const [applications, counts, faction, viewRequests] = await Promise.all([
    prisma.factionMember.findMany({
      where: {
        ...(status === "ALL" ? {} : { status }),
        ...(factionId ? { factionId } : {}),
      },
      include: {
        user: {
          select: {
            ...ADMIN_USER,
            employments: {
              where: { status: "VERIFIED" },
              select: {
                companyId: true,
                kind: true,
                company: { select: { shortName: true } },
              },
            },
          },
        },
        faction: {
          select: {
            id: true,
            name: true,
            slug: true,
            companyId: true,
            status: true,
            leader: { select: { nickname: true } },
            company: { select: { shortName: true } },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
      take: 100,
    }),
    prisma.factionMember.groupBy({ by: ["status"], _count: { _all: true } }),
    factionId
      ? prisma.faction.findUnique({
          where: { id: factionId },
          select: { name: true, company: { select: { shortName: true } } },
        })
      : Promise.resolve(null),
    prisma.memberViewRequest.findMany({
      where: factionId ? { status: "PENDING", factionId } : { status: "PENDING" },
      include: {
        user: {
          select: {
            ...ADMIN_USER,
            employments: {
              where: { status: "VERIFIED" },
              select: {
                companyId: true,
                kind: true,
                company: { select: { shortName: true } },
              },
            },
          },
        },
        faction: {
          select: { id: true, name: true, companyId: true, leader: { select: { nickname: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
  ]);

  const countMap = new Map(counts.map((item) => [item.status, item._count._all]));
  const pendingCount = countMap.get("PENDING") ?? 0;

  const selfPath = factionId ? `/admin/joins?factionId=${factionId}` : "/admin/joins";
  const tabHref = (key: string) =>
    `/admin/joins?status=${key}${factionId ? `&factionId=${factionId}` : ""}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold tracking-[0.22em] text-brand">JOIN REQUESTS</p>
          <h1 className="mt-1 text-[22px] font-black tracking-tight">加入申请</h1>
          <p className="mt-1 text-[12px] text-ink-mute">
            这里汇总所有用户的入派记录；待审批记录可直接在本页通过 / 拒绝，有派主的派也可由派主审批
          </p>
        </div>
        <Badge tone={pendingCount ? "warn" : "mute"}>{pendingCount} 条待处理</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={tabHref(item.key)}
            className={cn("tab-pill", status === item.key && "tab-pill-active")}
          >
            {item.label}
            <span className="ml-1 text-[10px] opacity-70">
              {item.key === "ALL"
                ? TABS.slice(1).reduce((sum, tab) => sum + (countMap.get(tab.key) ?? 0), 0)
                : (countMap.get(item.key) ?? 0)}
            </span>
          </Link>
        ))}
      </div>

      {faction ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-[11px] text-ink-mute ring-1 ring-ink-line/60">
          <span>
            仅看「{faction.name}」· {faction.company.shortName}
          </span>
          <Link href="/admin/joins" className="font-semibold text-brand">
            查看全部
          </Link>
        </div>
      ) : null}

      <QueryNotice ok={query.ok} error={query.error} />

      {viewRequests.length ? (
        <section className="card">
          <div className="flex items-center justify-between border-b border-ink-line/60 px-4 py-2.5">
            <h2 className="text-[13px] font-bold text-ink">成员列表查看申请</h2>
            <span className="text-[11px] text-ink-mute">{viewRequests.length} 条待审核</span>
          </div>
          <div className="divide-y divide-ink-line/60">
            {viewRequests.map((request) => {
              const identity = pickUserIdentity(request.user.employments, request.faction.companyId);
              return (
                <div key={request.id} className="flex flex-wrap items-center gap-2.5 px-4 py-3">
                  <Avatar name={request.user.nickname} color={request.user.avatarColor} size="xs" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold text-ink">
                      <span>{request.user.nickname}</span>
                      <CompanyBadge identity={identity} showKind={false} showUnverified />
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[10.5px] text-ink-mute">
                      <span>
                        申请查看「{request.faction.name}」成员列表 ·{" "}
                        {request.faction.leader
                          ? `派主 ${request.faction.leader.nickname}（也可由派主在管理台审核）`
                          : "暂无派主（运营代批）"}{" "}
                        · {timeAgo(request.createdAt)}申请
                      </span>
                      <Link
                        href={`/admin/joins?factionId=${request.faction.id}&status=PENDING`}
                        className="inline-flex items-center gap-0.5 font-semibold text-brand"
                      >
                        只看本派
                        <Icon name="right" size={11} />
                      </Link>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <form action={adminReviewMemberViewAction}>
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="factionId" value={request.faction.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <input type="hidden" name="next" value={selfPath} />
                      <SubmitButton className="btn-primary btn-sm" pendingText="…">
                        通过
                      </SubmitButton>
                    </form>
                    <form action={adminReviewMemberViewAction}>
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="factionId" value={request.faction.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <input type="hidden" name="next" value={selfPath} />
                      <SubmitButton className="btn-quiet btn-sm" pendingText="…">
                        拒绝
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {applications.length ? (
        <div className="card divide-y divide-ink-line/60">
          {applications.map((item) => {
            const identity = pickUserIdentity(item.user.employments, item.faction.companyId);
            // 用 companyId 判同公司：短名无唯一约束，重名会漏判
            const isCross =
              item.user.employments.length > 0 &&
              !item.user.employments.some((e) => e.companyId === item.faction.companyId);
            const appliedAt = item.appliedAt ?? item.joinedAt;
            return (
              <div key={item.id} className="flex flex-wrap items-center gap-2.5 px-4 py-3">
                <Avatar name={item.user.nickname} color={item.user.avatarColor} size="xs" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold text-ink">
                    <span>{item.user.nickname}</span>
                    <CompanyBadge identity={identity} showKind={false} showUnverified />
                    {isCross ? <Badge tone="violet">跨公司</Badge> : null}
                    <Badge tone={STATUS_TONE[item.status] ?? "mute"}>
                      {MEMBER_STATUS[item.status as keyof typeof MEMBER_STATUS] ?? item.status}
                    </Badge>
                    {item.role !== "MEMBER" ? (
                      <Badge tone="brand">{ROLE_LABEL[item.role] ?? item.role}</Badge>
                    ) : null}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[10.5px] text-ink-mute">
                    <span>
                      {item.status === "PENDING"
                        ? `申请加入「${item.faction.name}」`
                        : `加入「${item.faction.name}」`}
                      {" · "}
                      {item.faction.company.shortName} ·
                      {item.faction.leader ? ` 派主 ${item.faction.leader.nickname}` : " 暂无派主（运营代批）"} ·{" "}
                      {timeAgo(appliedAt)}
                      {item.status === "PENDING" ? "申请" : "记录"}
                    </span>
                    <Link
                      href={`/admin/factions/${item.faction.id}`}
                      className="inline-flex items-center gap-0.5 font-semibold text-brand"
                    >
                      详情
                      <Icon name="right" size={11} />
                    </Link>
                  </p>
                </div>
                {item.status === "PENDING" ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <form action={adminReviewMemberAction}>
                      <input type="hidden" name="memberId" value={item.id} />
                      <input type="hidden" name="factionId" value={item.faction.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <input type="hidden" name="next" value={selfPath} />
                      <SubmitButton className="btn-primary btn-sm" pendingText="…">
                        通过
                      </SubmitButton>
                    </form>
                    <form action={adminReviewMemberAction}>
                      <input type="hidden" name="memberId" value={item.id} />
                      <input type="hidden" name="factionId" value={item.faction.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <input type="hidden" name="next" value={selfPath} />
                      <SubmitButton className="btn-quiet btn-sm" pendingText="…">
                        拒绝
                      </SubmitButton>
                    </form>
                  </div>
                ) : (
                  <span className="shrink-0 text-[10.5px] text-ink-mute">
                    {timeAgo(item.joinedAt)}加入
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon="users"
            title={status === "PENDING" ? "暂无待处理的加入申请" : "暂无符合条件的入派记录"}
            desc="用户申请加入兴趣派后会实时出现在这里"
            actionLabel="去看兴趣派"
            actionHref="/admin/factions"
          />
        </div>
      )}
    </div>
  );
}
