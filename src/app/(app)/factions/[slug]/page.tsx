import Link from "next/link";
import { notFound } from "next/navigation";
import { IDENTIFIED_USER, PUBLIC_USER } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/Badge";
import { CompanyBadge } from "@/components/CompanyBadge";
import { Icon } from "@/components/Icon";
import { Notice, QueryNotice } from "@/components/Notice";
import { PostCard } from "@/components/PostCard";
import { ActivityFeedCard } from "@/components/faction/ActivityFeedCard";
import { EmptyState } from "@/components/Section";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmSubmit } from "@/components/content/ConfirmSubmit";
import { PostComposer } from "@/components/faction/PostComposer";
import { ActivityForm } from "@/components/faction/ActivityForm";
import { Disclosure } from "@/components/Disclosure";
import { FactionShareButton } from "@/components/faction/FactionShareButton";
import {
  joinFactionAction,
  leaveFactionAction,
  signupActivityAction,
  requestMemberViewAction,
  cancelMemberViewAction,
} from "@/lib/actions/faction";
import {
  categoryOf,
  factionShareSlogan,
  FACTION_STATUS,
  MEMBER_ROLE,
  MEMBER_STATUS,
} from "@/lib/constants";
import { pickUserIdentity } from "@/lib/identity";
import { audienceOfUserOrAdmin, canAccessFaction } from "@/lib/scope";
import { withBasePath } from "@/lib/base-path";
import { withPostIdentity } from "@/lib/revive";
import { cn, formatActivityTime, formatDate, splitList } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // 页名同样隔离：跨阵营的派连标题也不进浏览历史与分享预览
  const user = await getCurrentUser();
  const audience = await audienceOfUserOrAdmin(user);
  const faction = await prisma.faction.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!faction || !(await canAccessFaction(faction.id, audience, user?.id))) return { title: "兴趣派" };
  return { title: `${faction.name}` };
}

const TABS = [
  { key: "posts", label: "动态", icon: "message" as const },
  { key: "activities", label: "活动", icon: "calendar" as const },
  { key: "members", label: "成员", icon: "users" as const },
  { key: "about", label: "关于", icon: "flag" as const },
];

