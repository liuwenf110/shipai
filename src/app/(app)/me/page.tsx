import Link from "next/link";
import { prisma } from "@/lib/db";
import { getViewer, requireUser } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Icon } from "@/components/Icon";
import { QueryNotice } from "@/components/Notice";
import { EmptyState } from "@/components/Section";
import { SubmitButton } from "@/components/SubmitButton";
import { Disclosure } from "@/components/Disclosure";
import { logoutAction } from "@/lib/actions/auth";
import { ProfileForm } from "@/components/account/ProfileForm";
import { AvatarForm } from "@/components/account/AvatarForm";
import { PasswordForm } from "@/components/account/PasswordForm";
import { signupActivityAction } from "@/lib/actions/faction";
import { categoryOf, EMPLOYMENT_KIND, EMPLOYMENT_STATUS } from "@/lib/constants";
import { formatActivityTime, formatDate, maskEmail, maskPhone } from "@/lib/utils";

export const metadata = { title: "我的" };

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const query = await searchParams;
  await requireUser("/me");
  const viewer = await getViewer();
  if (!viewer) return null;

  const [applications, managed, mySignups, followersCount, followingCount, joinAppCount] = await Promise.all([
    prisma.leaderApplication.findMany({
      where: { userId: viewer.user.id },
      include: { faction: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.factionMember.findMany({
      where: {
        userId: viewer.user.id,
        status: "ACTIVE",
        role: { in: ["LEADER", "ADMIN"] },
      },
      include: { faction: { include: { company: true } } },
    }),
    prisma.activitySignup.findMany({
      where: { userId: viewer.user.id, status: "GOING" },
      include: { activity: { include: { faction: true } } },
      orderBy: { activity: { startAt: "asc" } },
      take: 20,
    }),
    // 关注双计数：与用户主页同源同口径（关注者=别人关注我的行数）
    prisma.follow.count({ where: { followingId: viewer.user.id } }),
    prisma.follow.count({ where: { followerId: viewer.user.id } }),
    // 历史入派申请数（含已通过的）：即使无待审项也要露出「我的申请」查看更多入口
    prisma.factionMember.count({ where: { userId: viewer.user.id, appliedAt: { not: null } } }),
  ]);

  const pendingMemberships = viewer.memberships.filter((item) => item.status === "PENDING");
  const upcomingSignups = mySignups.filter((item) => item.activity.status !== "CANCELLED");

  // 待审批的加入申请提醒：原来挂在首页身份卡上，红框整块去掉后由「我管理的派」接住，
  // 按派分组是为了让「去处理」直达真正有待审条目的那个派的管理台审批 tab
  const pendingJoinGroups = managed.length
    ? await prisma.factionMember.groupBy({
        by: ["factionId"],
        where: { factionId: { in: managed.map((item) => item.factionId) }, status: "PENDING" },
        _count: { _all: true },
      })
    : [];
  const pendingJoinCount = pendingJoinGroups.reduce((sum, item) => sum + item._count._all, 0);
  const pendingJoinTarget = managed.find((item) =>
    pendingJoinGroups.some((group) => group.factionId === item.factionId),
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      <QueryNotice ok={query.ok} error={query.error} className="mb-3" />

      {/* 个人信息 */}
      <div className="card relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-brand/10 blur-2xl" />
        <div className="flex items-center gap-3.5">
          <Avatar name={viewer.user.nickname} color={viewer.user.avatarColor} src={viewer.user.avatarImage} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="text-[19px] font-black tracking-tight">{viewer.user.nickname}</h1>
              {viewer.user.role === "ADMIN" ? <Badge tone="violet">平台运营</Badge> : null}
              {viewer.isVerified ? <Badge tone="ok">身份已认证</Badge> : <Badge tone="warn">未认证</Badge>}
            </div>
            <p className="mt-1 text-[11.5px] text-ink-mute">
              {viewer.user.email
                ? maskEmail(viewer.user.email)
                : viewer.user.phone
                  ? maskPhone(viewer.user.phone)
                  : "未绑定登录账号"}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-mute">
              加入于 {formatDate(viewer.user.createdAt)}
              {viewer.user.bio ? ` · ${viewer.user.bio}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-2">
          <MiniStat label="认证公司" value={viewer.verifiedEmployments.length} />
          <MiniStat label="加入的派" value={viewer.memberships.filter((m) => m.status === "ACTIVE").length} />
          <MiniStat label="管理的派" value={managed.length} />
          {/* 关注双计数：点进 /me/follows 对应 tab 看列表详情 */}
          <MiniStat label="关注者" value={followersCount} href="/me/follows?tab=followers" />
          <MiniStat label="正在关注" value={followingCount} href="/me/follows?tab=following" />
        </div>
      </div>

      {/* 账号自助：设置头像 / 编辑资料 / 修改密码 */}
      <div className="mt-3 space-y-2">
        <Disclosure
          className="card overflow-hidden"
          summaryClassName="flex list-none items-center justify-between px-4 py-3"
          summary={
            <>
              <span className="flex items-center gap-2 text-[12.5px] font-bold text-ink">
                <Icon name="user" size={15} className="text-ink-mute" />设置头像
              </span>
              <Icon name="right" size={14} className="text-ink-mute" />
            </>
          }
        >
          <AvatarForm
            name={viewer.user.nickname}
            color={viewer.user.avatarColor}
            image={viewer.user.avatarImage ?? null}
          />
        </Disclosure>

        <Disclosure
          className="card overflow-hidden"
          summaryClassName="flex list-none items-center justify-between px-4 py-3"
          summary={
            <>
              <span className="flex items-center gap-2 text-[12.5px] font-bold text-ink">
                <Icon name="edit" size={15} className="text-ink-mute" />编辑个人资料
              </span>
              <Icon name="right" size={14} className="text-ink-mute" />
            </>
          }
        >
          <div className="border-t border-ink-line/60 px-4 py-3">
            <ProfileForm
              nickname={viewer.user.nickname}
              email={viewer.user.email ?? ""}
              bio={viewer.user.bio ?? ""}
            />
          </div>
        </Disclosure>

        <Disclosure
          className="card overflow-hidden"
          summaryClassName="flex list-none items-center justify-between px-4 py-3"
          summary={
            <>
              <span className="flex items-center gap-2 text-[12.5px] font-bold text-ink">
                <Icon name="lock" size={15} className="text-ink-mute" />修改密码
              </span>
              <Icon name="right" size={14} className="text-ink-mute" />
            </>
          }
        >
          <div className="border-t border-ink-line/60 px-4 py-3">
            <PasswordForm />
          </div>
        </Disclosure>
      </div>

      {/* 厂牌墙 */}
      <section className="mt-4">
        <div className="mb-2 flex items-end justify-between">
          <h2 className="text-[15px] font-bold tracking-tight">我的厂牌</h2>
          <Link href="/verify" className="text-[11px] font-semibold text-ink-mute hover:text-brand">
            添加公司认证 →
          </Link>
        </div>

        {viewer.employments.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {viewer.employments.map((employment) => {
              const status =
                EMPLOYMENT_STATUS[employment.status as keyof typeof EMPLOYMENT_STATUS] ??
                EMPLOYMENT_STATUS.PENDING;
              // 非大厂认证挂在系统占位公司行上，对用户只展示自报的 employerName
              const displayName =
                employment.company.scope === "OUTSIDER"
                  ? (employment.employerName ?? "非大厂认证")
                  : employment.company.name;
              return (
                <div key={employment.id} className="card flex items-center gap-3 p-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[11px] font-black text-white"
                    style={{ background: employment.company.color }}
                  >
                    {employment.company.logoText}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-bold text-ink">{displayName}</p>
                    <p className="text-[10.5px] text-ink-mute">
                      {EMPLOYMENT_KIND[employment.kind as keyof typeof EMPLOYMENT_KIND]?.label}
                      {employment.title ? ` · ${employment.title}` : ""}
                    </p>
                  </div>
                  <Badge tone={status.tone as "ok" | "warn" | "bad"}>{status.label}</Badge>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card">
            <EmptyState
              icon="shield"
              title="还没有完成公司身份认证"
              desc="认证后即可加入公司旗下的兴趣派"
              actionLabel="去认证"
              actionHref="/verify"
            />
          </div>
        )}
      </section>

      {/* 管理的派 */}
      {managed.length ? (
        <section className="mt-4">
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-[15px] font-bold tracking-tight">我管理的派</h2>
            {pendingJoinCount && pendingJoinTarget ? (
              <Link
                href={`/factions/${pendingJoinTarget.faction.slug}/manage?tab=members`}
                className="inline-flex items-center gap-1.5 rounded-full bg-ink/10 px-3 py-1.5"
              >
                <Icon name="bell" size={12} className="shrink-0 text-[#D92B20]" />
                <span className="text-[12.5px] font-black text-[#D92B20]">
                  你有 {pendingJoinCount} 条加入申请待审批
                </span>
                <span className="flex items-center gap-0.5 text-[11px] font-bold text-[#D92B20]/80">
                  去处理 <Icon name="right" size={12} />
                </span>
              </Link>
            ) : null}
          </div>
          <div className="space-y-2">
            {managed.map((item) => (
              <Link
                key={item.id}
                href={`/factions/${item.faction.slug}/manage`}
                className="card flex items-center gap-3 p-3 transition hover:shadow-float"
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[16px]"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${categoryOf(item.faction.category).from}, ${categoryOf(item.faction.category).to})`,
                  }}
                >
                  {item.faction.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold text-ink">{item.faction.name}</p>
                  <p className="text-[10.5px] text-ink-mute">{item.faction.company.shortName}</p>
                </div>
                <Badge tone={item.role === "LEADER" ? "brand" : "violet"}>
                  {item.role === "LEADER" ? "派主" : "副派主"}
                </Badge>
                <Icon name="right" size={14} className="text-ink-mute" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* 我的派 */}
      <section className="mt-4">
        <div className="mb-2 flex items-end justify-between">
          <h2 className="text-[15px] font-bold tracking-tight">我加入的派</h2>
          <Link href="/discover" className="text-[11px] font-semibold text-ink-mute hover:text-brand">
            发现更多 →
          </Link>
        </div>
        {viewer.memberships.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {viewer.memberships.map((item) => (
              <Link
                key={item.id}
                href={`/factions/${item.faction.slug}`}
                className="card flex items-center gap-3 p-3 transition hover:shadow-float"
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[16px]"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${categoryOf(item.faction.category).from}, ${categoryOf(item.faction.category).to})`,
                  }}
                >
                  {item.faction.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold text-ink">{item.faction.name}</p>
                  <p className="text-[10.5px] text-ink-mute">{item.faction.company.shortName}</p>
                </div>
                {item.status === "PENDING" ? <Badge tone="warn">待审批</Badge> : null}
                <Icon name="right" size={14} className="text-ink-mute" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="card">
            <EmptyState
              icon="compass"
              title="还没有加入兴趣派"
              desc="同厂同事都在这里，挑一个感兴趣的加入吧"
              actionLabel="浏览兴趣派"
              actionHref="/discover"
            />
          </div>
        )}
      </section>

      {/* 我的活动 */}
      <section className="mt-4">
        <div className="mb-2 flex items-end justify-between">
          <h2 className="text-[15px] font-bold tracking-tight">我报名的活动</h2>
          <Link href="/discover" className="text-[11px] font-semibold text-ink-mute hover:text-brand">
            去发现更多 →
          </Link>
        </div>
        {upcomingSignups.length ? (
          <div className="space-y-2">
            {upcomingSignups.map((signup) => {
              const activity = signup.activity;
              const ended = activity.startAt.getTime() < Date.now();
              const activityPath = `/factions/${activity.faction.slug}/activities/${activity.id}`;
              return (
                <div key={signup.id} className="card flex items-center gap-3 p-3">
                  <Link href={activityPath} className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-bold text-ink">{activity.title}</span>
                      <Badge tone={ended ? "mute" : "ok"}>{ended ? "已结束" : "待参加"}</Badge>
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-ink-mute">
                      {formatActivityTime(activity.startAt)} · {activity.location}
                    </p>
                    <p className="text-[10.5px] text-ink-mute">{activity.faction.name}</p>
                  </Link>
                  {!ended && activity.status === "OPEN" ? (
                    <form action={signupActivityAction}>
                      <input type="hidden" name="activityId" value={activity.id} />
                      <input type="hidden" name="slug" value={activity.faction.slug} />
                      <input type="hidden" name="redirectTo" value="/me" />
                      <SubmitButton className="btn-quiet btn-sm" pendingText="…">
                        取消报名
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card">
            <EmptyState
              icon="calendar"
              title="还没有报名活动"
              desc="派内发起活动后会通知你，报名后在这里能看到行程"
              actionLabel="浏览兴趣派"
              actionHref="/discover"
            />
          </div>
        )}
      </section>

      {/* 我的申请 */}
      {pendingMemberships.length || applications.length || joinAppCount ? (
        <section className="mt-4">
          <h2 className="mb-2 text-[15px] font-bold tracking-tight">我的申请</h2>
          <div className="card divide-y divide-ink-line/60">
            {pendingMemberships.map((item) => (
              <div key={`m-${item.id}`} className="flex items-center gap-2.5 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold text-ink">
                    {item.faction.name}
                    <span className="ml-1 text-[10.5px] font-normal text-ink-mute">加入申请</span>
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-[10.5px] text-ink-mute">
                    等待派主审批，通过后即可查看派内动态
                  </p>
                </div>
                <Badge tone="warn">审核中</Badge>
              </div>
            ))}
            {applications.map((application) => (
              <div key={application.id} className="flex items-center gap-2.5 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold text-ink">
                    {application.faction.name}
                    <span className="ml-1 text-[10.5px] font-normal text-ink-mute">
                      {application.requestedRole === "LEADER" ? "派主认证" : "副派主申请"}
                    </span>
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-[10.5px] text-ink-mute">
                    {application.reviewerNote ?? application.reason}
                  </p>
                </div>
                <Badge
                  tone={
                    application.status === "APPROVED"
                      ? "ok"
                      : application.status === "REJECTED"
                        ? "bad"
                        : "warn"
                  }
                >
                  {application.status === "APPROVED"
                    ? "已通过"
                    : application.status === "REJECTED"
                      ? "未通过"
                      : "审核中"}
                </Badge>
              </div>
            ))}
            {/* 全部申请记录（派主/入派/成员列表查看）含审核状态的历史页 */}
            <Link
              href="/me/applications"
              className="flex items-center justify-center gap-1 px-3.5 py-2.5 text-[11.5px] font-bold text-brand hover:bg-cream/60"
            >
              查看更多
              <Icon name="right" size={12} />
            </Link>
          </div>
        </section>
      ) : null}

      {/* 其它入口 */}
      <section className="mt-4 space-y-2">
        <Link href="/inbox" className="card flex items-center justify-between p-3.5">
          <span className="flex items-center gap-2 text-[12.5px] font-bold text-ink">
            <Icon name="mail" size={16} className="text-ink-mute" />
            发件记录
          </span>
          <Icon name="right" size={14} className="text-ink-mute" />
        </Link>
        {/* 一键退出：整张卡片就是一个提交按钮，不再另设“退出”小链接，避免多一步点右側才能确认 */}
        <form action={logoutAction}>
          <button
            type="submit"
            className="card flex w-full items-center justify-between p-3.5 text-left transition hover:bg-cream-sunk/60"
          >
            <span className="flex items-center gap-2 text-[12.5px] font-bold text-ink">
              <Icon name="logout" size={16} className="text-ink-mute" />
              退出登录
            </span>
            <span className="text-[11px] font-semibold text-ink-mute">点击退出</span>
          </button>
        </form>
      </section>
    </div>
  );
}

function MiniStat({ label, value, href }: { label: string; value: number; href?: string }) {
  const box = (
    <div className="rounded-xl bg-cream px-1.5 py-2 text-center">
      <p className="text-[16px] font-black leading-none text-ink tabular-nums">{value}</p>
      <p className="mt-1 whitespace-nowrap text-[10px] text-ink-mute">{label}</p>
    </div>
  );
  // 带 href 时整格可点（关注双计数进列表页），hover 提示可交互
  if (href) {
    return (
      <Link href={href} className="block transition hover:-translate-y-0.5 hover:shadow-sm" prefetch={false}>
        {box}
      </Link>
    );
  }
  return box;
}
