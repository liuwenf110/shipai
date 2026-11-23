import Link from "next/link";
import { prisma } from "@/lib/db";
import { ADMIN_USER } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/Section";
import { QueryNotice } from "@/components/Notice";
import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { reviewInviteCodeAction } from "@/lib/actions/invite";
import { inviteStateOf } from "@/lib/invite";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

const TABS = [
  { key: "PENDING", label: "待审核" },
  { key: "APPROVED", label: "已发放" },
  { key: "REJECTED", label: "已驳回" },
];

export default async function AdminInvitesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; ok?: string; error?: string }>;
}) {
  const query = await searchParams;
  const status = TABS.some((item) => item.key === query.status) ? query.status! : "PENDING";

  const [invites, counts] = await Promise.all([
    prisma.inviteCode.findMany({
      where: { status },
      include: {
        faction: { include: { company: true } },
        leader: { select: ADMIN_USER },
        reviewer: { select: ADMIN_USER },
        usedBy: { select: { nickname: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 40,
    }),
    prisma.inviteCode.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const countMap = new Map(counts.map((item) => [item.status, item._count._all]));

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-bold tracking-[0.22em] text-brand">INVITE CODES</p>
        <h1 className="mt-1 text-[22px] font-black tracking-tight">注册邀请码</h1>
        <p className="mt-1 text-[12px] text-ink-mute">
          派主申请通过后自动生成一次性邀请码，30 天内有效；新朋友持码注册即自动入派
        </p>
      </div>

      <QueryNotice ok={query.ok} error={query.error} />

      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/invites?status=${item.key}`}
            className={cn("tab-pill", status === item.key && "tab-pill-active")}
          >
            {item.label}
            <span className="ml-1 text-[10px] opacity-70">{countMap.get(item.key) ?? 0}</span>
          </Link>
        ))}
      </div>

      {invites.length ? (
        <div className="space-y-2.5">
          {invites.map((invite) => {
            const state = inviteStateOf(invite);
            return (
              <div key={invite.id} className="card p-4">
                <div className="flex flex-wrap items-start gap-2.5">
                  <Avatar
                    name={invite.leader.nickname}
                    color={invite.leader.avatarColor}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-[13px] font-bold text-ink">
                        {invite.faction.name} · {invite.faction.company.shortName}
                      </p>
                      {state === "PENDING" ? <Badge tone="warn">待审核</Badge> : null}
                      {state === "READY" ? <Badge tone="ok">可使用</Badge> : null}
                      {state === "USED" ? <Badge tone="mute">已使用</Badge> : null}
                      {state === "EXPIRED" ? <Badge tone="mute">已过期</Badge> : null}
                      {state === "REJECTED" ? <Badge tone="bad">已驳回</Badge> : null}
                    </div>
                    <p className="mt-1 text-[11px] text-ink-soft">
                      申请人：{invite.leader.nickname} · {timeAgo(invite.createdAt)}提交
                    </p>
                  </div>
                  <Link
                    href={`/factions/${invite.faction.slug}`}
                    className="text-[11px] font-semibold text-ink-mute hover:text-brand"
                  >
                    查看派 →
                  </Link>
                </div>

                <div className="mt-2.5 rounded-xl bg-cream px-3 py-2">
                  <p className="text-[10px] font-bold text-ink-mute">申请说明</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-[11.5px] leading-relaxed text-ink-soft">
                    {invite.note}
                  </p>
                </div>

                {state === "READY" && invite.code ? (
                  <div className="mt-2 rounded-xl border border-dashed border-brand/40 bg-brand-soft/60 px-3 py-2">
                    <p className="font-mono text-[15px] font-black tracking-[0.2em] text-ink">
                      {invite.code}
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-ink-mute">
                      {invite.expiresAt ? `${formatDateTime(invite.expiresAt)} 过期` : "无过期时间"} ·
                      注册链接 /register?invite={invite.code}
                    </p>
                  </div>
                ) : null}

                {state === "USED" ? (
                  <p className="mt-2 rounded-xl bg-cream px-3 py-2 text-[11px] text-ink-soft">
                    已被 {invite.usedBy?.nickname ?? "新成员"} 使用
                    {invite.usedAt ? ` · ${formatDateTime(invite.usedAt)}` : ""}
                    {invite.code ? ` · 邀请码 ${invite.code}` : ""}
                  </p>
                ) : null}

                {state === "PENDING" ? (
                  <AdminActionForm
                    className="mt-3"
                    action={reviewInviteCodeAction}
                    hidden={{ inviteId: invite.id }}
                    field={{ name: "note", placeholder: "审核备注（驳回时请写明原因）" }}
                    buttons={[
                      {
                        value: "approve",
                        label: "通过并生成邀请码",
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
                    hint="生成后 30 天内有效，一码一人"
                  />
                ) : (
                  <p className="mt-2 text-[10.5px] text-ink-mute">
                    {invite.reviewer?.nickname ?? "运营"} ·{" "}
                    {invite.reviewedAt ? formatDateTime(invite.reviewedAt) : ""}
                    {invite.reviewerNote ? `：${invite.reviewerNote}` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={status === "PENDING" ? "没有待审核的邀请码申请" : "这里还没有记录"}
          desc={
            status === "PENDING"
              ? "派主在派主管理台「设置」页提交申请后会出现在这里"
              : "切换到其他状态看看历史记录"
          }
        />
      )}
    </div>
  );
}
