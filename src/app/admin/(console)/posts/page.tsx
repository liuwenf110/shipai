import Link from "next/link";
import { prisma } from "@/lib/db";
import { ADMIN_USER } from "@/lib/api";
import { Badge } from "@/components/Badge";
import { CompanyBadge } from "@/components/CompanyBadge";
import { EmptyState } from "@/components/Section";
import { Pager } from "@/components/Pager";
import { QueryNotice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { adminModeratePostAction } from "@/lib/actions/admin";
import { pickUserIdentity } from "@/lib/identity";
import { cn, timeAgo } from "@/lib/utils";
import { richTextToPlainText } from "@/lib/rich-text";

const TABS = [
  { key: "PUBLISHED", label: "正常展示" },
  { key: "HIDDEN", label: "已隐藏" },
  { key: "ALL", label: "全部" },
];

const PAGE_SIZE = 30;

export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; ok?: string; error?: string }>;
}) {
  const query = await searchParams;
  const status = TABS.some((item) => item.key === query.status) ? query.status! : "PUBLISHED";

  const where =
    status === "ALL"
      ? { status: { not: "DELETED" } }
      : { status };

  const total = await prisma.post.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(Number(query.page) || 1, 1), totalPages);

  const posts = await prisma.post.findMany({
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
      faction: { include: { company: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-bold tracking-[0.22em] text-brand">CONTENT</p>
        <h1 className="mt-1 text-[22px] font-black tracking-tight">内容治理</h1>
        <p className="mt-1 text-[12px] text-ink-mute">
          平台侧可隐藏或删除违规内容；日常治理仍以派主为主
        </p>
      </div>

      <QueryNotice ok={query.ok} error={query.error} />

      <div className="flex items-center gap-1.5">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/posts?status=${item.key}`}
            className={cn("tab-pill", status === item.key && "tab-pill-active")}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {posts.length ? (
        <div className="space-y-2.5">
          {posts.map((post) => (
            <div key={post.id} className="card p-3.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] font-bold text-ink">{post.author.nickname}</span>
                <CompanyBadge
                  identity={pickUserIdentity(post.author.employments, post.faction.companyId)}
                  showKind={false}
                  showUnverified
                />
                <span className="text-[10.5px] text-ink-mute">发布于</span>
                <Link
                  href={`/factions/${post.faction.slug}`}
                  className="text-[10.5px] font-semibold text-ink-soft hover:text-brand"
                >
                  {post.faction.name}
                </Link>
                <Badge tone="mute">派 · {post.faction.company.shortName}</Badge>
                {post.status === "HIDDEN" ? <Badge tone="bad">已隐藏</Badge> : null}
                {post.pinned ? <Badge tone="brand">置顶</Badge> : null}
                {post.recruit ? <Badge tone="brand">公开招募</Badge> : null}
                <span className="text-[10px] text-ink-mute">{timeAgo(post.createdAt)}</span>
              </div>
              <Link href={`/posts/${post.id}`} className="mt-1.5 block">
                {post.title ? (
                  <p className="text-[12.5px] font-semibold text-ink">{post.title}</p>
                ) : null}
                <p className="line-clamp-2 text-[12px] leading-relaxed text-ink-soft">
                  {richTextToPlainText(post.content)}
                </p>
              </Link>
              <div className="mt-2 flex items-center gap-1.5">
                {post.status === "PUBLISHED" ? (
                  <form action={adminModeratePostAction}>
                    <input type="hidden" name="postId" value={post.id} />
                    <input type="hidden" name="action" value="hide" />
                    <SubmitButton className="btn-quiet btn-sm" pendingText="…">
                      隐藏
                    </SubmitButton>
                  </form>
                ) : (
                  <form action={adminModeratePostAction}>
                    <input type="hidden" name="postId" value={post.id} />
                    <input type="hidden" name="action" value="restore" />
                    <SubmitButton className="btn-ghost btn-sm" pendingText="…">
                      恢复展示
                    </SubmitButton>
                  </form>
                )}
                <form action={adminModeratePostAction}>
                  <input type="hidden" name="postId" value={post.id} />
                  <input type="hidden" name="action" value="delete" />
                  <SubmitButton
                    className="text-[11px] font-semibold text-ink-mute hover:text-[#B42318]"
                    pendingText="…"
                  >
                    删除
                  </SubmitButton>
                </form>
                {/* 首页公开招募同步开关：运营可直接把帖推入/移出首页招募流 */}
                <form action={adminModeratePostAction}>
                  <input type="hidden" name="postId" value={post.id} />
                  <input type="hidden" name="action" value={post.recruit ? "recruit_off" : "recruit_on"} />
                  <SubmitButton className="btn-quiet btn-sm" pendingText="…">
                    {post.recruit ? "移出招募" : "首页招募"}
                  </SubmitButton>
                </form>
                <Link href={`/posts/${post.id}`} className="ml-auto text-[11px] font-semibold text-ink-mute">
                  查看 →
                </Link>
              </div>
            </div>
          ))}
          <Pager
            basePath="/admin/posts"
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            query={{ status }}
            className="card"
          />
        </div>
      ) : (
        <div className="card">
          <EmptyState icon="message" title="没有匹配的内容" desc="换个筛选条件看看" />
        </div>
      )}
    </div>
  );
}
