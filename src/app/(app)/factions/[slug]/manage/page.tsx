import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { IDENTIFIED_USER, PUBLIC_USER } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { CompanyBadge } from "@/components/CompanyBadge";
import { Icon } from "@/components/Icon";
import { QueryNotice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { EmptyState } from "@/components/Section";
import {
  closeActivityAction,
  createActivityAction,
  deleteActivityAction,
  moderatePostAction,
  removeMemberAction,
  reviewMemberAction,
  reviewMemberViewAction,
  setMemberRoleAction,
  toggleActivityPinAction,
  transferLeaderAction,
  archiveFactionAction,
} from "@/lib/actions/faction";
import { ConfirmSubmit } from "@/components/content/ConfirmSubmit";
import { ActivityForm } from "@/components/faction/ActivityForm";
import { Disclosure } from "@/components/Disclosure";
import { CopyInviteLink } from "@/components/faction/CopyInviteLink";
import { FactionSettingsForm } from "@/components/faction/FactionSettingsForm";
import { LeaderPhotoForm } from "@/components/faction/LeaderPhotoForm";
import { InviteRequestForm } from "@/components/faction/InviteRequestForm";
import { inviteStateOf } from "@/lib/invite";
import { categoryOf, EMPLOYMENT_KIND, MEMBER_STATUS } from "@/lib/constants";
import { pickUserIdentity } from "@/lib/identity";
import { withPostIdentity } from "@/lib/revive";
import { capacityLabel, cn, formatActivityTime, formatDate, timeAgo, toDateTimeLocal } from "@/lib/utils";
import { richTextToPlainText } from "@/lib/rich-text";

export const metadata = { title: "派主管理台" };

const TABS = [
  { key: "members", label: "成员" },
  { key: "posts", label: "内容" },
  { key: "activities", label: "活动" },
  { key: "settings", label: "设置" },
];

export default async function ManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const tab = TABS.some((item) => item.key === query.tab) ? query.tab! : "members";
  const path = `/factions/${slug}/manage`;

  const user = await requireUser(path);
  const faction = await prisma.faction.findUnique({
    where: { slug },
    include: { company: true, leader: { select: PUBLIC_USER } },
  });
  if (!faction) notFound();

  const membership = await prisma.factionMember.findUnique({
    where: { factionId_userId: { factionId: faction.id, userId: user.id } },
  });

  if (!membership || membership.status !== "ACTIVE" || membership.role === "MEMBER") {
    redirect(`/factions/${slug}?error=${encodeURIComponent("只有认证派主 / 副派主可以进入管理台")}`);
  }

  const [memberRows, postRows, activitiesRaw, pendingCount, inviteRows, viewRequestRows] = await Promise.all([
    prisma.factionMember.findMany({
      where: { factionId: faction.id, status: { in: ["ACTIVE", "PENDING"] } },
      include: { user: { select: PUBLIC_USER } },
      orderBy: [{ status: "desc" }, { role: "asc" }, { joinedAt: "asc" }],
    }),
    prisma.post.findMany({
      where: { factionId: faction.id, status: { not: "DELETED" } },
      include: { author: { select: IDENTIFIED_USER } },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 40,
    }),
    prisma.activity.findMany({
      where: { factionId: faction.id },
      include: {
        signups: { where: { status: "GOING" } },
        creator: {
          select: {
            nickname: true,
            employments: {
              where: { status: "VERIFIED" },
              select: { companyId: true, kind: true, company: { select: { shortName: true } } },
            },
          },
        },
      },
      orderBy: [{ pinned: "desc" }, { startAt: "desc" }],
      take: 20,
    }),
    prisma.factionMember.count({ where: { factionId: faction.id, status: "PENDING" } }),
    prisma.inviteCode.findMany({
      where: { factionId: faction.id },
      include: { usedBy: { select: { nickname: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.memberViewRequest.findMany({
      where: { factionId: faction.id, status: "PENDING" },
      include: { user: { select: PUBLIC_USER } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // 待办合计：加入申请 + 成员列表查看申请，共用头部/导航徽标
  const pendingTotal = pendingCount + viewRequestRows.length;

  const pendingInvite = inviteRows.find((item) => item.status === "PENDING") ?? null;

  // 发起人展示认证身份（公司 + 在职/离职），同公司优先
  const activityRows = activitiesRaw.map(({ creator, ...activity }) => {
    const { employments, ...author } = creator;
    return {
      ...activity,
      creator: { ...author, identity: pickUserIdentity(employments, faction.companyId) },
    };
  });

  // 帖子作者同样展示认证身份
  const postCards = postRows.map((post) => withPostIdentity(post, faction.companyId));

  const kinds = await prisma.employment.findMany({
    where: {
      companyId: faction.companyId,
      status: "VERIFIED",
      userId: { in: memberRows.map((item) => item.userId) },
    },
    select: { userId: true, kind: true },
  });
  const kindMap = new Map(kinds.map((item) => [item.userId, item.kind]));
  const alumniCount = kinds.filter((item) => item.kind === "ALUMNI").length;

  // 跨公司成员/申请人：查其在其他公司的认证
  const userIdsWithoutLocal = memberRows
    .filter((m) => !kindMap.has(m.userId))
    .map((m) => m.userId);
  const otherEmployments = userIdsWithoutLocal.length
    ? await prisma.employment.findMany({
        where: {
          userId: { in: userIdsWithoutLocal },
          companyId: { not: faction.companyId },
          status: "VERIFIED",
        },
        select: { userId: true, kind: true, company: { select: { shortName: true } } },
      })
    : [];
  const otherMap = new Map<string, { shortName: string; kind: string }[]>();
  for (const oe of otherEmployments) {
    const list = otherMap.get(oe.userId) ?? [];
    list.push({ shortName: oe.company.shortName, kind: oe.kind });
    otherMap.set(oe.userId, list);
  }
  const meta = categoryOf(faction.category);
  const isLeader = faction.leaderId === user.id;
  const transferCandidates = memberRows.filter(
    (item) => item.status === "ACTIVE" && item.userId !== user.id,
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-4">
      <Link
        href={`/factions/${slug}`}
        className="flex items-center gap-1 text-[12px] font-semibold text-ink-mute hover:text-ink"
      >
        <Icon name="back" size={14} />
        返回派主页
      </Link>

      {/* 头部 */}
      <div className="card mt-3 overflow-hidden">
        <div
          className="flex items-center gap-3 px-4 py-3.5"
          style={{ backgroundImage: `linear-gradient(120deg, ${meta.from}55, ${meta.to}33)` }}
        >
          <span
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/80 text-[20px]"
            style={{ boxShadow: "0 4px 14px -8px rgba(0,0,0,0.4)" }}
          >
            {faction.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="truncate text-[16px] font-black tracking-tight">{faction.name}</h1>
              <Badge tone={membership.role === "LEADER" ? "brand" : "violet"}>
                {membership.role === "LEADER" ? "派主" : "副派主"}
              </Badge>
            </div>
            <p className="mt-0.5 text-[11px] text-ink-mute">
              {faction.company.shortName} · {meta.label} · 建派于 {formatDate(faction.createdAt)}
            </p>
          </div>
          {pendingTotal > 0 ? (
            <Link
              href={`${path}?tab=members`}
              className="rounded-full bg-brand px-2.5 py-1 text-[10.5px] font-bold text-white"
            >
              {pendingTotal} 条待审批
            </Link>
          ) : null}
        </div>

        <div className="grid grid-cols-4 divide-x divide-ink-line/60 border-t border-ink-line/60">
          <Metric label="成员" value={faction.memberCount} />
          <Metric label="离职校友" value={alumniCount} />
          <Metric label="动态" value={faction.postCount} />
          <Metric label="活动" value={activityRows.length} />
        </div>

        <nav className="flex items-center gap-1 border-t border-ink-line/60 px-3 py-2">
          {TABS.map((item) => (
            <Link
              key={item.key}
              href={`${path}?tab=${item.key}`}
              className={cn("tab-pill", tab === item.key && "tab-pill-active")}
            >
              {item.label}
              {item.key === "members" && pendingTotal > 0 ? (
                <span className="ml-1 rounded-full bg-brand px-1 text-[9px] font-bold text-white">
                  {pendingTotal}
                </span>
              ) : null}
            </Link>
          ))}
          <Link href={`/factions/${slug}`} className="ml-auto text-[11px] font-semibold text-ink-mute">
            查看派主页 →
          </Link>
        </nav>
      </div>

      <div className="mt-3">
        <QueryNotice ok={query.ok} error={query.error} />
      </div>

      {/* 成员 */}
      {tab === "members" ? (
        <div className="mt-3 space-y-3">
          <section className="card">
            <div className="flex items-center justify-between border-b border-ink-line/60 px-4 py-2.5">
              <h2 className="text-[13px] font-bold text-ink">加入申请</h2>
              <span className="text-[11px] text-ink-mute">{pendingCount} 条待处理</span>
            </div>
            {memberRows.filter((item) => item.status === "PENDING").length ? (
              <div className="divide-y divide-ink-line/60">
                {memberRows
                  .filter((item) => item.status === "PENDING")
                  .map((member) => {
                    const localKind = kindMap.get(member.userId);
                    const crossInfo = otherMap.get(member.userId);
                    return (
                    <div key={member.id} className="flex items-center gap-2.5 px-4 py-3">
                      <Avatar name={member.user.nickname} color={member.user.avatarColor} src={member.user.avatarImage} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold text-ink">
                          {member.user.nickname}
                          {crossInfo ? <Badge tone="violet">跨公司申请</Badge> : null}
                          {member.role !== "MEMBER" ? (
                            <Badge tone="warn">
                              {member.role === "ADMIN" ? "曾任副派主" : "曾任派主"}
                            </Badge>
                          ) : null}
                        </p>
                        <p className="text-[10.5px] text-ink-mute">
                          {localKind
                            ? localKind === "ALUMNI" ? "离职校友" : "在职员工"
                            : crossInfo
                              ? `已认证：${crossInfo.map((c) => `${c.shortName}(${c.kind === "ALUMNI" ? "离职" : "在职"})`).join("、")}`
                              : ""}
                          {" · "}
                          {timeAgo(member.appliedAt ?? member.joinedAt)}申请
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <form action={reviewMemberAction}>
                          <input type="hidden" name="factionId" value={faction.id} />
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="memberId" value={member.id} />
                          <input type="hidden" name="decision" value="approve" />
                          <SubmitButton className="btn-primary btn-sm" pendingText="…">
                            通过
                          </SubmitButton>
                        </form>
                        <form action={reviewMemberAction}>
                          <input type="hidden" name="factionId" value={faction.id} />
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="memberId" value={member.id} />
                          <input type="hidden" name="decision" value="reject" />
                          <SubmitButton className="btn-quiet btn-sm" pendingText="…">
                            拒绝
                          </SubmitButton>
                        </form>
                      </div>
                    </div>
                    );
                  })}
              </div>
            ) : (
              <p className="px-4 py-5 text-center text-[11.5px] text-ink-mute">没有待审批的申请</p>
            )}
          </section>

          <section className="card">
            <div className="flex items-center justify-between border-b border-ink-line/60 px-4 py-2.5">
              <h2 className="text-[13px] font-bold text-ink">成员列表查看申请</h2>
              <span className="text-[11px] text-ink-mute">{viewRequestRows.length} 条待处理</span>
            </div>
            {viewRequestRows.length ? (
              <div className="divide-y divide-ink-line/60">
                {viewRequestRows.map((request) => {
                  const localKind = kindMap.get(request.userId);
                  const crossInfo = otherMap.get(request.userId);
                  return (
                    <div key={request.id} className="flex items-center gap-2.5 px-4 py-3">
                      <Avatar name={request.user.nickname} color={request.user.avatarColor} src={request.user.avatarImage} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold text-ink">
                          {request.user.nickname}
                          {crossInfo ? <Badge tone="violet">跨公司</Badge> : null}
                        </p>
                        <p className="text-[10.5px] text-ink-mute">
                          {localKind
                            ? localKind === "ALUMNI" ? "离职校友" : "在职员工"
                            : crossInfo
                              ? `已认证：${crossInfo.map((c) => `${c.shortName}(${c.kind === "ALUMNI" ? "离职" : "在职"})`).join("、")}`
                              : ""}
                          {" · "}
                          {timeAgo(request.createdAt)}申请查看成员列表
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <form action={reviewMemberViewAction}>
                          <input type="hidden" name="factionId" value={faction.id} />
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="requestId" value={request.id} />
                          <input type="hidden" name="decision" value="approve" />
                          <SubmitButton className="btn-primary btn-sm" pendingText="…">
                            通过
                          </SubmitButton>
                        </form>
                        <form action={reviewMemberViewAction}>
                          <input type="hidden" name="factionId" value={faction.id} />
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="requestId" value={request.id} />
                          <input type="hidden" name="decision" value="reject" />
                          <SubmitButton className="btn-quiet btn-sm" pendingText="…">
                            拒绝
                          </SubmitButton>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="px-4 py-5 text-center text-[11.5px] text-ink-mute">没有待审核的查看申请</p>
            )}
          </section>

          <section className="card">
            <div className="flex items-center justify-between border-b border-ink-line/60 px-4 py-2.5">
              <h2 className="text-[13px] font-bold text-ink">现有成员</h2>
              <span className="text-[11px] text-ink-mute">{faction.memberCount} 人</span>
            </div>
            <div className="divide-y divide-ink-line/60">
              {memberRows
                .filter((item) => item.status === "ACTIVE")
                .map((member) => {
                  const localKind = kindMap.get(member.userId);
                  const crossInfo = otherMap.get(member.userId);
                  return (
                  <div key={member.id} className="flex items-center gap-2.5 px-4 py-2.5">
                    <Avatar name={member.user.nickname} color={member.user.avatarColor} src={member.user.avatarImage} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-bold text-ink">
                        {member.user.nickname}
                        {member.role !== "MEMBER" ? (
                          <Badge tone={member.role === "LEADER" ? "brand" : "violet"}>
                            {member.role === "LEADER" ? "派主" : "副派主"}
                          </Badge>
                        ) : null}
                        {localKind ? (
                          <Badge tone={localKind === "ALUMNI" ? "mute" : "ok"}>
                            {EMPLOYMENT_KIND[localKind === "ALUMNI" ? "ALUMNI" : "ACTIVE"]?.short}
                          </Badge>
                        ) : crossInfo ? (
                          <Badge tone="violet">
                            {crossInfo[0].shortName}·{crossInfo[0].kind === "ALUMNI" ? "离职" : "在职"}
                          </Badge>
                        ) : null}
                      </p>
                      <p className="text-[10.5px] text-ink-mute">
                        {MEMBER_STATUS[member.status as keyof typeof MEMBER_STATUS]} · {formatDate(member.joinedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {isLeader && member.role !== "LEADER" ? (
                        <form action={setMemberRoleAction}>
                          <input type="hidden" name="factionId" value={faction.id} />
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="memberId" value={member.id} />
                          <input
                            type="hidden"
                            name="role"
                            value={member.role === "ADMIN" ? "MEMBER" : "ADMIN"}
                          />
                          <SubmitButton
                            className="text-[11px] font-semibold text-ink-mute hover:text-brand"
                            pendingText="…"
                          >
                            {member.role === "ADMIN" ? "取消副派主" : "设为副派主"}
                          </SubmitButton>
                        </form>
                      ) : null}
                      {member.userId !== user.id && member.role !== "LEADER" ? (
                        <form action={removeMemberAction}>
                          <input type="hidden" name="factionId" value={faction.id} />
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="memberId" value={member.id} />
                          <SubmitButton
                            className="text-[11px] font-semibold text-ink-mute hover:text-[#B42318]"
                            pendingText="…"
                          >
                            移出
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>
                  );
                })}
            </div>
          </section>
        </div>
      ) : null}

      {/* 内容 */}
      {tab === "posts" ? (
        <div className="mt-3 space-y-3">
          <div className="card px-4 py-3">
            <p className="text-[12px] leading-relaxed text-ink-soft">
              派主可置顶重要公告、隐藏不合适的内容；被隐藏的帖子仅成员之外不可见。发布新内容请返回
              <Link href={`/factions/${slug}?tab=posts`} className="mx-0.5 font-semibold text-brand">
                派主页
              </Link>
              。
            </p>
          </div>

          {postCards.length ? (
            postCards.map((post) => (
              <div key={post.id} className="card p-3.5">
                <div className="flex items-start gap-2.5">
                  <Avatar name={post.author.nickname} color={post.author.avatarColor} src={post.author.avatarImage} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[12.5px] font-bold text-ink">{post.author.nickname}</span>
                      <CompanyBadge
                        identity={post.author.identity}
                        showKind={false}
                        showUnverified
                      />
                      <span className="text-[10px] text-ink-mute">{timeAgo(post.createdAt)}</span>
                      {post.pinned ? <Badge tone="brand">置顶</Badge> : null}
                      {post.status === "HIDDEN" ? <Badge tone="bad">已隐藏</Badge> : null}
                      {post.kind === "ANNOUNCE" ? <Badge tone="mute">公告</Badge> : null}
                    </div>
                    {post.title ? (
                      <p className="mt-1 text-[12.5px] font-semibold text-ink">{post.title}</p>
                    ) : null}
                    <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-ink-soft">
                      {richTextToPlainText(post.content)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <form action={moderatePostAction}>
                        <input type="hidden" name="postId" value={post.id} />
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="action" value="pin" />
                        <SubmitButton className="btn-quiet btn-sm" pendingText="…">
                          {post.pinned ? "取消置顶" : "置顶"}
                        </SubmitButton>
                      </form>
                      <form action={moderatePostAction}>
                        <input type="hidden" name="postId" value={post.id} />
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="action" value="announce" />
                        <SubmitButton className="btn-quiet btn-sm" pendingText="…">
                          {post.kind === "ANNOUNCE" ? "取消公告" : "设为公告"}
                        </SubmitButton>
                      </form>
                      <form action={moderatePostAction}>
                        <input type="hidden" name="postId" value={post.id} />
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="action" value="hide" />
                        <SubmitButton className="btn-quiet btn-sm" pendingText="…">
                          {post.status === "HIDDEN" ? "恢复展示" : "隐藏"}
                        </SubmitButton>
                      </form>
                      <form action={moderatePostAction}>
                        <input type="hidden" name="postId" value={post.id} />
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="action" value="delete" />
                        <SubmitButton
                          className="text-[11px] font-semibold text-ink-mute hover:text-[#B42318]"
                          pendingText="…"
                        >
                          删除
                        </SubmitButton>
                      </form>
                      <Link
                        href={`/posts/${post.id}`}
                        className="ml-auto text-[11px] font-semibold text-ink-mute hover:text-brand"
                      >
                        查看详情 →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="card">
              <EmptyState icon="message" title="派内还没有内容" desc="去派主页发布第一条动态" />
            </div>
          )}
        </div>
      ) : null}

      {/* 活动 */}
      {tab === "activities" ? (
        <div className="mt-3 space-y-3">
          <section className="card p-4">
            <h2 className="text-[13px] font-bold text-ink">发起新活动</h2>
            <p className="mt-0.5 text-[11px] text-ink-mute">
              发布后会通知全派成员；派内任何成员都可以发起活动，派主可代为管理
            </p>
            <ActivityForm
              mode="create"
              factionId={faction.id}
              slug={slug}
              redirectTo={`/factions/${slug}/manage?tab=activities`}
              isManager
            />
          </section>

          {activityRows.length ? (
            activityRows.map((activity) => {
              const cancelled = activity.status === "CANCELLED";
              const ended = activity.startAt.getTime() < Date.now();
              return (
                <div key={activity.id} className="card p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-[13.5px] font-bold text-ink">{activity.title}</h3>
                    {activity.pinned ? <Badge tone="brand">置顶</Badge> : null}
                    <Badge
                      tone={cancelled ? "bad" : activity.status === "OPEN" && !ended ? "ok" : "mute"}
                    >
                      {cancelled
                        ? "已取消"
                        : ended
                          ? "已结束"
                          : activity.status === "OPEN"
                            ? "报名中"
                            : "已关闭"}
                    </Badge>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-ink-mute">
                    {formatActivityTime(activity.startAt)} · {activity.location} · 报名{" "}
                    {capacityLabel(activity.signups.length, activity.capacity)}
                    <span>· 发起人 {activity.creator.nickname}</span>
                    <CompanyBadge
                      identity={activity.creator.identity}
                      showKind={false}
                      showUnverified
                    />
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <form action={toggleActivityPinAction}>
                      <input type="hidden" name="activityId" value={activity.id} />
                      <input type="hidden" name="slug" value={slug} />
                      <input
                        type="hidden"
                        name="redirectTo"
                        value={`/factions/${slug}/manage?tab=activities`}
                      />
                      <SubmitButton className="btn-quiet btn-sm" pendingText="…">
                        {activity.pinned ? "取消置顶" : "置顶"}
                      </SubmitButton>
                    </form>
                    {!cancelled ? (
                      <form action={closeActivityAction}>
                        <input type="hidden" name="activityId" value={activity.id} />
                        <input type="hidden" name="slug" value={slug} />
                        <input
                          type="hidden"
                          name="redirectTo"
                          value={`/factions/${slug}/manage?tab=activities`}
                        />
                        <SubmitButton className="btn-quiet btn-sm" pendingText="…">
                          {activity.status === "OPEN" ? "关闭报名" : "重新开放"}
                        </SubmitButton>
                      </form>
                    ) : null}
                    <Link
                      href={`/factions/${slug}/activities/${activity.id}`}
                      className="btn-quiet btn-sm"
                    >
                      报名名单
                    </Link>
                    {!cancelled ? (
                      <form action={deleteActivityAction}>
                        <input type="hidden" name="activityId" value={activity.id} />
                        <input type="hidden" name="slug" value={slug} />
                        <input
                          type="hidden"
                          name="redirectTo"
                          value={`/factions/${slug}/manage?tab=activities`}
                        />
                        <ConfirmSubmit
                          confirmText="取消后报名全部作废并通知成员，确定吗？"
                          className="text-[11px] font-semibold text-ink-mute transition hover:text-[#B42318]"
                        >
                          取消活动
                        </ConfirmSubmit>
                      </form>
                    ) : null}
                    <Link
                      href={`/factions/${slug}?tab=activities`}
                      className="ml-auto text-[11px] font-semibold text-ink-mute hover:text-brand"
                    >
                      查看前台 →
                    </Link>
                  </div>

                  {!cancelled && activity.creatorId === user.id ? (
                    <Disclosure
                      className="mt-2.5 border-t border-ink-line/60 pt-2.5"
                      summaryClassName="text-[11px] font-semibold text-ink-mute hover:text-brand"
                      summary="编辑活动信息"
                    >
                      <ActivityForm
                        mode="update"
                        activityId={activity.id}
                        slug={slug}
                        redirectTo={`/factions/${slug}/manage?tab=activities`}
                        isManager
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
                  {!cancelled && activity.creatorId !== user.id ? (
                    <p className="mt-2.5 border-t border-ink-line/60 pt-2 text-[10.5px] text-ink-mute">
                      活动内容仅发起人本人可修改，你可以取消活动或开关报名
                    </p>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="card">
              <EmptyState icon="calendar" title="还没有活动" desc="在上方发起第一场线下活动" />
            </div>
          )}
        </div>
      ) : null}

      {/* 设置 */}
      {tab === "settings" ? (
        <div className="mt-3">
          <FactionSettingsForm
            factionId={faction.id}
            slug={slug}
            defaults={{
              name: faction.name,
              tagline: faction.tagline,
              description: faction.description,
              joinMode: faction.joinMode,
              allowCrossCompany: faction.allowCrossCompany,
            }}
          />

          {/* 派主照片：只有派主本人可传（副派主进得来管理台，但展示位上的派主只有一个），写入 User.avatarImage */}
          {faction.leaderId === user.id && faction.leader ? (
            <LeaderPhotoForm
              factionId={faction.id}
              slug={slug}
              defaults={{
                name: faction.leader.nickname,
                color: faction.leader.avatarColor,
                image: faction.leader.avatarImage,
              }}
            />
          ) : null}

          <div className="card mt-3 space-y-2.5 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[12px] font-bold text-ink">邀请新朋友</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-mute">
                  向运营申请邀请码，新朋友用它注册后自动加入本派；一码一人，30 天有效。
                </p>
              </div>
              <Badge tone="brand">邀请码</Badge>
            </div>

            {pendingInvite ? (
              <p className="rounded-xl bg-cream px-3 py-2 text-[11px] leading-relaxed text-ink-mute">
                申请审核中：{pendingInvite.note}（{timeAgo(pendingInvite.createdAt)}提交）
              </p>
            ) : (
              <InviteRequestForm factionId={faction.id} slug={slug} />
            )}

            {inviteRows.length ? (
              <div className="divide-y divide-ink-line/60 border-t border-ink-line/60">
                {inviteRows.map((invite) => {
                  const state = inviteStateOf(invite);
                  return (
                    <div key={invite.id} className="py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] text-ink-mute">{invite.note}</span>
                        {state === "READY" ? <Badge tone="ok">可使用</Badge> : null}
                        {state === "PENDING" ? <Badge tone="warn">审核中</Badge> : null}
                        {state === "USED" ? <Badge tone="mute">已使用</Badge> : null}
                        {state === "EXPIRED" ? <Badge tone="mute">已过期</Badge> : null}
                        {state === "REJECTED" ? <Badge tone="bad">未通过</Badge> : null}
                      </div>
                      {state === "READY" && invite.code ? (
                        <>
                          <p className="mt-1 font-mono text-[15px] font-black tracking-[0.2em] text-ink">
                            {invite.code}
                          </p>
                          <CopyInviteLink code={invite.code} />
                          <p className="mt-1 text-[10px] text-ink-mute">
                            {invite.expiresAt ? `${formatDate(invite.expiresAt)} 前有效` : ""}
                          </p>
                        </>
                      ) : null}
                      {state === "USED" ? (
                        <p className="mt-1 text-[10.5px] text-ink-mute">
                          {invite.usedBy?.nickname ?? "新成员"} 已通过该邀请码加入
                          {invite.usedAt ? ` · ${timeAgo(invite.usedAt)}` : ""}
                        </p>
                      ) : null}
                      {state === "REJECTED" && invite.reviewerNote ? (
                        <p className="mt-1 text-[10.5px] text-ink-mute">运营备注：{invite.reviewerNote}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl bg-cream px-3 py-2 text-[11px] text-ink-mute">
                还没有申请过邀请码
              </p>
            )}
          </div>

          {isLeader ? (
            <>
              <div className="card mt-3 p-4">
                <p className="text-[12px] font-bold text-ink">转让派主</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-mute">
                  转让后你将变回普通成员，新派主拥有全部管理权限，此操作不可撤销。
                </p>
                {transferCandidates.length ? (
                  <form action={transferLeaderAction} className="mt-2.5 flex items-end gap-2">
                    <input type="hidden" name="factionId" value={faction.id} />
                    <input type="hidden" name="slug" value={slug} />
                    <select name="memberId" required defaultValue="" className="input flex-1">
                      <option value="" disabled>
                        选择接班人
                      </option>
                      {transferCandidates.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.user.nickname}
                          {item.role === "ADMIN" ? "（副派主）" : ""}
                        </option>
                      ))}
                    </select>
                    <ConfirmSubmit
                      confirmText="确定把派主转让给该成员吗？转让后无法撤销"
                      className="btn-quiet btn-sm"
                    >
                      转让
                    </ConfirmSubmit>
                  </form>
                ) : (
                  <p className="mt-2 rounded-xl bg-cream px-3 py-2 text-[11px] text-ink-mute">
                    派内还没有其他正式成员，暂时无法转让。
                  </p>
                )}
              </div>

              <div className="mt-3 rounded-xl bg-white/70 p-4 ring-1 ring-ink-line/60">
                <p className="text-[12px] font-bold text-ink">关闭本派</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-mute">
                  关闭后本派将不再接收新内容与报名，全派活动自动取消，该操作不可撤销。如需更换所属公司也请先关闭重建。
                </p>
                <form action={archiveFactionAction} className="mt-2.5">
                  <input type="hidden" name="factionId" value={faction.id} />
                  <input type="hidden" name="slug" value={slug} />
                  <ConfirmSubmit
                    confirmText="关闭后派内内容将停止运营且无法恢复，确定关闭吗？"
                    className="btn-quiet btn-sm text-[#B42318]"
                  >
                    关闭「{faction.name}」
                  </ConfirmSubmit>
                </form>
              </div>
            </>
          ) : (
            <div className="mt-3 rounded-xl bg-white/70 p-4 ring-1 ring-ink-line/60">
              <p className="text-[12px] font-bold text-ink">派主交接与关闭</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-mute">
                只有派主本人可以转让派主或关闭本派，如需调整请联系派主。
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2 py-2.5 text-center">
      <p className="text-[16px] font-black leading-none text-ink">{value}</p>
      <p className="mt-1 text-[10px] text-ink-mute">{label}</p>
    </div>
  );
}