export default async function FactionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; ok?: string; error?: string; ref?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const tab = TABS.some((item) => item.key === query.tab) ? query.tab! : "posts";

  const user = await getCurrentUser();
  const audience = await audienceOfUserOrAdmin(user);
  const faction = await prisma.faction.findUnique({
    where: { slug },
    // 用户关系一律收敛 PUBLIC_USER，避免 flight 载荷携带 passwordHash/email；派主额外附 employments 用于头部信息栏展示公司/在职身份
    include: {
      company: true,
      leader: {
        select: {
          ...PUBLIC_USER,
          employments: {
            where: { status: "VERIFIED" },
            select: { companyId: true, kind: true, company: { select: { shortName: true } } },
          },
        },
      },
    },
  });
  if (!faction) notFound();
  // 拆下 leader.employments 避免全量页面传递，只为头部派主卡派生一个 identity
  const leaderWithIdentity = faction.leader
    ? {
        ...faction.leader,
        identity: pickUserIdentity(
          faction.leader.employments as { companyId: string; kind: string; company: { shortName: string } }[],
          faction.companyId,
        ),
      }
    : null;
  // 阵营不可见且本人不在派内 → 整页按不存在处理，派内动态 / 活动 / 成员名单 / 派主资料随页面一并不可达
  if (!(await canAccessFaction(faction.id, audience, user?.id))) notFound();

  const meta = categoryOf(faction.category);
  const statusMeta = FACTION_STATUS[faction.status as keyof typeof FACTION_STATUS];

  const [membership, employment, pendingApplication, allVerifiedEmployments, viceLeaderCount, viewRequest] =
    await Promise.all([
      user
        ? prisma.factionMember.findUnique({
            where: { factionId_userId: { factionId: faction.id, userId: user.id } },
          })
        : Promise.resolve(null),
      user
        ? prisma.employment.findFirst({
            where: { userId: user.id, companyId: faction.companyId, status: "VERIFIED" },
            include: { company: true },
          })
        : Promise.resolve(null),
      user
        ? prisma.leaderApplication.findFirst({
            where: { factionId: faction.id, userId: user.id, status: "PENDING" },
          })
        : Promise.resolve(null),
      user
        ? prisma.employment.findMany({
            where: { userId: user.id, status: "VERIFIED" },
            include: { company: true },
          })
        : Promise.resolve([] as { id: string; kind: string; company: { shortName: string } }[]),
      prisma.factionMember.count({
        where: { factionId: faction.id, status: "ACTIVE", role: "ADMIN" },
      }),
      user
        ? prisma.memberViewRequest.findUnique({
            where: { factionId_userId: { factionId: faction.id, userId: user.id } },
          })
        : Promise.resolve(null),
    ]);

  const isVerifiedAnywhere = allVerifiedEmployments.length > 0;
  const isCrossCompany = isVerifiedAnywhere && !employment;
  const needsLeaderApproval = isCrossCompany || faction.joinMode === "APPROVAL";

  const isMember = membership?.status === "ACTIVE";
  const isPending = membership?.status === "PENDING";
  const isManager = Boolean(isMember && membership && membership.role !== "MEMBER");
  const isLeader = membership?.role === "LEADER";
  // 派主 / 副派主空缺时，向已加入的普通成员开放申请；驳回后仍保留普通成员身份
  // 认证门槛为「任一公司已认证」，公司限制由「必须为本派成员」的加入环节把关
  const canApplyLeaderRole = Boolean(isMember && isVerifiedAnywhere && !isManager && !faction.leaderId);
  const canApplyViceRole = Boolean(
    isMember && isVerifiedAnywhere && !isManager && faction.leaderId && viceLeaderCount === 0,
  );
  const applyRole: "LEADER" | "ADMIN" | null = canApplyLeaderRole
    ? "LEADER"
    : canApplyViceRole
      ? "ADMIN"
      : null;
  const showApplyEntry = Boolean(applyRole && !pendingApplication);
  // 成员列表查看权限：仅派主/副派主可直看，其余人（含普通成员）需申请审核
  const canViewMembers = isManager || viewRequest?.status === "APPROVED";
  const viewRequestPending = viewRequest?.status === "PENDING";
  // 「管理我的派」按钮上的红色待办标记：副派主同样能审批，所以按 isManager 统计，
  // 口径与管理台头部的 pendingTotal 一致（加入申请 + 成员列表查看申请）；非管理者不花这两次查询
  const [pendingJoinCount, pendingViewRequestCount] = isManager
    ? await Promise.all([
        prisma.factionMember.count({ where: { factionId: faction.id, status: "PENDING" } }),
        prisma.memberViewRequest.count({ where: { factionId: faction.id, status: "PENDING" } }),
      ])
    : [0, 0];
  const pendingManagerCount = pendingJoinCount + pendingViewRequestCount;

  const path = `/factions/${faction.slug}`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <Link
          href="/discover"
          className="flex items-center gap-1 text-[12px] font-semibold text-ink-mute hover:text-ink"
        >
          <Icon name="back" size={14} />
          发现
        </Link>
        <div className="flex items-center gap-1.5">
          <FactionShareButton slogan={factionShareSlogan(faction.name, faction.category)} />
          {isManager ? (
            <Link href={`${path}/manage`} className="btn-ghost btn-sm relative">
              <Icon name="settings" size={13} />
              派主管理台
              {/* 副派主没有下方那颗橙色主按钮，待办只在管理台入口上点一个红点 */}
              {pendingManagerCount > 0 && !isLeader ? (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#D92B20] ring-2 ring-white" />
              ) : null}
            </Link>
          ) : null}
          {isMember ? (
            <Badge tone="ok">已加入</Badge>
          ) : isPending ? (
            <Badge tone="warn">申请待审批</Badge>
          ) : null}
        </div>
      </div>

      {/* 分享落地横幅：通过 ?ref=share 进入且尚未入派时展示宣传语与加入/注册入口 */}
      {query.ref === "share" && !isMember && !isPending ? (
        <div className="mb-3 rounded-2xl border border-brand/40 bg-brand-soft/60 px-3.5 py-3">
          <p className="text-[13.5px] font-black leading-snug text-ink">
            {meta.emoji} {factionShareSlogan(faction.name, faction.category)}
          </p>
          {!user ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
              <Link
                href={`/register?next=${encodeURIComponent(`${path}?ref=share`)}`}
                className="btn btn-sm bg-ink text-white"
              >
                注册加入「{faction.name}」
              </Link>
              <Link
                href={`/login?next=${encodeURIComponent(`${path}?ref=share`)}`}
                className="text-[12px] font-semibold text-brand hover:underline"
              >
                已有账号？登录
              </Link>
            </div>
          ) : !isVerifiedAnywhere ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
              <Link href="/verify" className="btn btn-sm bg-ink text-white">
                <Icon name="shield" size={13} />
                完成认证后加入
              </Link>
              <span className="text-[11.5px] text-ink-soft">注册只是第一步，认证后才能入派玩起来</span>
            </div>
          ) : (
            <p className="mt-1.5 text-[11.5px] text-ink-soft">点上方「加入这个派」按钮，马上回到组织。</p>
          )}
        </div>
      ) : null}

      {/* 派主 / 副派主空缺：派系上方为已加入的普通成员提供申请入口 */}
      {showApplyEntry && applyRole ? (
        <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-2xl border border-dashed border-brand/50 bg-brand-soft/50 px-3.5 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/85">
            <Icon name="flag" size={15} className="text-brand-dark" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold text-ink">
              本派暂无{applyRole === "LEADER" ? "认证派主" : "副派主"}
            </p>
            <p className="text-[10.5px] leading-relaxed text-ink-mute">
              {applyRole === "LEADER"
                ? "你已是本派成员，可申请担任派主，运营审核通过后获得管理权限"
                : "你已是本派成员，可申请担任副派主，协助派主管理成员与活动"}
            </p>
          </div>
          <Link href={`${path}/apply`} className="btn-primary btn-sm">
            申请{applyRole === "LEADER" ? "派主" : "副派主"}
          </Link>
        </div>
      ) : null}

      {/* 头部 */}
      <div className="card overflow-hidden">
        <div
          className="relative px-5 pb-4 pt-5"
          style={{ backgroundImage: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_-10%,rgba(255,255,255,0.7),transparent_55%)]" />
          <div className="relative flex items-start gap-3.5">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-[30px] shadow-sm backdrop-blur">
              {faction.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h1 className="text-[22px] font-black leading-tight tracking-tight text-ink">
                  {faction.name}
                </h1>
                {faction.status !== "ACTIVE" ? (
                  <Badge tone="warn">{statusMeta?.label}</Badge>
                ) : null}
              </div>
              <p className="mt-0.5 text-[12.5px] font-medium text-ink/65">{faction.tagline}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10.5px] font-bold text-ink/70 backdrop-blur">
                  <span
                    className="flex h-3.5 w-3.5 items-center justify-center rounded-[4px] text-[6px] font-black text-white"
                    style={{ background: faction.company.color }}
                  >
                    {faction.company.logoText}
                  </span>
                  {faction.company.name}
                </span>
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10.5px] font-bold text-ink/70 backdrop-blur">
                  {meta.label}
                </span>
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10.5px] font-bold text-ink/70 backdrop-blur">
                  {faction.joinMode === "APPROVAL" ? "需派主审批" : "自由加入"}
                </span>
              </div>
            </div>
          </div>

          {/* 派主信息栏：有派主时展示头像/昵称/认证徒章/公司/简介，点头像或卡片到个人主页 */}
          {leaderWithIdentity ? (
            <Link
              href={`/users/${leaderWithIdentity.id}`}
              className="relative mt-3 flex items-center gap-2.5 rounded-2xl bg-white/70 px-3 py-2 backdrop-blur transition hover:bg-white/90"
            >
              <UserAvatar
                id={leaderWithIdentity.id}
                name={leaderWithIdentity.nickname}
                color={leaderWithIdentity.avatarColor}
                src={leaderWithIdentity.avatarImage}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-[13px] font-black text-ink">{leaderWithIdentity.nickname}</span>
                  <Badge tone="brand">认证派主</Badge>
                  {leaderWithIdentity.identity ? (
                    <CompanyBadge identity={leaderWithIdentity.identity} showKind={false} />
                  ) : null}
                </div>
                <p className="mt-0.5 line-clamp-1 text-[11.5px] leading-relaxed text-ink/70">
                  {leaderWithIdentity.bio?.trim() || "负责本派活动组织与内容治理"}
                </p>
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-ink/60">查看主页 →</span>
            </Link>
          ) : null}

          <div className="relative mt-4 flex items-end justify-between gap-3">
            <div className="flex items-center gap-4 text-ink/70">
              <span className="flex items-center gap-1 text-[11.5px] font-semibold">
                {/* 人数不展示具体值，按十位档位取整（至少 10+），避免暴露精确规模 */}
                <Icon name="users" size={14} /> {Math.max(10, Math.floor(faction.memberCount / 10) * 10)}+ 位成员
              </span>
            </div>

            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
              {!user ? (
                <Link href={`/login?next=${encodeURIComponent(path)}`} className="btn bg-ink text-white">
                  登录后加入
                </Link>
              ) : !isVerifiedAnywhere ? (
                <Link href="/verify" className="btn bg-ink text-white">
                  <Icon name="shield" size={14} />
                  先完成公司身份认证
                </Link>
              ) : isCrossCompany && !faction.allowCrossCompany && !isMember && !isPending ? (
                <span className="btn bg-white/70 text-ink-soft cursor-default">
                  仅限{faction.company.shortName}认证成员
                </span>
              ) : isMember ? (
                isLeader ? (
                  <Link
                    href={`${path}/manage`}
                    className="btn relative bg-brand text-white shadow-float hover:bg-brand-dark"
                  >
                    <Icon name="settings" size={14} />
                    管理我的派
                    {pendingManagerCount > 0 ? (
                      <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D92B20] px-1 text-[9.5px] font-black text-white ring-2 ring-white">
                        {pendingManagerCount}
                      </span>
                    ) : null}
                  </Link>
                ) : (
                  <>
                    {/* 已加入状态与退出操作分开展示：状态只读，退出单独一个按钮 */}
                    <span className="btn cursor-default bg-white/85 text-ink-soft">
                      <Icon name="check" size={14} />
                      已加入
                    </span>
                    <form action={leaveFactionAction}>
                      <input type="hidden" name="factionId" value={faction.id} />
                      <input type="hidden" name="slug" value={faction.slug} />
                      <ConfirmSubmit
                        className="btn bg-white/40 text-ink-soft ring-1 ring-white/70 hover:bg-white/60"
                        confirmText={`确定要退出「${faction.name}」吗？退出后将无法查看派内内容。`}
                        pendingText="退出中…"
                      >
                        退出
                      </ConfirmSubmit>
                    </form>
                  </>
                )
              ) : isPending ? (
                <>
                  <span className="btn bg-white/70 text-ink-soft cursor-default">
                    {faction.leaderId ? "申请待派主审批" : "申请待运营审批"}
                  </span>
                  {/* PENDING 撤回入口：服务端置 LEFT、不减计数，提示「已撤回加入申请」 */}
                  <form action={leaveFactionAction}>
                    <input type="hidden" name="factionId" value={faction.id} />
                    <input type="hidden" name="slug" value={faction.slug} />
                    <ConfirmSubmit
                      className="btn bg-white/80 text-ink-soft"
                      confirmText="确定要撤回这个加入申请吗？"
                      pendingText="撤回中…"
                    >
                      撤回申请
                    </ConfirmSubmit>
                  </form>
                </>
              ) : (
                <form action={joinFactionAction}>
                  <input type="hidden" name="factionId" value={faction.id} />
                  <input type="hidden" name="slug" value={faction.slug} />
                  <SubmitButton className="btn bg-ink text-white" pendingText="加入中…">
                    <Icon name="plus" size={14} />
                    {needsLeaderApproval ? "申请加入" : "加入这个派"}
                  </SubmitButton>
                </form>
              )}
              </div>
              {isCrossCompany && faction.allowCrossCompany && !isMember && !isPending ? (
                <p className="text-[10px] text-ink/60">
                  你已在 {allVerifiedEmployments.map((e) => e.company.shortName).join("、")} 认证，跨公司加入需{faction.leaderId ? "派主" : "运营"}审批
                </p>
              ) : null}
              {isCrossCompany && !faction.allowCrossCompany && !isMember ? (
                <Link href="/verify" className="text-[10px] text-white/70 underline underline-offset-2 hover:text-white">
                  认证 {faction.company.shortName} 后可加入
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-1 border-t border-ink-line/70 px-3 py-2">
          {TABS.map((item) => (
            <Link
              key={item.key}
              href={`${path}?tab=${item.key}`}
              className={cn("tab-pill flex items-center gap-1", tab === item.key && "tab-pill-active")}
            >
              <Icon name={item.icon} size={13} />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* 无派主（招募派主中）：招募横幅，提升申请入口可发现性 */}
      {!faction.leaderId ? (
        <Link
          href={`${path}?tab=about`}
          className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-dashed border-brand/50 bg-brand-soft/50 px-4 py-2.5"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon name="flag" size={15} className="shrink-0 text-brand-dark" />
            <span className="truncate text-[12px] font-bold text-brand-dark">
              本派正在招募派主 · 老派主回来带队
            </span>
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-brand-dark">
            了解详情 →
          </span>
        </Link>
      ) : null}

      <div className="mt-3">
        <QueryNotice ok={query.ok} error={query.error} />
      </div>

      <div className="mt-3">
        {tab === "posts" ? (
          // PostsTab 只需 id：传完整 getCurrentUser 对象会把 passwordHash/email 序列化进 flight 载荷
          <PostsTab factionId={faction.id} slug={faction.slug} path={path} user={user ? { id: user.id } : null} isMember={isMember} isManager={isManager} verified={isVerifiedAnywhere} factionName={faction.name} />
        ) : null}
        {tab === "activities" ? (
          // 同 PostsTab：传收窄 user，避免组件内部 getCurrentUser 全量对象进 flight 调试载荷
          <ActivitiesTab factionId={faction.id} companyId={faction.companyId} slug={faction.slug} path={path} user={user ? { id: user.id } : null} isMember={isMember} isManager={isManager} isVerifiedAnywhere={isVerifiedAnywhere} />
        ) : null}
        {tab === "members" ? <MembersTab factionId={faction.id} slug={faction.slug} companyId={faction.companyId} companyName={faction.company.shortName} leaderId={faction.leaderId} allowCrossCompany={faction.allowCrossCompany} canView={canViewMembers} hasUser={Boolean(user)} viewRequestPending={Boolean(viewRequestPending)} /> : null}
        {tab === "about" ? (
          <AboutTab
            faction={faction}
            isMember={isMember}
            isManager={isManager}
            pendingApplication={Boolean(pendingApplication)}
            path={path}
            user={Boolean(user)}
            isVerifiedAnywhere={isVerifiedAnywhere}
            isCrossCompany={isCrossCompany}
            applyRole={applyRole}
            canApplyLeaderRole={canApplyLeaderRole}
          />
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------- 动态 ---------------------------------- */

async function PostsTab({
  factionId,
  slug,
  path,
  user,
  isMember,
  isManager,
  verified,
  factionName,
}: {
  factionId: string;
  slug: string;
  path: string;
  user: { id: string } | null;
  isMember: boolean;
  isManager: boolean;
  verified: boolean;
  factionName: string;
}) {
  // 动态流 = 帖子 + 活动贴混排：置顶（帖子与活动都算）最前，其余按发布时间倒序
  const [factionRow, posts, activities] = await Promise.all([
    prisma.faction.findUnique({ where: { id: factionId }, select: { companyId: true } }),
    prisma.post.findMany({
      where: { factionId, status: "PUBLISHED" },
      include: {
        author: { select: IDENTIFIED_USER },
        faction: { include: { company: true } },
      },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 30,
    }),
    prisma.activity.findMany({
      where: { factionId },
      include: {
        creator: {
          select: {
            ...PUBLIC_USER,
            employments: {
              where: { status: "VERIFIED" },
              select: { companyId: true, kind: true, company: { select: { shortName: true } } },
            },
          },
        },
        signups: { where: { status: "GOING" }, include: { user: { select: PUBLIC_USER } }, take: 8 },
      },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 30,
    }),
  ]);
  const factionCompanyId = factionRow?.companyId ?? null;

  // 帖子作者附带认证身份（公司 + 在职/离职），同派公司优先
  const postRows = posts.map((post) => withPostIdentity(post, post.faction.companyId));

  // 活动发起人同样收窄为身份快照，字段形状与 ActivitiesTab 保持一致供共用卡片渲染
  const activityRows = activities.map(({ creator, ...activity }) => {
    const { employments, ...author } = creator;
    return {
      ...activity,
      creator: { ...author, identity: pickUserIdentity(employments, factionCompanyId) },
    };
  });

  const [likedIds, mySignups] = await Promise.all([
    user && posts.length
      ? prisma.postLike
          .findMany({
            where: { userId: user.id, postId: { in: posts.map((post) => post.id) } },
            select: { postId: true },
          })
          .then((rows) => rows.map((item) => item.postId))
      : Promise.resolve([] as string[]),
    user && activityRows.length
      ? prisma.activitySignup.findMany({
          where: { userId: user.id, activityId: { in: activityRows.map((item) => item.id) } },
          select: { activityId: true, status: true },
        })
      : Promise.resolve([] as { activityId: string; status: string }[]),
  ]);
  const goingSet = new Set(
    mySignups.filter((item) => item.status === "GOING").map((item) => item.activityId),
  );

  const feed = [
    ...postRows.map((post) => ({ kind: "post" as const, createdAt: post.createdAt, pinned: post.pinned, post })),
    ...activityRows.map((activity) => ({
      kind: "activity" as const,
      createdAt: activity.createdAt,
      pinned: activity.pinned,
      activity,
    })),
  ].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="space-y-3">
      {user && isMember ? (
        <PostComposer factionId={factionId} factionName={factionName} isLeader={isManager} />
      ) : (
        <div className="card flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <p className="text-[12px] text-ink-mute">
            {!user
              ? "登录并加入本派后即可发帖"
              : !verified
                ? "完成公司身份认证后才能加入并发帖"
                : "加入本派后即可发帖互动"}
          </p>
          <Link
            href={!user ? `/login?next=${encodeURIComponent(path)}` : verified ? `${path}` : "/verify"}
            className="btn-ghost btn-sm"
          >
            {!user ? "去登录" : verified ? "加入本派" : "去认证"}
          </Link>
        </div>
      )}

      {feed.length ? (
        feed.map((item) =>
          item.kind === "post" ? (
            <PostCard
              key={item.post.id}
              post={item.post}
              liked={likedIds.includes(item.post.id)}
              redirectTo={`${path}?tab=posts`}
              showFaction={false}
              showAuthorCompany
            />
          ) : (
            <ActivityFeedCard
              key={item.activity.id}
              activity={item.activity}
              slug={slug}
              isMember={isMember}
              isManager={isManager}
              currentUserId={user?.id}
              going={goingSet.has(item.activity.id)}
              path={path}
              signedIn={Boolean(user)}
              isVerified={verified}
            />
          ),
        )
      ) : (
        <div className="card">
          <EmptyState
            icon="message"
            title="还没有动态"
            desc={isMember ? "由你来开个头，约一场周末活动" : "加入本派后就能看到并参与讨论"}
            actionLabel={isMember ? undefined : "先加入本派"}
            actionHref={isMember ? undefined : `/factions/${slug}`}
          />
        </div>
      )}
    </div>
  );
}

/* --------------------------------- 活动 ---------------------------------- */

async function ActivitiesTab({
  factionId,
  companyId,
  slug,
  path,
  user,
  isMember,
  isManager,
  isVerifiedAnywhere,
}: {
  factionId: string;
  companyId: string;
  slug: string;
  path: string;
  user: { id: string } | null;
  isMember: boolean;
  isManager: boolean;
  isVerifiedAnywhere: boolean;
}) {
  const activities = await prisma.activity.findMany({
    where: { factionId },
    include: {
      creator: {
        select: {
          ...PUBLIC_USER,
          employments: {
            where: { status: "VERIFIED" },
            select: { companyId: true, kind: true, company: { select: { shortName: true } } },
          },
        },
      },
      signups: { where: { status: "GOING" }, include: { user: { select: PUBLIC_USER } }, take: 8 },
    },
    orderBy: [{ pinned: "desc" }, { startAt: "asc" }],
  });

  // 发起人展示认证身份（公司 + 在职/离职），同公司优先
  const activityRows = activities.map(({ creator, ...activity }) => {
    const { employments, ...author } = creator;
    return {
      ...activity,
      creator: { ...author, identity: pickUserIdentity(employments, companyId) },
    };
  });

  const mySignups = user
    ? await prisma.activitySignup.findMany({
        where: { userId: user.id, activityId: { in: activityRows.map((item) => item.id) } },
      })
    : [];
  const goingSet = new Set(
    mySignups.filter((item) => item.status === "GOING").map((item) => item.activityId),
  );

  // 所有成员都能发起活动，派主 / 副派主可管理全部，成员只管自己的
  const activitiesPath = `${path}?tab=activities`;
  const createForm = isMember ? (
    <Disclosure
      className="card p-4"
      summaryClassName="flex items-center justify-between"
      summary={
        <>
          <span className="text-[13px] font-bold text-ink">发起新活动</span>
          <span className="flex items-center gap-0.5 text-[11px] font-semibold text-brand">
            填写信息 <Icon name="right" size={12} />
          </span>
        </>
      }
    >
      <p className="mt-1 text-[11px] text-ink-mute">
        发布后会通知全派成员，你可以随时修改或取消自己发起的活动
      </p>
      <ActivityForm
        mode="create"
        factionId={factionId}
        slug={slug}
        redirectTo={activitiesPath}
        isManager={isManager}
      />
    </Disclosure>
  ) : null;

  if (!activityRows.length) {
    return (
      <div className="space-y-3">
        {createForm}
        <div className="card">
          <EmptyState
            icon="calendar"
            title="暂无活动安排"
            desc={isMember ? "在上方发起第一场线下活动，一键通知全派" : "加入本派后就可以发起活动"}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {createForm}

      {isManager ? (
        <Link
          href={`/factions/${slug}/manage?tab=activities`}
          className="flex items-center justify-between rounded-xl bg-ink px-4 py-2.5 text-white"
        >
          <span className="text-[12px] font-semibold">派主可管理本派全部活动</span>
          <span className="flex items-center gap-0.5 text-[11px] text-white/70">
            管理台 <Icon name="right" size={12} />
          </span>
        </Link>
      ) : null}

      {activityRows.map((activity) => (
        <ActivityFeedCard
          key={activity.id}
          activity={activity}
          slug={slug}
          isMember={isMember}
          isManager={isManager}
          currentUserId={user?.id}
          going={goingSet.has(activity.id)}
          path={path}
          signedIn={Boolean(user)}
          isVerified={isVerifiedAnywhere}
        />
      ))}
    </div>
  );
}

/* --------------------------------- 成员 ---------------------------------- */

async function MembersTab({
  factionId,
  slug,
  companyId,
  companyName,
  leaderId,
  allowCrossCompany,
  canView,
  hasUser,
  viewRequestPending,
}: {
  factionId: string;
  slug: string;
  companyId: string;
  companyName: string;
  leaderId: string | null;
  allowCrossCompany: boolean;
  canView: boolean;
  hasUser: boolean;
  viewRequestPending: boolean;
}) {
  // 查看门禁：非派主/副派主且未获查看授权时，仅呈现提示与申请入口，不查询成员数据
  if (!canView) {
    return (
      <div className="card px-4 py-8 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-cream-sunk text-ink-mute">
          <Icon name="users" size={18} />
        </span>
        <p className="mt-3 text-[13px] font-bold text-ink">目前成员仅供已加入该派成员查看</p>
        {!hasUser ? (
          <p className="mt-1.5 text-[11.5px] text-ink-mute">
            登录后即可申请查看本派成员列表
          </p>
        ) : viewRequestPending ? (
          <>
            <p className="mt-1.5 text-[11.5px] text-ink-mute">
              查看申请已提交，等待{leaderId ? "派主" : "运营"}审核
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <form action={cancelMemberViewAction}>
                <input type="hidden" name="factionId" value={factionId} />
                <input type="hidden" name="slug" value={slug} />
                <SubmitButton className="btn-quiet btn-sm" pendingText="…">
                  撤回申请
                </SubmitButton>
              </form>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1.5 text-[11.5px] text-ink-mute">
              {leaderId
                ? "向派主提交查看申请，审核通过后即可查看本派成员列表"
                : "该派暂无派主，向运营提交查看申请，审核通过后即可查看本派成员列表"}
            </p>
            <form action={requestMemberViewAction} className="mt-4">
              <input type="hidden" name="factionId" value={factionId} />
              <input type="hidden" name="slug" value={slug} />
              <SubmitButton className="btn-primary btn-sm" pendingText="提交中…">
                申请查看权限
              </SubmitButton>
            </form>
          </>
        )}
      </div>
    );
  }

  const members = await prisma.factionMember.findMany({
    where: { factionId, status: "ACTIVE" },
    include: { user: { select: PUBLIC_USER } },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
  });

  const kinds = await prisma.employment.findMany({
    where: {
      companyId,
      status: "VERIFIED",
      userId: { in: members.map((item) => item.userId) },
    },
    select: { userId: true, kind: true, title: true },
  });
  const kindMap = new Map(kinds.map((item) => [item.userId, item]));

  // 跨公司成员：查其在其他公司的认证
  const memberIdsWithoutLocalKind = members
    .filter((m) => !kindMap.has(m.userId))
    .map((m) => m.userId);
  const otherEmployments = memberIdsWithoutLocalKind.length
    ? await prisma.employment.findMany({
        where: {
          userId: { in: memberIdsWithoutLocalKind },
          companyId: { not: companyId },
          status: "VERIFIED",
        },
        select: { userId: true, company: { select: { shortName: true } } },
      })
    : [];
  // 成员仅展示其认证公司（不展示在职/离职）
  const otherMap = new Map<string, string>();
  for (const oe of otherEmployments) {
    if (!otherMap.has(oe.userId)) {
      otherMap.set(oe.userId, oe.company.shortName);
    }
  }

  const pendingCount = await prisma.factionMember.count({
    where: { factionId, status: "PENDING" },
  });

  if (!members.length) {
    return (
      <div className="card">
        <EmptyState icon="users" title="还没有成员" desc="通过运营审核后，成员会陆续加入" />
      </div>
    );
  }

  return (
    <div className="card divide-y divide-ink-line/60">
      {pendingCount > 0 ? (
        <div className="flex items-center gap-2 px-4 py-2.5 text-[11px] text-[#9A6B00]">
          <Icon name="shield" size={13} />
          还有 {pendingCount} 条加入申请等待{leaderId ? "派主" : "运营"}审批
        </div>
      ) : null}
      {members.map((member) => {
        const roleMeta = MEMBER_ROLE[member.role as keyof typeof MEMBER_ROLE] ?? MEMBER_ROLE.MEMBER;
        const kind = kindMap.get(member.userId);
        const other = otherMap.get(member.userId);
        return (
          <div key={member.id} className="flex items-center gap-3 px-4 py-3">
            <UserAvatar id={member.user.id} name={member.user.nickname} color={member.user.avatarColor} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] font-bold text-ink">{member.user.nickname}</span>
                {member.userId === leaderId ? <Badge tone="brand">派主</Badge> : null}
                {member.role !== "LEADER" ? (
                  <Badge tone={roleMeta.tone as "violet" | "mute"}>{roleMeta.label}</Badge>
                ) : null}
                {kind ? (
                  <Badge tone="ok">{companyName}</Badge>
                ) : other ? (
                  <Badge tone="violet">{other}</Badge>
                ) : (
                  <Badge tone="mute">未认证</Badge>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-ink-mute">
                {kind?.title ?? (other ? `${other} 成员` : "成员")} · {MEMBER_STATUS[member.status as keyof typeof MEMBER_STATUS] ?? ""}于{" "}
                {formatDate(member.joinedAt)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------- 关于 ---------------------------------- */

function AboutTab({
  faction,
  isMember,
  isManager,
  pendingApplication,
  path,
  user,
  isVerifiedAnywhere,
  isCrossCompany,
  applyRole,
  canApplyLeaderRole,
}: {
  faction: {
    id: string;
    description: string;
    allowCrossCompany: boolean;
    leader: { id: string; nickname: string; avatarColor: string; avatarImage: string | null; bio: string | null } | null;
    company: { name: string; shortName: string; color: string; logoText: string; industry: string };
    createdAt: Date;
  };
  isMember: boolean;
  isManager: boolean;
  pendingApplication: boolean;
  path: string;
  user: boolean;
  isVerifiedAnywhere: boolean;
  isCrossCompany: boolean;
  /** 当前可申请的岗位（派主 / 副派主），为空表示两者均已就位 */
  applyRole: "LEADER" | "ADMIN" | null;
  canApplyLeaderRole: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="card p-4">
        <h3 className="text-[13px] font-bold text-ink">派介绍</h3>
        <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-soft">
          {faction.description}
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-cream px-3 py-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-black text-white"
            style={{ background: faction.company.color }}
          >
            {faction.company.logoText}
          </span>
          <div>
            <p className="text-[11.5px] font-bold text-ink">{faction.company.name}</p>
            <p className="text-[10px] text-ink-mute">
              {faction.company.industry} ·{" "}
              {faction.allowCrossCompany
                ? `本公司在职/离职员工可加入，其他公司成员申请需${faction.leader ? "派主" : "运营"}审批`
                : "仅限该公司在职 / 离职员工加入"}
            </p>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="text-[13px] font-bold text-ink">派主</h3>
        {faction.leader ? (
          <div className="mt-2 flex items-start gap-2.5">
            <UserAvatar
              id={faction.leader.id}
              name={faction.leader.nickname}
              color={faction.leader.avatarColor}
              src={faction.leader.avatarImage}
              size="md"
            />
            <div>
              <p className="text-[12.5px] font-bold text-ink">
                {faction.leader.nickname}
                <Badge tone="brand" className="ml-1.5">
                  认证派主
                </Badge>
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-mute">
                {faction.leader.bio ?? "负责本派活动组织与内容治理"}
              </p>
            </div>
          </div>
        ) : (
          /* 无派主：招募派主主视觉块（标题 + 说明 + CTA） */
          <div className="mt-2 rounded-2xl border border-dashed border-brand/50 bg-brand-soft/40 p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80">
                <Icon name="flag" size={17} className="text-brand-dark" />
              </span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-black text-ink">
                  招募派主
                  <Badge tone="warn" className="ml-1.5">
                    虚位以待
                  </Badge>
                </p>
                <p className="text-[10.5px] text-ink-mute">本派暂无认证派主，正等待一位老派主回来带队</p>
              </div>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-soft">
              如果你是原厂这个兴趣派的组织者，或愿意把大家聚起来：完成公司身份认证并加入本派后，
              提交既往组织经验与运营计划即可申请派主认证，运营审核通过后派主身份全平台展示。
            </p>
            <div className="mt-2.5">
              {!user ? (
                <Link href={`/login?next=${encodeURIComponent(path)}`} className="btn-primary btn-sm">
                  登录后申请
                </Link>
              ) : !isVerifiedAnywhere ? (
                <Link href="/verify" className="btn-primary btn-sm">
                  先完成身份认证
                </Link>
              ) : isCrossCompany && !faction.allowCrossCompany && !isMember ? (
                <Link href="/verify" className="btn-ghost btn-sm">
                  认证 {faction.company.shortName} 后可加入并申请派主
                </Link>
              ) : !isMember ? (
                <form action={joinFactionAction} className="inline-flex">
                  <input type="hidden" name="factionId" value={faction.id ?? ""} />
                  <input type="hidden" name="slug" value={path.split("/")[2] ?? ""} />
                  <SubmitButton className="btn-primary btn-sm" pendingText="加入中…">
                    立即加入并申请派主
                  </SubmitButton>
                </form>
              ) : pendingApplication || isManager || !canApplyLeaderRole ? null : (
                <Link href={`${path}/apply`} className="btn-primary btn-sm">
                  <Icon name="flag" size={13} />
                  申请成为派主
                </Link>
              )}
            </div>
          </div>
        )}

        {/* 派主空缺时上方「招募派主」块已承担唯一申请入口，此处仅保留管理台 / 审核状态；有派主时提供副派主申请入口 */}
        <div className="mt-3">
          {isManager ? (
            <Link href={`${path}/manage`} className="btn-ghost btn-sm">
              <Icon name="settings" size={13} />
              进入管理台
            </Link>
          ) : pendingApplication ? (
            <Badge tone="warn">派主认证申请审核中</Badge>
          ) : faction.leader ? (
            !user ? (
              <Link href={`/login?next=${encodeURIComponent(path)}`} className="btn-ghost btn-sm">
                登录后申请
              </Link>
            ) : !isVerifiedAnywhere ? (
              <Link href="/verify" className="btn-ghost btn-sm">
                先完成身份认证
              </Link>
            ) : !isMember ? (
              <p className="text-[11px] text-ink-mute">加入本派后即可申请副派主认证</p>
            ) : applyRole === "ADMIN" ? (
              <Link href={`${path}/apply`} className="btn-primary btn-sm">
                <Icon name="flag" size={13} />
                申请副派主
              </Link>
            ) : (
              <p className="text-[11px] text-ink-mute">本派派主与副派主均已就位</p>
            )
          ) : null}
        </div>
      </div>

      <div className="card p-4">
        <h3 className="text-[13px] font-bold text-ink">派内约定</h3>
        <ul className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed text-ink-soft">
          <li>· 只聊兴趣，不发招聘、广告与内推链接。</li>
          <li>· 尊重在职 / 离职成员，不打听薪资与在职公司的敏感信息。</li>
          <li>· 线下活动以自愿为前提，费用 AA，安全第一。</li>
          <li>· 违规内容派主可直接隐藏，严重者运营会关闭账号。</li>
        </ul>
        <p className="mt-3 text-[10.5px] text-ink-mute">
          建派于 {formatDate(faction.createdAt)} · 由平台运营与派主共同维护
        </p>
      </div>

      {!isVerifiedAnywhere ? (
        <Notice
          message="该派仅限已完成公司身份认证的成员加入，先认证再来"
          tone="info"
        />
      ) : isCrossCompany && faction.allowCrossCompany && !isMember ? (
        <Notice
          message={`跨公司加入需${faction.leader ? "派主" : "运营"}审批，提交申请后请耐心等待`}
          tone="info"
        />
      ) : null}
    </div>
  );
}
