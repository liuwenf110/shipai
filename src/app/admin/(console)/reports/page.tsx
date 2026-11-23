import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/Badge";
import { CompanyBadge } from "@/components/CompanyBadge";
import { EmptyState } from "@/components/Section";
import { QueryNotice } from "@/components/Notice";
import { Pager } from "@/components/Pager";
import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { adminHandleReportAction } from "@/lib/actions/admin";
import { pickUserIdentity } from "@/lib/identity";
import { cn, timeAgo } from "@/lib/utils";

export const metadata = { title: "举报治理" };

const PAGE_SIZE = 20;

const TABS = [
  { key: "PENDING", label: "待处理" },
  { key: "RESOLVED", label: "已处置" },
  { key: "IGNORED", label: "已忽略" },
  { key: "ALL", label: "全部" },
];

const TARGET_LABELS: Record<string, string> = {
  POST: "动态",
  COMMENT: "评论",
  USER: "用户",
};

const REASON_LABELS: Record<string, string> = {
  SPAM: "垃圾广告",
  ABUSE: "人身攻击",
  PORN: "色情低俗",
  FRAUD: "虚假信息",
  OTHER: "其他违规",
};

const STATUS_META: Record<string, { label: string; tone: "warn" | "ok" | "mute" }> = {
  PENDING: { label: "待处理", tone: "warn" },
  RESOLVED: { label: "已处置", tone: "ok" },
  IGNORED: { label: "已忽略", tone: "mute" },
};

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; ok?: string; error?: string }>;
}) {
  const query = await searchParams;
  const status = TABS.some((item) => item.key === query.status) ? query.status! : "PENDING";

  const where = status === "ALL" ? {} : { status };
  const total = await prisma.report.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(Number(query.page) || 1, 1), totalPages);

  const reports = await prisma.report.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      reporter: { select: { nickname: true } },
      handledBy: { select: { nickname: true } },
    },
  });

  const postIds = reports.filter((item) => item.targetType === "POST").map((item) => item.targetId);
  const commentIds = reports
    .filter((item) => item.targetType === "COMMENT")
    .map((item) => item.targetId);
  const userIds = reports.filter((item) => item.targetType === "USER").map((item) => item.targetId);

  const [posts, comments, users] = await Promise.all([
    postIds.length
      ? prisma.post.findMany({
          where: { id: { in: postIds } },
          select: {
            id: true,
            status: true,
            faction: { select: { companyId: true } },
            author: {
              select: {
                nickname: true,
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
          },
        })
      : Promise.resolve([]),
    commentIds.length
      ? prisma.comment.findMany({
          where: { id: { in: commentIds } },
          select: {
            id: true,
            status: true,
            postId: true,
            post: { select: { faction: { select: { companyId: true } } } },
            author: {
              select: {
                nickname: true,
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
          },
        })
      : Promise.resolve([]),
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, nickname: true, status: true },
        })
      : Promise.resolve([]),
  ]);

  const postMap = new Map(posts.map((item) => [item.id, item]));
  const commentMap = new Map(comments.map((item) => [item.id, item]));
  const userMap = new Map(users.map((item) => [item.id, item]));

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-bold tracking-[0.22em] text-brand">REPORTS</p>
        <h1 className="mt-1 text-[22px] font-black tracking-tight">举报治理</h1>
        <p className="mt-1 text-[12px] text-ink-mute">
          处置会移除对应内容并通知举报者与作者；忽略会记录核查结论
        </p>
      </div>

      <QueryNotice ok={query.ok} error={query.error} />

      <div className="flex items-center gap-1.5">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={item.key === "PENDING" ? "/admin/reports" : `/admin/reports?status=${item.key}`}
            className={cn("tab-pill", status === item.key && "tab-pill-active")}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {reports.length ? (
        <div className="card divide-y divide-ink-line/60">
          {reports.map((report) => {
            const meta = STATUS_META[report.status] ?? STATUS_META.PENDING;
            const post = report.targetType === "POST" ? postMap.get(report.targetId) : undefined;
            const comment =
              report.targetType === "COMMENT" ? commentMap.get(report.targetId) : undefined;
            const targetUser =
              report.targetType === "USER" ? userMap.get(report.targetId) : undefined;

            const detail = report.detail ?? "";
            const [reasonText, excerptText] = detail.includes("原文：")
              ? detail.split("原文：")
              : ["", detail];

            return (
              <div key={report.id} className="p-3.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="violet">{TARGET_LABELS[report.targetType] ?? report.targetType}</Badge>
                  <span className="text-[12.5px] font-bold text-ink">
                    {REASON_LABELS[report.reason] ?? report.reason}
                  </span>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <span className="text-[10px] text-ink-mute">
                    {report.reporter.nickname} 举报 · {timeAgo(report.createdAt)}
                  </span>
                </div>

                <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap rounded-lg bg-cream px-2.5 py-2 text-[11.5px] leading-relaxed text-ink-soft">
                  {excerptText.trim() || "（原内容已不存在）"}
                </p>
                {reasonText.trim() ? (
                  <p className="mt-1 text-[11px] text-ink-mute">举报说明：{reasonText.trim()}</p>
                ) : null}

                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-mute">
                  {post ? (
                    <>
                      <span>作者 {post.author.nickname}</span>
                      <CompanyBadge
                        identity={pickUserIdentity(post.author.employments, post.faction.companyId)}
                        showKind={false}
                        showUnverified
                      />
                      <span>·</span>
                      <span>{post.status === "DELETED" ? "动态已删除" : "动态在线"}</span>
                      <Link href={`/posts/${report.targetId}`} className="font-semibold text-brand">
                        查看原文 →
                      </Link>
                    </>
                  ) : null}
                  {comment ? (
                    <>
                      <span>作者 {comment.author.nickname}</span>
                      <CompanyBadge
                        identity={pickUserIdentity(
                          comment.author.employments,
                          comment.post.faction.companyId,
                        )}
                        showKind={false}
                        showUnverified
                      />
                      <span>·</span>
                      <span>{comment.status === "HIDDEN" ? "评论已隐藏" : "评论在线"}</span>
                      <Link href={`/posts/${comment.postId}`} className="font-semibold text-brand">
                        查看所属帖子 →
                      </Link>
                    </>
                  ) : null}
                  {targetUser ? (
                    <>
                      <span>用户 {targetUser.nickname}</span>
                      <span>·</span>
                      <Link
                        href={`/admin/users/${targetUser.id}`}
                        className="font-semibold text-brand"
                      >
                        查看用户 →
                      </Link>
                    </>
                  ) : null}
                  {report.handledAt ? (
                    <span className="ml-auto">
                      {report.handledBy?.nickname ?? "运营"} 于 {timeAgo(report.handledAt)}处理
                      {report.handledNote ? `：${report.handledNote}` : ""}
                    </span>
                  ) : null}
                </div>

                {report.status === "PENDING" ? (
                  <div className="mt-2.5 flex flex-wrap items-end gap-2">
                    <AdminActionForm
                      className="flex-1"
                      action={adminHandleReportAction}
                      hidden={{ reportId: report.id, action: "remove" }}
                      field={{
                        name: "note",
                        placeholder: "处置说明（选填，会同步给作者与举报人）",
                        maxLength: 100,
                      }}
                      buttons={[
                        {
                          label: "核实并移除内容",
                          className: "btn-primary btn-sm",
                          confirmText: "确定移除该内容并通知相关用户？",
                        },
                      ]}
                    />
                    <AdminActionForm
                      action={adminHandleReportAction}
                      hidden={{ reportId: report.id, action: "ignore" }}
                      buttons={[
                        { label: "忽略举报", className: "btn-quiet btn-sm", pendingText: "…" },
                      ]}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
          <Pager
            basePath="/admin/reports"
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            query={{ status: status === "PENDING" ? undefined : status }}
          />
        </div>
      ) : (
        <div className="card">
          <EmptyState icon="flag" title="没有匹配的举报" desc="社区目前很干净，继续加油" />
        </div>
      )}

      <p className="text-[11px] text-ink-mute">
        提示：用户在动态详情、评论区和用户主页都可以发起举报，处理结果会站内通知举报人。
      </p>
    </div>
  );
}
