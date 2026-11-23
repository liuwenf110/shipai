import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/Section";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

const ACTION_LABEL: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "brand" | "violet" | "ocean" | "mute" }> = {
  APPROVE_EMPLOYMENT: { label: "通过身份认证", tone: "ok" },
  REJECT_EMPLOYMENT: { label: "驳回身份认证", tone: "bad" },
  APPROVE_LEADER: { label: "通过派主认证", tone: "ok" },
  REJECT_LEADER: { label: "驳回派主认证", tone: "bad" },
  SET_FACTION_STATUS: { label: "调整派状态", tone: "brand" },
  UPDATE_FACTION: { label: "编辑派资料", tone: "brand" },
  ASSIGN_FACTION_LEADER: { label: "调整派主", tone: "brand" },
  UPDATE_FACTION_COMPANY: { label: "调整所属公司", tone: "violet" },
  APPROVE_JOIN_REQUEST: { label: "通过加入申请", tone: "ok" },
  REJECT_JOIN_REQUEST: { label: "拒绝加入申请", tone: "bad" },
  MODERATE_POST_HIDE: { label: "隐藏内容", tone: "warn" },
  MODERATE_POST_RESTORE: { label: "恢复内容", tone: "ok" },
  MODERATE_POST_DELETE: { label: "删除内容", tone: "bad" },
  MODERATE_COMMENT_HIDE: { label: "隐藏评论", tone: "warn" },
  MODERATE_COMMENT_RESTORE: { label: "恢复评论", tone: "ok" },
  MODERATE_COMMENT_DELETE: { label: "删除评论", tone: "bad" },
  CREATE_ACTIVITY: { label: "发起活动", tone: "brand" },
  UPDATE_ACTIVITY: { label: "编辑活动", tone: "brand" },
  ACTIVITY_CLOSE: { label: "关闭活动报名", tone: "warn" },
  ACTIVITY_REOPEN: { label: "恢复活动报名", tone: "ok" },
  ACTIVITY_DELETE: { label: "删除活动", tone: "bad" },
  DISABLE_USER: { label: "禁用账号", tone: "bad" },
  ENABLE_USER: { label: "恢复账号", tone: "ok" },
  PROMOTE_USER: { label: "设为运营", tone: "violet" },
  DEMOTE_USER: { label: "取消运营", tone: "mute" },
  KICK_SESSIONS: { label: "强制下线", tone: "warn" },
  RESET_PASSWORD: { label: "重置登录密码", tone: "warn" },
  APPROVE_INVITE: { label: "通过派主邀请码", tone: "ok" },
  REJECT_INVITE: { label: "驳回派主邀请码", tone: "bad" },
  REPORT_REMOVE: { label: "举报成立并移除内容", tone: "bad" },
  REPORT_IGNORE: { label: "忽略举报", tone: "mute" },
};

const TARGET_HREF: Record<string, (id: string) => string> = {
  User: (id) => `/admin/users/${id}`,
  Faction: (id) => `/admin/factions/${id}`,
  Post: (id) => `/posts/${id}`,
  Activity: () => "/admin/activities",
  Comment: () => "/admin/comments",
  Employment: () => "/admin/verifications",
  LeaderApplication: () => "/admin/leaders",
};

export const metadata = { title: "操作日志" };

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; targetType?: string }>;
}) {
  const query = await searchParams;
  const action = query.action?.trim() || "";
  const targetType = query.targetType?.trim() || "";

  const [logs, total, actionGroups] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        ...(action ? { action } : {}),
        ...(targetType ? { targetType } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
    prisma.auditLog.count(),
    prisma.auditLog.groupBy({ by: ["action"], _count: { _all: true } }),
  ]);

  const actorIds = Array.from(new Set(logs.map((log) => log.actorId).filter(Boolean))) as string[];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, nickname: true },
      })
    : [];
  const actorMap = new Map(actors.map((item) => [item.id, item.nickname]));

  const actionCount = actionGroups.reduce((sum, item) => sum + item._count._all, 0);
  const topActions = [...actionGroups].sort((a, b) => b._count._all - a._count._all).slice(0, 6);

  const baseQuery = (next: { action?: string; targetType?: string }) => {
    const params = new URLSearchParams();
    const nextAction = next.action ?? action;
    const nextTarget = next.targetType ?? targetType;
    if (nextAction) params.set("action", nextAction);
    if (nextTarget) params.set("targetType", nextTarget);
    const search = params.toString();
    return `/admin/logs${search ? `?${search}` : ""}`;
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-bold tracking-[0.22em] text-brand">AUDIT</p>
        <h1 className="mt-1 text-[22px] font-black tracking-tight">操作日志</h1>
        <p className="mt-1 text-[12px] text-ink-mute">
          累计 {total} 条留痕 · 审核、处置、编辑等所有运营动作都会记录
        </p>
      </div>

      <div className="card p-3">
        <p className="text-[10.5px] font-bold text-ink-mute">高频操作</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {topActions.length ? (
            topActions.map((item) => (
              <Link
                key={item.action}
                href={baseQuery({ action: action === item.action ? "" : item.action })}
                className={cn("tab-pill", action === item.action && "tab-pill-active")}
              >
                {ACTION_LABEL[item.action]?.label ?? item.action}
                <span className="ml-1 text-[10px] opacity-70">{item._count._all}</span>
              </Link>
            ))
          ) : (
            <span className="text-[11px] text-ink-mute">还没有操作记录</span>
          )}
        </div>
        {action || targetType ? (
          <div className="mt-2 flex items-center gap-2 text-[10.5px] text-ink-mute">
            <span>
              当前筛选：
              {action ? `${ACTION_LABEL[action]?.label ?? action} ` : ""}
              {targetType ? `对象 ${targetType}` : ""}
            </span>
            <Link href="/admin/logs" className="font-semibold text-brand">
              清除筛选
            </Link>
          </div>
        ) : null}
      </div>

      {logs.length ? (
        <div className="card divide-y divide-ink-line/60">
          {logs.map((log) => {
            const meta = ACTION_LABEL[log.action] ?? { label: log.action, tone: "mute" as const };
            const href =
              log.targetId && TARGET_HREF[log.targetType]
                ? TARGET_HREF[log.targetType](log.targetId)
                : null;
            return (
              <div key={log.id} className="flex items-start gap-2.5 px-4 py-2.5">
                <Badge tone={meta.tone}>{meta.label}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] text-ink-soft">
                    操作人 {log.actorId ? (actorMap.get(log.actorId) ?? "未知运营") : "系统"}
                    {log.note ? ` · ${log.note}` : ""}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-mute">
                    <span>{log.targetType}</span>
                    {href ? (
                      <Link href={href} className="font-semibold text-brand">
                        查看对象
                      </Link>
                    ) : null}
                    <span>· {formatDateTime(log.createdAt)}</span>
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-ink-mute">{timeAgo(log.createdAt)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <EmptyState icon="shield" title="没有匹配的操作记录" desc="换个筛选条件试试" />
        </div>
      )}

      <p className="px-1 text-[10.5px] text-ink-mute">
        共展示最近 {logs.length} 条 / 全部 {actionCount} 条可筛选记录
      </p>
    </div>
  );
}
