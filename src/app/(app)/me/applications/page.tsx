import type { Metadata } from "next/types";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge } from "@/components/Badge";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/Section";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return { title: "我的申请 · 派Space" };
}

// 三类申请记录的审核状态口径：PENDING 系文案在 me 页沿用「审核中/待审批」，这里统一按申请侧表达
const LEADER_STATUS: Record<string, { label: string; tone: "ok" | "bad" | "warn" }> = {
  PENDING: { label: "审核中", tone: "warn" },
  APPROVED: { label: "已通过", tone: "ok" },
  REJECTED: { label: "未通过", tone: "bad" },
};

// 入派申请直接映射成员现状：批准后退出/被移出也是申请的结果状态
const JOIN_STATUS: Record<string, { label: string; tone: "ok" | "bad" | "warn" | "mute" }> = {
  PENDING: { label: "审核中", tone: "warn" },
  ACTIVE: { label: "已通过", tone: "ok" },
  LEFT: { label: "已退出", tone: "mute" },
  REMOVED: { label: "已移出", tone: "bad" },
};

const VIEW_STATUS = LEADER_STATUS;

type ApplicationRow = {
  id: string;
  factionName: string;
  factionSlug: string;
  typeLabel: string;
  at: Date;
  reviewedAt: Date | null;
  reviewerNote: string | null;
  status: { label: string; tone: "ok" | "bad" | "warn" | "mute" };
};

export default async function MyApplicationsPage() {
  const me = await requireUser();

  const [leaderApps, joinApps, viewRequests] = await Promise.all([
    prisma.leaderApplication.findMany({
      where: { userId: me.id },
      include: { faction: true },
      orderBy: { createdAt: "desc" },
    }),
    // 只有真的提交过申请的行才算申请记录：直接加入/被拉入的成员 appliedAt 为 null
    prisma.factionMember.findMany({
      where: { userId: me.id, appliedAt: { not: null } },
      include: { faction: true },
      orderBy: { appliedAt: "desc" },
    }),
    prisma.memberViewRequest.findMany({
      where: { userId: me.id },
      include: { faction: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const rows: ApplicationRow[] = [
    ...leaderApps.map((item) => ({
      id: `l-${item.id}`,
      factionName: item.faction.name,
      factionSlug: item.faction.slug,
      typeLabel: item.requestedRole === "LEADER" ? "派主认证申请" : "副派主申请",
      at: item.createdAt,
      reviewedAt: item.reviewedAt,
      reviewerNote: item.reviewerNote,
      status: LEADER_STATUS[item.status] ?? { label: item.status, tone: "mute" as const },
    })),
    ...joinApps.map((item) => ({
      id: `j-${item.id}`,
      factionName: item.faction.name,
      factionSlug: item.faction.slug,
      typeLabel: "加入派申请",
      at: item.appliedAt ?? item.joinedAt,
      // 审批通过只改 status，joinedAt 仍是建行时刻，不能当审核时间用
      reviewedAt: null,
      reviewerNote: null,
      status: JOIN_STATUS[item.status] ?? { label: item.status, tone: "mute" as const },
    })),
    ...viewRequests.map((item) => ({
      id: `v-${item.id}`,
      factionName: item.faction.name,
      factionSlug: item.faction.slug,
      typeLabel: "成员列表查看申请",
      at: item.createdAt,
      reviewedAt: item.reviewedAt,
      reviewerNote: null,
      status: VIEW_STATUS[item.status] ?? { label: item.status, tone: "mute" as const },
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="mx-auto w-full max-w-screen-md px-4 py-5 md:px-6">
      {/* 返回导航：回「我的」页 */}
      <div className="flex items-center gap-2">
        <Link
          href="/me"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-ink-mute transition-colors hover:bg-black/5 hover:text-ink"
          prefetch={false}
        >
          <Icon name="back" size={14} />
          返回
        </Link>
        <span className="text-sm font-semibold text-ink-mute">我的申请</span>
      </div>
      <p className="mt-1 text-[11px] text-ink-mute">
        派主认证、加入派与成员列表查看全部申请记录及审核状态，按提交时间倒序
      </p>

      {rows.length ? (
        <div className="card mt-4 divide-y divide-ink-line/60">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-2.5 px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-bold text-ink">
                  <Link href={`/factions/${row.factionSlug}`} className="hover:text-brand">
                    {row.factionName}
                  </Link>
                  <span className="ml-1 text-[10.5px] font-normal text-ink-mute">{row.typeLabel}</span>
                </p>
                <p className="mt-0.5 line-clamp-1 text-[10.5px] text-ink-mute">
                  提交于 {formatDateTime(row.at)}
                  {row.reviewedAt ? ` · 审核于 ${formatDateTime(row.reviewedAt)}` : ""}
                  {row.reviewerNote ? ` · 审核意见：${row.reviewerNote}` : ""}
                </p>
              </div>
              <Badge tone={row.status.tone}>{row.status.label}</Badge>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 card">
          <EmptyState
            icon="bell"
            title="还没有申请记录"
            desc="申请派主/副派主、提交加入派申请后，都会在这里留下记录"
            actionLabel="浏览兴趣派"
            actionHref="/discover"
          />
        </div>
      )}
    </div>
  );
}
