import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/Badge";
import { CompanyBadge } from "@/components/CompanyBadge";
import { Icon } from "@/components/Icon";
import { QueryNotice } from "@/components/Notice";
import { EmptyState } from "@/components/Section";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmSubmit } from "@/components/content/ConfirmSubmit";
import { ActivityForm } from "@/components/faction/ActivityForm";
import { PostShareButton } from "@/components/post/PostShareButton";
import { Disclosure } from "@/components/Disclosure";
import {
  closeActivityAction,
  deleteActivityAction,
  signupActivityAction,
} from "@/lib/actions/faction";
import { launchGroupChatAction } from "@/lib/actions/groupchat";
import { activityShareSlogan, categoryOf } from "@/lib/constants";
import { looksRichText, prepareRichTextForRender } from "@/lib/rich-text";
import { withBasePath } from "@/lib/base-path";
import { pickUserIdentity } from "@/lib/identity";
import { audienceOfUserOrAdmin, canAccessFaction } from "@/lib/scope";
import { capacityLabel, cn, formatActivityTime, splitList, timeAgo, toDateTimeLocal } from "@/lib/utils";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const activity = await prisma.activity.findUnique({
    where: { id },
    select: { title: true, factionId: true },
  });
  if (!activity) return { title: "活动" };
  // 分享链接直达（?ref=share）时跳过派隔离，保证外部/未登录用户看到完整活动标题
  if (query.ref === "share") return { title: activity.title ?? "活动" };
  // 活动标题跟随所属派隔离，猜 id 也进不了浏览历史
  const user = await getCurrentUser();
  const audience = await audienceOfUserOrAdmin(user);
  if (!(await canAccessFaction(activity.factionId, audience, user?.id))) return { title: "活动" };
  return { title: activity.title ?? "活动" };
}

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; ref?: string }>;
}) {
  const { slug, id } = await params;
  const query = await searchParams;
  const user = await getCurrentUser();

  const activity = await prisma.activity.findUnique({
    where: { id },
    include: {
      faction: { include: { company: true } },
      creator: {
        select: {
          id: true,
          nickname: true,
          avatarColor: true,
          employments: {
            where: { status: "VERIFIED" },
            select: { companyId: true, kind: true, company: { select: { shortName: true } } },
          },
        },
      },
      signups: {
        where: { status: "GOING" },
        include: { user: { select: { id: true, nickname: true, avatarColor: true, bio: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!activity || activity.faction.slug !== slug) notFound();

  const audience = await audienceOfUserOrAdmin(user);
  // ?ref=share 时放行分享落地，链接持有者直接可看不受派隔限制；站内进仍按派隔离
  if (
    query.ref !== "share" &&
    !(await canAccessFaction(activity.factionId, audience, user?.id))
  )
    notFound();

  const [membership, mySignup, verifiedCount, groupChat] = await Promise.all([
    user
      ? prisma.factionMember.findUnique({
          where: { factionId_userId: { factionId: activity.factionId, userId: user.id } },
        })
      : Promise.resolve(null),
    user
      ? prisma.activitySignup.findUnique({
          where: { activityId_userId: { activityId: activity.id, userId: user.id } },
        })
      : Promise.resolve(null),
    // 分享入口权限与落地横幅引导都看「是否已认证」，这里只取认证数量
    user
      ? prisma.employment.count({ where: { userId: user.id, status: "VERIFIED" } })
      : Promise.resolve(0),
    // 活动群聊：每场活动最多一群，这里只取存在性与成员数
    prisma.groupChat.findUnique({
      where: { activityId: activity.id },
      select: { id: true, _count: { select: { members: true } } },
    }),
  ]);

  const isMember = membership?.status === "ACTIVE";
  const isManager = Boolean(isMember && membership && membership.role !== "MEMBER");
  // 派主 / 副派主可管理全部活动，成员可管理自己发起的活动
  const isCreator = Boolean(user && activity.creatorId === user.id);
  const canManage = isManager || isCreator;
  const cancelled = activity.status === "CANCELLED";
  const going = mySignup?.status === "GOING";
  // capacity=0 表示不限人数，永不判满
  const full = activity.capacity > 0 && activity.signupCount >= activity.capacity;
  const ended = activity.startAt.getTime() < Date.now();
  const meta = categoryOf(activity.faction.category);
  const creatorIdentity = pickUserIdentity(
    activity.creator.employments,
    activity.faction.companyId,
  );
  // 库里存 /uploads/xxx 相对路径，生产需补部署前缀才能经 nginx 命中应用
  const coverImages = splitList(activity.images).map(withBasePath);
  const path = `/factions/${slug}/activities/${activity.id}`;
  // 对外分享用的口号与落地横幅文案：时间地点直接写进标题，对方不点开也能看懂
  const shareSlogan = activityShareSlogan(
    activity.title,
    activity.faction.name,
    activity.faction.category,
    formatActivityTime(activity.startAt),
    activity.location,
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <div className="flex items-center justify-between">
        <Link
          href={`/factions/${slug}?tab=activities`}
          className="flex items-center gap-1 text-[12px] font-semibold text-ink-mute hover:text-ink"
        >
          <Icon name="back" size={14} />
          {activity.faction.name}
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          {isManager ? (
            <Link
              href={`/factions/${slug}/manage?tab=activities`}
              className="text-[11px] font-semibold text-ink-mute hover:text-brand"
            >
              管理活动 →
            </Link>
          ) : null}
          {/* 整页分享：与帖子同机制，一次点击即唤起系统/微信原生分享面板，任何人可分享 */}
          <PostShareButton
            title={shareSlogan}
            path={path}
            image={coverImages[0]}
            summary={activity.description.slice(0, 40)}
            label="整页分享这场活动"
          />
        </div>
      </div>

      <div className="mt-2">
        <QueryNotice ok={query.ok} error={query.error} />
      </div>

      {/* 活动分享落地横幅：通过 ?ref=share 进入且尚未完成认证时，先把「注册/认证后即可参加」讲清楚（参加不再要求入派） */}
      {query.ref === "share" && verifiedCount === 0 ? (
        <div className="mt-3 rounded-2xl border border-brand/40 bg-brand-soft/60 px-3.5 py-3">
          <p className="text-[13.5px] font-black leading-snug text-ink">
            {meta.emoji} {shareSlogan}
          </p>
          {!user ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
              <Link
                href={`/register?next=${encodeURIComponent(`${path}?ref=share`)}`}
                className="btn btn-sm bg-ink text-white"
              >
                注册参加这场活动
              </Link>
              <Link
                href={`/login?next=${encodeURIComponent(`${path}?ref=share`)}`}
                className="text-[12px] font-semibold text-brand hover:underline"
              >
                已有账号？登录
              </Link>
            </div>
          ) : (
            <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
              <Link href="/verify" className="btn btn-sm bg-ink text-white">
                完成认证后参加
              </Link>
              <span className="text-[11.5px] text-ink-soft">
                完成公司身份认证后即可直接参加，无需加入派系。
              </span>
            </div>
          )}
        </div>
      ) : null}

      <div className="card mt-3 overflow-hidden">
        <div
          className="px-4 pb-4 pt-5"
          style={{ backgroundImage: `linear-gradient(135deg, ${meta.from}66, ${meta.to}33)` }}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={activity.status === "OPEN" && !ended ? "ok" : "mute"}>
              {activity.status === "CANCELLED" ? "已取消" : ended ? "已结束" : activity.status === "OPEN" ? "报名中" : "已关闭报名"}
            </Badge>
            <Badge tone="ocean">{meta.label}</Badge>
            <span className="text-[10.5px] font-semibold text-ink-mute">
              {activity.faction.company.shortName}
            </span>
          </div>
          <h1 className="mt-2 text-[22px] font-black leading-snug tracking-tight text-ink">
            {activity.title}
          </h1>
        </div>

        {coverImages.length ? (
          <div className="border-t border-ink-line/60 p-3">
            <div className="grid gap-2">
              {coverImages.map((image) => (
                <img
                  key={image}
                  src={image}
                  alt={activity.title}
                  className="w-full rounded-xl object-cover"
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 border-t border-ink-line/60 px-4 py-3">
          <div className="flex items-start gap-2">
            <Icon name="calendar" size={15} className="mt-0.5 shrink-0 text-brand" />
            <div>
              <p className="text-[10px] text-ink-mute">时间</p>
              <p className="text-[12px] font-bold text-ink">{formatActivityTime(activity.startAt)}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Icon name="compass" size={15} className="mt-0.5 shrink-0 text-ocean" />
            <div>
              <p className="text-[10px] text-ink-mute">地点</p>
              <p className="text-[12px] font-bold text-ink">{activity.location}</p>
            </div>
          </div>
        </div>

        {activity.description ? (
          looksRichText(activity.description) ? (
            <div
              className="post-rich border-t border-ink-line/60 px-4 py-3 text-[12.5px] leading-relaxed text-ink-soft"
              dangerouslySetInnerHTML={{ __html: prepareRichTextForRender(activity.description) }}
            />
          ) : (
            <p className="whitespace-pre-wrap border-t border-ink-line/60 px-4 py-3 text-[12.5px] leading-relaxed text-ink-soft">
              {activity.description}
            </p>
          )
        ) : null}

        <div className="flex items-center gap-2 border-t border-ink-line/60 px-4 py-3">
          <UserAvatar id={activity.creator.id} name={activity.creator.nickname} color={activity.creator.avatarColor} size="xs" />
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-mute">
            <span>发起人 {activity.creator.nickname}</span>
            <CompanyBadge identity={creatorIdentity} showKind={false} showUnverified />
            <span>· 发布于 {timeAgo(activity.createdAt)}</span>
          </p>
          <span
            className={cn(
              "ml-auto text-[11px] font-bold",
              full ? "text-[#B42318]" : "text-ink-soft",
            )}
          >
            报名 {capacityLabel(activity.signupCount, activity.capacity)}
            {full ? " · 已满" : ""}
          </span>
        </div>

        <div className="border-t border-ink-line/60 px-4 py-3">
          {!user ? (
            <Link href={`/login?next=${encodeURIComponent(path)}`} className="btn-primary w-full">
              登录后报名
            </Link>
          ) : verifiedCount === 0 ? (
            <div className="rounded-xl bg-cream px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-mute">
              完成公司身份认证后即可参加本活动，无需加入派系。
              <Link href="/verify" className="ml-1 font-semibold text-brand">
                去认证 →
              </Link>
            </div>
          ) : activity.status === "CANCELLED" ? (
            <p className="rounded-xl bg-cream px-3 py-2.5 text-[11.5px] text-ink-mute">
              活动已被取消，如有疑问请联系派主。
            </p>
          ) : (
            <form action={signupActivityAction}>
              <input type="hidden" name="activityId" value={activity.id} />
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="redirectTo" value={path} />
              <SubmitButton
                className={cn(
                  "w-full",
                  going ? "btn-quiet" : "btn-primary",
                  !going && (full || activity.status !== "OPEN" || ended) && "opacity-60",
                )}
                pendingText="处理中…"
              >
                {going
                  ? "取消报名"
                  : ended
                    ? "活动已结束"
                    : activity.status !== "OPEN"
                      ? "报名已关闭"
                      : full
                        ? "名额已满"
                        : "我要报名"}
              </SubmitButton>
            </form>
          )}
        </div>

        {/* 活动群聊：发起入口仅限发起人；拉起后发起人与在报成员（含未入派但已报名者）都能进群，退报即自动出群 */}
        {user && (isMember || going) && !cancelled && (isCreator || groupChat) ? (
          <div className="border-t border-ink-line/60 px-4 py-3">
            {groupChat ? (
              going || isCreator ? (
                <Link href={`/messages/group/${groupChat.id}`} className="btn-quiet w-full">
                  进入活动群聊 · {groupChat._count.members} 人
                </Link>
              ) : (
                <p className="rounded-xl bg-cream px-3 py-2.5 text-[11.5px] text-ink-mute">
                  发起人已拉起活动群聊，报名后即可进入。
                </p>
              )
            ) : (
              <form action={launchGroupChatAction}>
                <input type="hidden" name="activityId" value={activity.id} />
                <input type="hidden" name="redirectTo" value={path} />
                <SubmitButton className="btn-quiet w-full" pendingText="拉起中…">
                  一键拉起活动群聊（拉入已报名成员）
                </SubmitButton>
                <p className="mt-1.5 text-center text-[10.5px] text-ink-mute">
                  仅发起人可建群；报名变动自动同步进出群，退报即退群
                </p>
              </form>
            )}
          </div>
        ) : null}
      </div>

      {/* 报名名单 */}
      <section className="card mt-3">
        <div className="flex items-center justify-between border-b border-ink-line/60 px-4 py-2.5">
          <h2 className="text-[13px] font-bold text-ink">报名名单</h2>
          <span className="text-[11px] text-ink-mute">{activity.signupCount} 人</span>
        </div>
        {isMember ? (
          activity.signups.length ? (
            <div className="divide-y divide-ink-line/60">
              {activity.signups.map((signup) => (
                <div key={signup.id} className="flex items-center gap-2.5 px-4 py-2.5">
                  <UserAvatar id={signup.user.id} name={signup.user.nickname} color={signup.user.avatarColor} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-bold text-ink">{signup.user.nickname}</p>
                    <p className="truncate text-[10.5px] text-ink-mute">
                      {signup.user.bio ?? "还没有填写简介"}
                    </p>
                  </div>
                  <span className="text-[10px] text-ink-mute">{timeAgo(signup.createdAt)}报名</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-[11.5px] text-ink-mute">
              还没有人报名，你可以是第一个
            </p>
          )
        ) : (
          <div className="px-4 py-5">
            <EmptyState
              icon="lock"
              title="名单仅对本派成员可见"
              desc="加入本派后可以查看一起去的同好"
              actionLabel="查看本派"
              actionHref={`/factions/${slug}`}
            />
          </div>
        )}
      </section>

      {canManage ? (
        <section className="card mt-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold text-ink">活动管理</h2>
            <span className="text-[10.5px] font-semibold text-ink-mute">
              {isCreator ? "你发起的活动" : "派主视角 · 可管理全部活动"}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-mute">
            {isManager
              ? isCreator
                ? "你可以修改、取消自己发起的活动；派主只能取消与开关报名，不能修改他人内容。"
                : "派主可以取消活动与开关报名，但活动内容只能由发起人修改。"
              : "你可以修改或取消自己发起的活动，其他成员的活动由发起人管理。"}
          </p>

          {!cancelled ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <form action={closeActivityAction}>
                <input type="hidden" name="activityId" value={activity.id} />
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="redirectTo" value={path} />
                <SubmitButton className="btn-quiet btn-sm" pendingText="…">
                  {activity.status === "OPEN" ? "关闭报名" : "重新开放报名"}
                </SubmitButton>
              </form>
              <form action={deleteActivityAction}>
                <input type="hidden" name="activityId" value={activity.id} />
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="redirectTo" value={path} />
                <ConfirmSubmit
                  confirmText="取消后报名全部作废并通知已报名成员，确定吗？"
                  className="text-[11px] font-semibold text-ink-mute transition hover:text-[#B42318]"
                >
                  取消活动
                </ConfirmSubmit>
              </form>
            </div>
          ) : (
            <p className="mt-2.5 rounded-xl bg-cream px-3 py-2 text-[11px] text-ink-mute">
              这场活动已取消，无法再编辑或重新开放。
            </p>
          )}

          {!cancelled && isCreator ? (
            <Disclosure
              className="mt-2.5 border-t border-ink-line/60 pt-2.5"
              summaryClassName="text-[11px] font-semibold text-ink-mute hover:text-brand"
              summary="编辑活动信息"
            >
              <ActivityForm
                mode="update"
                activityId={activity.id}
                slug={slug}
                redirectTo={path}
                isManager={isManager}
                defaults={{
                  title: activity.title,
                  startAt: toDateTimeLocal(activity.startAt),
                  location: activity.location,
                  capacity: String(activity.capacity),
                  description: activity.description,
                  pinned: activity.pinned,
                }}
              />
            </Disclosure>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
