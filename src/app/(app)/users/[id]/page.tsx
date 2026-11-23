import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { IDENTIFIED_USER } from "@/lib/api";
import { EMPLOYMENT_KIND } from "@/lib/constants";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Icon } from "@/components/Icon";
import { QueryNotice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { startConversationAction } from "@/lib/actions/message";
import { toggleFollowAction } from "@/lib/actions/follow";

export const metadata = { title: "用户主页" };

/** 是否「已完成公司认证」（在职或离职认证任一即算，与 actions/message.ts 的可达规则保持一致） */
async function isVerifiedEmployee(userId: string) {
  const hit = await prisma.employment.findFirst({
    where: { userId, status: "VERIFIED" },
    select: { id: true },
  });
  return Boolean(hit);
}

export default async function UserPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string | string[]; ok?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const me = await requireUser(`/users/${id}`);

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...IDENTIFIED_USER,
      status: true,
      createdAt: true,
      memberships: {
        where: { status: "ACTIVE" },
        select: {
          id: true,
          role: true,
          faction: { select: { id: true, name: true, slug: true, emoji: true, status: true } },
        },
        orderBy: { joinedAt: "desc" },
        take: 12,
      },
    },
  });
  if (!user || user.status === "DISABLED") notFound();

  const isSelf = me.id === user.id;
  // IDENTIFIED_USER.employments 已限定 status=VERIFIED，有条目即「已完成公司认证」（在职或离职均可）
  const targetVerified = user.status === "ACTIVE" && user.employments.length > 0;
  const [meVerified, followersCount, followingCount, followRow] = await Promise.all([
    isSelf ? Promise.resolve(false) : isVerifiedEmployee(me.id),
    // 关注双计数永远算在主页主头上（自己看自己时两个就是「我的粉丝/我的关注」）
    prisma.follow.count({ where: { followingId: user.id } }),
    prisma.follow.count({ where: { followerId: user.id } }),
    isSelf
      ? Promise.resolve(null)
      : prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: me.id, followingId: user.id } },
          select: { id: true },
        }),
  ]);
  const followedByMe = Boolean(followRow);
  const canMessage = !isSelf && meVerified && targetVerified;

  // 不能发时的原因提示（灰字，与按钮位互斥）
  let hint: string | null = null;
  if (isSelf) hint = "这是你自己的主页";
  else if (!meVerified) hint = "完成公司认证后才能发私信";
  else if (!targetVerified) hint = "对方未完成公司认证，暂不可私信";

  const displayName = user.nickname;
  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <QueryNotice ok={query.ok} error={query.error} className="mb-3" />

      <div className="card p-5">
        <div className="flex items-start gap-4">
          <Avatar name={displayName} color={user.avatarColor} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[20px] font-black tracking-tight text-ink">
              {displayName}
            </h1>
            {user.bio ? (
              <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{user.bio}</p>
            ) : (
              <p className="mt-1 text-[13px] text-ink-mute">这位同学还没有写简介</p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {user.employments.map((item) => (
                <Badge key={`${item.companyId}-${item.kind}`} tone={item.kind === "ALUMNI" ? "violet" : "ok"}>
                  {item.company.shortName} · {EMPLOYMENT_KIND[item.kind as keyof typeof EMPLOYMENT_KIND].short}
                </Badge>
              ))}
              {!user.employments.length ? <Badge tone="mute">未认证</Badge> : null}
            </div>
          </div>
        </div>

        {/* 关注双计数（左）+ 关注/发消息操作区（右）；关注无认证门槛，发消息仍双认证 */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink-line/60 pt-4">
          <div className="flex items-center gap-4 text-[12px] text-ink-soft">
            <span>
              <b className="mr-1 text-[15px] font-black text-ink tabular-nums">{followersCount}</b>关注者
            </span>
            <span>
              <b className="mr-1 text-[15px] font-black text-ink tabular-nums">{followingCount}</b>正在关注
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!isSelf ? (
              <form action={toggleFollowAction}>
                <input type="hidden" name="targetId" value={user.id} />
                <SubmitButton
                  className={followedByMe ? "btn-ghost btn-sm" : "btn-primary btn-sm"}
                  pendingText="处理中…"
                >
                  {followedByMe ? "已关注" : "+ 关注"}
                </SubmitButton>
              </form>
            ) : null}
            {canMessage ? (
              <form action={startConversationAction}>
                <input type="hidden" name="targetId" value={user.id} />
                <SubmitButton className="btn-primary btn-sm" pendingText="跳转中…">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="message" size={15} />
                    发消息
                  </span>
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </div>
        {/* 不能发消息的原因提示（灰字，与发信按钮互斥；自己的主页不提示） */}
        {!isSelf && !canMessage ? (
          <p className="mt-2 text-right text-[12px] text-ink-mute">{hint}</p>
        ) : null}
      </div>

      <div className="mt-4">
        <h2 className="mb-2 text-[15px] font-bold text-ink">TA 参与的派</h2>
        {user.memberships.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {user.memberships.map((membership) => (
              <Link
                key={membership.id}
                href={`/factions/${membership.faction.slug}`}
                className="card flex items-center gap-2.5 px-3.5 py-3 transition hover:border-brand/40"
              >
                <span className="text-xl leading-none">{membership.faction.emoji}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                  {membership.faction.name}
                </span>
                {membership.role !== "MEMBER" ? (
                  <Badge tone="brand">{membership.role === "LEADER" ? "派主" : "副派主"}</Badge>
                ) : null}
                <Icon name="right" size={14} className="text-ink-mute" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="card px-4 py-6 text-center text-[12.5px] text-ink-mute">
            TA 还没有加入任何兴趣派
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-[11px] text-ink-mute/80">
        加入时间 {new Date(user.createdAt).toLocaleDateString("zh-CN")}
      </p>
    </div>
  );
}
