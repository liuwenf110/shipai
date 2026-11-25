import type { Metadata } from "next/types";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audienceOfUserOrAdmin, userScopeWhere } from "@/lib/scope";
import { PUBLIC_USER } from "@/lib/api";
import { formatChatTime } from "@/lib/utils";
import { toggleFollowAction } from "@/lib/actions/follow";
import { Icon } from "@/components/Icon";
import { QueryNotice } from "@/components/Notice";
import { UserAvatar } from "@/components/UserAvatar";
import { SubmitButton } from "@/components/SubmitButton";
import { EmptyState } from "@/components/Section";
import { Pager } from "@/components/Pager";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export function generateMetadata(): Metadata {
  return { title: "关注列表 · 派Space" };
}

const TABS = [
  { key: "followers", label: "关注者" },
  { key: "following", label: "正在关注" },
] as const;

/** 关注列表：/me/follows?tab=followers|following，两 tab 都可就地关注/取关 */
export default async function FollowsPage(props: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const me = await requireUser();
  const tab = (searchParams.tab ?? "followers").trim() || "followers";
  if (!TABS.some((t) => t.key === tab)) redirect("/me/follows");

  const page = Math.max(1, Number(searchParams.page) || 1);
  const skip = (page - 1) * PAGE_SIZE;
  // 存量跨阵营关注（隔离上线前就互相关注的人）在列表与条数里一并消失，口径与关注/主页拦截一致
  const scope = userScopeWhere(await audienceOfUserOrAdmin(me));
  const where =
    tab === "followers"
      ? { followingId: me.id, ...(scope ? { follower: { is: scope } } : {}) }
      : { followerId: me.id, ...(scope ? { following: { is: scope } } : {}) };

  // tab 决定看哪一侧的关系：followers=谁关注了我，following=我关注了谁
  // 各分支内先归一成 { user, at }，避免联合类型跨分支取 include 字段
  const rows =
    tab === "followers"
      ? (
          await prisma.follow.findMany({
            where,
            include: { follower: { select: PUBLIC_USER } },
            orderBy: { createdAt: "desc" },
            skip,
            take: PAGE_SIZE,
          })
      ).map((row) => ({ user: row.follower, at: row.createdAt }))
      : (
          await prisma.follow.findMany({
            where,
            include: { following: { select: PUBLIC_USER } },
            orderBy: { createdAt: "desc" },
            skip,
            take: PAGE_SIZE,
          })
      ).map((row) => ({ user: row.following, at: row.createdAt }));
  const total = await prisma.follow.count({ where });

  // 关注者 tab 需要「我是否回关」来决定按钮态
  const backIds = new Set<string>();
  if (tab === "followers" && rows.length > 0) {
    const mine = await prisma.follow.findMany({
      where: { followerId: me.id, followingId: { in: rows.map((r) => r.user.id) } },
      select: { followingId: true },
    });
    mine.forEach((f) => backIds.add(f.followingId));
  }

  return (
    <div className="mx-auto w-full max-w-screen-md px-4 py-5 md:px-6">
      {/* 关注/取关 toggle 后 back() 带 ok/error 回本页，就地展示反馈条 */}
      <QueryNotice ok={searchParams.ok} error={searchParams.error} className="mb-3" />

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
        <span className="text-sm font-semibold text-ink-mute">关注列表</span>
      </div>

      {/* tab 切换 */}
      <div className="mt-3 flex gap-2">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={`/me/follows?tab=${t.key}`}
              className={
                active
                  ? "btn-primary btn-sm rounded-full"
                  : "btn-ghost btn-sm rounded-full"
              }
              prefetch={false}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-4">
        {rows.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="users"
              title={
                tab === "followers" ? "还没有人关注你" : "你还没有关注任何人"
              }
              desc={
                tab === "followers"
                  ? "多在派里发帖互动，别人就能从主页关注你"
                  : "去感兴趣的用户主页点「+ 关注」，TA 的动态不会错过"
              }
            />
          </div>
        ) : (
          <ul className="card divide-y divide-ink-line/60">
            {rows.map(({ user, at }) => {
              const followedBack = tab === "followers" && backIds.has(user.id);
              // followers：可回关/已回关取关；following：必然在关注中，点了即取关
              const isFollowing = tab === "following" ? true : followedBack;
              return (
                <li key={user.id} className="flex items-center gap-3 px-4 py-3">
                  <UserAvatar
                    id={user.id}
                    name={user.nickname}
                    color={user.avatarColor}
                    src={user.avatarImage}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/users/${user.id}`}
                      className="block truncate text-sm font-semibold text-ink hover:underline"
                      prefetch={false}
                    >
                      {user.nickname}
                    </Link>
                    <p className="truncate text-[11px] text-ink-mute">
                      {tab === "followers" ? "关注了你" : "你关注了 TA"} ·{" "}
                      {formatChatTime(at)}
                    </p>
                  </div>
                  <form action={toggleFollowAction}>
                    <input type="hidden" name="targetId" value={user.id} />
                    <input
                      type="hidden"
                      name="returnTo"
                      value={`/me/follows?tab=${tab}&page=${page}`}
                    />
                    <SubmitButton
                      pendingText="处理中…"
                      className={isFollowing ? "btn-ghost btn-sm" : "btn-primary btn-sm"}
                    >
                      {isFollowing ? "已关注" : "+ 关注"}
                    </SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
        <Pager
          basePath="/me/follows"
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          query={{ tab }}
          className="card mt-2"
        />
      </div>
    </div>
  );
}
