import Link from "next/link";
import { prisma } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { loadFactionActivity, sliceFactions } from "@/lib/activity";
import { Avatar } from "@/components/Avatar";
import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/Badge";
import { CompanyBadge } from "@/components/CompanyBadge";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/Section";
import { IDENTIFIED_USER } from "@/lib/api";
import { SearchForm } from "@/components/search/SearchForm";
import { categoryOf } from "@/lib/constants";
import { pickUserIdentity } from "@/lib/identity";
import { formatActivityTime, timeAgo } from "@/lib/utils";
import { richTextToPlainText } from "@/lib/rich-text";

export const metadata = { title: "搜索" };

const LIMIT = 8;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const keyword = (params.q ?? "").trim();
  const viewer = await getViewer();
  const loggedIn = Boolean(viewer);

  const [factionCandidates, companies, posts, activities, users] = keyword
    ? await Promise.all([
        prisma.faction.findMany({
          where: {
            status: { in: ["ACTIVE", "REVIEWING"] },
            OR: [
              { name: { contains: keyword } },
              { tagline: { contains: keyword } },
              { description: { contains: keyword } },
            ],
          },
          include: { company: true },
        }),
        prisma.company.findMany({
          where: {
            OR: [{ name: { contains: keyword } }, { shortName: { contains: keyword } }],
          },
          take: 4,
        }),
        loggedIn
          ? prisma.post.findMany({
              where: {
                status: "PUBLISHED",
                OR: [{ title: { contains: keyword } }, { content: { contains: keyword } }],
              },
              include: { author: { select: IDENTIFIED_USER }, faction: true },
              orderBy: { createdAt: "desc" },
              take: LIMIT,
            })
          : Promise.resolve([]),
        loggedIn
          ? prisma.activity.findMany({
              where: {
                status: { not: "CANCELLED" },
                faction: { status: "ACTIVE" },
                OR: [
                  { title: { contains: keyword } },
                  { location: { contains: keyword } },
                  { description: { contains: keyword } },
                ],
              },
              include: { faction: true },
              orderBy: { startAt: "asc" },
              take: LIMIT,
            })
          : Promise.resolve([]),
        loggedIn
          ? prisma.user.findMany({
              where: { status: "ACTIVE", nickname: { contains: keyword } },
              orderBy: { createdAt: "desc" },
              take: LIMIT,
            })
          : Promise.resolve([]),
      ])
    : [[], [], [], [], []];

  // 派命中与发现页同口径：后台权重钉顶，其余按活跃度
  const factions = keyword
    ? sliceFactions(factionCandidates, await loadFactionActivity(), 0, LIMIT)
    : factionCandidates;

  const totalHits =
    factions.length + companies.length + posts.length + activities.length + users.length;

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <h1 className="text-[24px] font-black tracking-tight">搜索</h1>
      <p className="mt-1 text-[12px] text-ink-mute">兴趣派、同事动态、活动和同好，一次搜全</p>

      <SearchForm initialQuery={keyword} />

      {!keyword ? (
        <div className="card mt-4">
          <EmptyState
            icon="search"
            title="输入关键词开始搜索"
            desc="例如「徒步」「阿里」「周末桌游」"
            actionLabel="去发现兴趣派"
            actionHref="/discover"
          />
        </div>
      ) : totalHits === 0 ? (
        <div className="card mt-4">
          <EmptyState
            icon="search"
            title={`没有找到与「${keyword}」相关的内容`}
            desc="换个关键词试试，或者去发现页逛逛"
            actionLabel="浏览兴趣派"
            actionHref="/discover"
          />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {companies.length ? (
            <section>
              <h2 className="mb-2 text-[13px] font-bold text-ink">公司</h2>
              <div className="card flex flex-wrap gap-2 p-3">
                {companies.map((company) => (
                  <Link
                    key={company.id}
                    href={`/discover?company=${company.id}`}
                    className="flex items-center gap-1.5 rounded-full bg-cream px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-soft transition hover:bg-brand-soft/50"
                  >
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded-[4px] text-[8px] font-bold text-white"
                      style={{ background: company.color }}
                    >
                      {company.logoText}
                    </span>
                    {company.shortName}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {factions.length ? (
            <section>
              <h2 className="mb-2 text-[13px] font-bold text-ink">兴趣派</h2>
              <div className="space-y-2">
                {factions.map((faction) => {
                  const meta = categoryOf(faction.category);
                  return (
                    <Link
                      key={faction.id}
                      href={`/factions/${faction.slug}`}
                      className="card flex items-center gap-3 p-3 transition hover:shadow-float"
                    >
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-[18px]"
                        style={{
                          backgroundImage: `linear-gradient(135deg, ${meta.from}, ${meta.to})`,
                        }}
                      >
                        {faction.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-bold text-ink">
                            {faction.name}
                          </span>
                          <Badge tone="ocean">{meta.label}</Badge>
                        </p>
                        <p className="truncate text-[11px] text-ink-mute">
                          {faction.company.shortName} · {faction.memberCount} 人 · {faction.tagline}
                        </p>
                      </div>
                      <Icon name="right" size={14} className="shrink-0 text-ink-mute" />
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}

          {activities.length ? (
            <section>
              <h2 className="mb-2 text-[13px] font-bold text-ink">活动</h2>
              <div className="space-y-2">
                {activities.map((activity) => (
                  <Link
                    key={activity.id}
                    href={`/factions/${activity.faction.slug}/activities/${activity.id}`}
                    className="card flex items-center gap-3 p-3 transition hover:shadow-float"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-dark">
                      <Icon name="calendar" size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-bold text-ink">{activity.title}</p>
                      <p className="truncate text-[10.5px] text-ink-mute">
                        {activity.faction.name} · {formatActivityTime(activity.startAt)} ·{" "}
                        {activity.location}
                      </p>
                    </div>
                    <Icon name="right" size={14} className="shrink-0 text-ink-mute" />
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {posts.length ? (
            <section>
              <h2 className="mb-2 text-[13px] font-bold text-ink">动态</h2>
              <div className="space-y-2">
                {posts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/posts/${post.id}`}
                    className="card block p-3 transition hover:shadow-float"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Avatar name={post.author.nickname} color={post.author.avatarColor} size="xs" />
                      <span className="text-[11.5px] font-bold text-ink">{post.author.nickname}</span>
                      <CompanyBadge
                        identity={pickUserIdentity(post.author.employments, post.faction.companyId)}
                        showKind={false}
                        showUnverified
                      />
                      <span className="text-[10px] text-ink-mute">
                        {post.faction.name} · {timeAgo(post.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-soft">
                      {post.title ? `${post.title} · ` : ""}
                      {richTextToPlainText(post.content)}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {users.length ? (
            <section>
              <h2 className="mb-2 text-[13px] font-bold text-ink">同好</h2>
              <div className="card divide-y divide-ink-line/60">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
                    <UserAvatar id={user.id} name={user.nickname} color={user.avatarColor} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-bold text-ink">{user.nickname}</p>
                      <p className="truncate text-[10.5px] text-ink-mute">
                        {user.bio ?? "还没有填写简介"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {!loggedIn ? (
            <p className="card p-3 text-[11.5px] text-ink-mute">
              登录后还可以搜索同事动态、活动与同好，
              <Link href="/login?next=%2Fsearch" className="ml-1 font-semibold text-brand">
                去登录 →
              </Link>
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
