import Link from "next/link";
import { prisma } from "@/lib/db";
import { ADMIN_USER } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { CompanyBadge } from "@/components/CompanyBadge";
import { EmptyState } from "@/components/Section";
import { Pager } from "@/components/Pager";
import { QueryNotice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { adminModerateCommentAction } from "@/lib/actions/admin";
import { pickUserIdentity } from "@/lib/identity";
import { cn, timeAgo } from "@/lib/utils";

const TABS = [
  { key: "PUBLISHED", label: "正常展示" },
  { key: "HIDDEN", label: "已隐藏" },
  { key: "ALL", label: "全部" },
];

const PAGE_SIZE = 30;

export const metadata = { title: "评论治理" };

export default async function AdminCommentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; ok?: string; error?: string }>;
}) {
  const query = await searchParams;
  const status = TABS.some((item) => item.key === query.status) ? query.status! : "PUBLISHED";
  const redirectTo = `/admin/comments?status=${status}`;

  const where = status === "ALL" ? {} : { status };
  const total = await prisma.comment.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(Number(query.page) || 1, 1), totalPages);

  const comments = await prisma.comment.findMany({
    where,
    include: {
      author: {
        select: {
          ...ADMIN_USER,
          employments: {
            where: { status: "VERIFIED" },
            select: { companyId: true, kind: true, company: { select: { shortName: true } } },
          },
        },
      },
      post: { include: { faction: { include: { company: true } } } },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-bold tracking-[0.22em] text-brand">COMMENTS</p>
        <h1 className="mt-1 text-[22px] font-black tracking-tight">评论治理</h1>
        <p className="mt-1 text-[12px] text-ink-mute">
          评论隐藏或删除后会同步更新帖子的评论数与前台展示
        </p>
      </div>

      <QueryNotice ok={query.ok} error={query.error} />

      <div className="flex items-center gap-1.5">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/comments?status=${item.key}`}
            className={cn("tab-pill", status === item.key && "tab-pill-active")}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {comments.length ? (
        <div className="space-y-2.5">
          {comments.map((comment) => {
            return (
              <div key={comment.id} className="card p-3.5">
                <div className="flex items-start gap-2.5">
                  <Avatar name={comment.author.nickname} color={comment.author.avatarColor} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[12px] font-bold text-ink">{comment.author.nickname}</span>
                      <CompanyBadge
                        identity={pickUserIdentity(
                          comment.author.employments,
                          comment.post.faction.companyId,
                        )}
                        showKind={false}
                        showUnverified
                      />
                      <Badge tone="mute">派 · {comment.post.faction.company.shortName}</Badge>
                      {comment.status === "HIDDEN" ? <Badge tone="bad">已隐藏</Badge> : null}
                      <span className="text-[10px] text-ink-mute">{timeAgo(comment.createdAt)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-soft">
                      {comment.content}
                    </p>
                    <Link
                      href={`/posts/${comment.postId}`}
                      className="mt-1 inline-block text-[10.5px] font-medium text-ink-mute hover:text-brand"
                    >
                      来自「{comment.post.faction.name}」的帖子 · {comment.post.title ?? comment.post.content.slice(0, 18)}
                    </Link>
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  <form action={adminModerateCommentAction}>
                    <input type="hidden" name="commentId" value={comment.id} />
                    <input type="hidden" name="redirectTo" value={redirectTo} />
                    <input type="hidden" name="action" value={comment.status === "PUBLISHED" ? "hide" : "restore"} />
                    <SubmitButton
                      className={comment.status === "PUBLISHED" ? "btn-quiet btn-sm" : "btn-ghost btn-sm"}
                      pendingText="…"
                    >
                      {comment.status === "PUBLISHED" ? "隐藏" : "恢复展示"}
                    </SubmitButton>
                  </form>
                  <form action={adminModerateCommentAction}>
                    <input type="hidden" name="commentId" value={comment.id} />
                    <input type="hidden" name="redirectTo" value={redirectTo} />
                    <input type="hidden" name="action" value="delete" />
                    <SubmitButton
                      className="text-[11px] font-semibold text-ink-mute hover:text-[#B42318]"
                      pendingText="…"
                    >
                      删除
                    </SubmitButton>
                  </form>
                </div>
              </div>
            );
          })}
          <Pager
            basePath="/admin/comments"
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            query={{ status }}
            className="card"
          />
        </div>
      ) : (
        <div className="card">
          <EmptyState icon="message" title="没有匹配的评论" desc="换个筛选条件看看" />
        </div>
      )}
    </div>
  );
}
