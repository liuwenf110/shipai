import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ADMIN_USER, PUBLIC_USER } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { CompanyBadge } from "@/components/CompanyBadge";
import { QueryNotice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { AdminFactionForm } from "@/components/admin/AdminFactionForm";
import {
  adminAssignFactionLeaderAction,
  adminUpdateFactionCompanyAction,
  adminReviewMemberAction,
  setFactionStatusAction,
} from "@/lib/actions/admin";
import { CATEGORY_LIST, categoryOf, FACTION_STATUS, MEMBER_ROLE, MEMBER_STATUS } from "@/lib/constants";
import { pickUserIdentity } from "@/lib/identity";
import { formatDate, timeAgo } from "@/lib/utils";
import { richTextToPlainText } from "@/lib/rich-text";

export default async function AdminFactionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const faction = await prisma.faction.findUnique({
    where: { id },
    include: {
      company: true,
      leader: { select: PUBLIC_USER },
      members: {
        where: { status: "ACTIVE" },
        include: { user: { select: ADMIN_USER } },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        take: 12,
      },
      posts: {
        orderBy: { createdAt: "desc" },
        take: 6,
        include: {
          author: {
            select: {
              ...ADMIN_USER,
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
      },
      _count: { select: { members: true, posts: true, activities: true } },
    },
  });

  if (!faction) notFound();

  // 待审加入申请
  const pendingMembers = await prisma.factionMember.findMany({
    where: { factionId: faction.id, status: "PENDING" },
    include: {
      user: { select: ADMIN_USER },
    },
    orderBy: { joinedAt: "asc" },
  });

  // 查询申请人的认证信息
  const pendingUserIds = pendingMembers.map((m) => m.userId);
  const pendingEmployments = pendingUserIds.length
    ? await prisma.employment.findMany({
        where: { userId: { in: pendingUserIds }, status: "VERIFIED" },
        include: { company: { select: { id: true, shortName: true } } },
      })
    : [];
  const pendingEmpMap = new Map<string, { companyId: string; shortName: string; kind: string }[]>();
  for (const pe of pendingEmployments) {
    const list = pendingEmpMap.get(pe.userId) ?? [];
    list.push({ companyId: pe.company.id, shortName: pe.company.shortName, kind: pe.kind });
    pendingEmpMap.set(pe.userId, list);
  }

  // 派主指派候选：合并「本派成员（任意状态）」与「待审/已通过的派主申请人」，
  // 按 userId 去重——保证申请过派主的人无论成员状态如何，运营都能在后台选到并直接指派
  const [companies, memberRows, applicantRows] = await Promise.all([
    prisma.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, shortName: true } }),
    prisma.factionMember.findMany({
      where: { factionId: faction.id },
      include: { user: { select: { id: true, nickname: true, status: true } } },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    }),
    prisma.leaderApplication.findMany({
      where: { factionId: faction.id, status: { in: ["PENDING", "APPROVED"] } },
      include: { user: { select: { id: true, nickname: true, status: true } } },
    }),
  ]);

  type LeaderCandidate = {
    userId: string;
    nickname: string;
    userStatus: string;
    role: string;
    memberStatus: string | null;
    applicant: boolean;
  };
  const candidateMap = new Map<string, LeaderCandidate>();
  for (const m of memberRows) {
    candidateMap.set(m.userId, {
      userId: m.userId,
      nickname: m.user.nickname,
      userStatus: m.user.status,
      role: m.role,
      memberStatus: m.status,
      applicant: false,
    });
  }
  for (const a of applicantRows) {
    const cur = candidateMap.get(a.userId);
    if (cur) cur.applicant = true;
    else
      candidateMap.set(a.userId, {
        userId: a.userId,
        nickname: a.user.nickname,
        userStatus: a.user.status,
        role: a.requestedRole,
        memberStatus: null,
        applicant: true,
      });
  }
  const leaderCandidates = [...candidateMap.values()];

  // 标记候选是否已认证本派所属公司，便于运营判断跨公司指派的合规性
  const candidateUserIds = leaderCandidates.map((item) => item.userId);
  const candidateVerified = candidateUserIds.length
    ? await prisma.employment.findMany({
        where: { userId: { in: candidateUserIds }, companyId: faction.companyId, status: "VERIFIED" },
        select: { userId: true },
      })
    : [];
  const sameCompanyUserIds = new Set(candidateVerified.map((item) => item.userId));
  const candidateUserIdSet = new Set(candidateUserIds);

  const meta = categoryOf(faction.category);
  const statusMeta =
    FACTION_STATUS[faction.status as keyof typeof FACTION_STATUS] ?? FACTION_STATUS.ACTIVE;
  const redirectTo = `/admin/factions/${faction.id}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link href="/admin/factions" className="btn-quiet btn-sm">
          ← 兴趣派列表
        </Link>
        <Link href={`/factions/${faction.slug}`} className="btn-quiet btn-sm">
          前台查看
        </Link>
      </div>

      <QueryNotice ok={query.ok} error={query.error} />

      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[22px]"
            style={{ backgroundImage: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}
          >
            {faction.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="text-[17px] font-black tracking-tight text-ink">{faction.name}</h1>
              <Badge tone={statusMeta.tone as "ok" | "warn" | "mute"}>{statusMeta.label}</Badge>
              <Badge tone="mute">{meta.label}</Badge>
              <Badge tone="ocean">{faction.joinMode === "OPEN" ? "自由加入" : "需审批"}</Badge>
              {faction.allowCrossCompany ? <Badge tone="violet">跨公司开放</Badge> : null}
            </div>
            <p className="mt-0.5 text-[11px] text-ink-mute">
              {faction.company.name} · 派主 {faction.leader?.nickname ?? "招募派主"} · 建派{" "}
              {formatDate(faction.createdAt)}
            </p>
            <p className="text-[10.5px] text-ink-mute">
              成员 {faction.memberCount}（记录 {faction._count.members}）· 动态{" "}
              {faction.postCount}（记录 {faction._count.posts}）· 活动 {faction._count.activities} ·
              链接 /factions/{faction.slug}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-ink-line/60 pt-3">
          {faction.status !== "ACTIVE" ? (
            <form action={setFactionStatusAction}>
              <input type="hidden" name="factionId" value={faction.id} />
              <input type="hidden" name="status" value="ACTIVE" />
              <SubmitButton className="btn-primary btn-sm" pendingText="…">
                上线运营
              </SubmitButton>
            </form>
          ) : null}
          {faction.status !== "ARCHIVED" ? (
            <form action={setFactionStatusAction}>
              <input type="hidden" name="factionId" value={faction.id} />
              <input type="hidden" name="status" value="ARCHIVED" />
              <SubmitButton className="btn-ghost btn-sm" pendingText="…">
                关闭该派
              </SubmitButton>
            </form>
          ) : null}
          {faction.status !== "REVIEWING" ? (
            <form action={setFactionStatusAction}>
              <input type="hidden" name="factionId" value={faction.id} />
              <input type="hidden" name="status" value="REVIEWING" />
              <SubmitButton className="btn-quiet btn-sm" pendingText="…">
                转回筹备
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="text-[13px] font-bold text-ink">编辑派资料</h2>
        <p className="mt-0.5 text-[10.5px] text-ink-mute">
          修改后前台立即生效；派链接（/factions/{faction.slug}）保持不变
        </p>
        <AdminFactionForm
          factionId={faction.id}
          categoryOptions={CATEGORY_LIST}
          defaults={{
            name: faction.name,
            tagline: faction.tagline,
            category: faction.category,
            joinMode: faction.joinMode,
            sortOrder: String(faction.sortOrder),
            allowCrossCompany: faction.allowCrossCompany,
          }}
        />
      </section>

      <section className="card p-4">
        <h2 className="text-[13px] font-bold text-ink">派主与所属公司</h2>
        <p className="mt-0.5 text-[10.5px] text-ink-mute">
          可从本派成员或派主申请人中指派（选中尚未成为正式成员的申请人会自动入派）；调整所属公司会改变“同公司”判定口径，请同步确认派主与成员的公司认证
        </p>
        <div className="mt-2.5 grid gap-3 md:grid-cols-2">
          <form action={adminAssignFactionLeaderAction} className="space-y-2">
            <input type="hidden" name="factionId" value={faction.id} />
            <label className="block">
              <span className="text-[10.5px] font-bold text-ink-mute">派主</span>
              <select
                name="leaderId"
                defaultValue={faction.leaderId ?? ""}
                className="input mt-1 py-2 text-[12px]"
              >
                <option value="">招募派主（无派主）</option>
                {/* 派主记录被移出等数据不一致场景下保留当前派主选项，避免误保存成「招募派主」 */}
                {faction.leader && !candidateUserIdSet.has(faction.leader.id) ? (
                  <option value={faction.leader.id}>
                    {faction.leader.nickname}（当前派主 · 非正式成员）
                  </option>
                ) : null}
                {leaderCandidates.map((candidate) => {
                  const roleMeta =
                    MEMBER_ROLE[candidate.role as keyof typeof MEMBER_ROLE] ?? MEMBER_ROLE.MEMBER;
                  // 非 ACTIVE 成员标注其成员状态；只要是派主申请人就额外标注（即使他已是正式成员）
                  const memberTag =
                    candidate.memberStatus && candidate.memberStatus !== "ACTIVE"
                      ? `（${MEMBER_STATUS[candidate.memberStatus as keyof typeof MEMBER_STATUS] ?? candidate.memberStatus}）`
                      : "";
                  const applicantTag = candidate.applicant ? "（派主申请人）" : "";
                  return (
                    <option key={candidate.userId} value={candidate.userId}>
                      {candidate.nickname} · {roleMeta.label}
                      {memberTag}
                      {applicantTag}
                      {sameCompanyUserIds.has(candidate.userId) ? "" : " · 未认证本公司"}
                      {candidate.userStatus === "DISABLED" ? " · 已禁用" : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <SubmitButton className="btn-primary btn-sm" pendingText="保存中…">
              保存派主
            </SubmitButton>
          </form>

          <form action={adminUpdateFactionCompanyAction} className="space-y-2">
            <input type="hidden" name="factionId" value={faction.id} />
            <label className="block">
              <span className="text-[10.5px] font-bold text-ink-mute">所属公司</span>
              <select
                name="companyId"
                defaultValue={faction.companyId}
                className="input mt-1 py-2 text-[12px]"
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}（{company.shortName}）
                  </option>
                ))}
              </select>
            </label>
            <SubmitButton className="btn-ghost btn-sm" pendingText="保存中…">
              保存所属公司
            </SubmitButton>
          </form>
        </div>
      </section>

      {/* 待审加入申请 */}
      {pendingMembers.length > 0 ? (
        <section className="card">
          <div className="flex items-center justify-between border-b border-ink-line/60 px-4 py-2.5">
            <h2 className="text-[13px] font-bold text-ink">待审加入申请</h2>
            <span className="text-[11px] text-ink-mute">{pendingMembers.length} 条</span>
          </div>
          <div className="divide-y divide-ink-line/60">
            {pendingMembers.map((pm) => {
              const emps = pendingEmpMap.get(pm.userId) ?? [];
              // 用 companyId 判"同公司"：shortName 无唯一约束，重名会漏判跨公司徽章
              const localEmp = emps.find((e) => e.companyId === faction.companyId);
              const isCross = !localEmp && emps.length > 0;
              return (
                <div key={pm.id} className="flex items-center gap-2.5 px-4 py-3">
                  <Avatar name={pm.user.nickname} color={pm.user.avatarColor} size="xs" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-[12px] font-bold text-ink">
                      {pm.user.nickname}
                      {isCross ? <Badge tone="violet">跨公司</Badge> : null}
                    </p>
                    <p className="text-[10.5px] text-ink-mute">
                      {pm.user.email ?? pm.user.phone ?? "未绑定账号"} ·{" "}
                      {timeAgo(pm.appliedAt ?? pm.joinedAt)}申请
                      {emps.length > 0 ? ` · 已认证：${emps.map((e) => `${e.shortName}(${e.kind === "ALUMNI" ? "离职" : "在职"})`).join("、")}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <form action={adminReviewMemberAction}>
                      <input type="hidden" name="memberId" value={pm.id} />
                      <input type="hidden" name="factionId" value={faction.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <SubmitButton className="btn-primary btn-sm" pendingText="…">通过</SubmitButton>
                    </form>
                    <form action={adminReviewMemberAction}>
                      <input type="hidden" name="memberId" value={pm.id} />
                      <input type="hidden" name="factionId" value={faction.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <SubmitButton className="btn-quiet btn-sm" pendingText="…">拒绝</SubmitButton>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card">
          <div className="border-b border-ink-line/60 px-4 py-2.5">
            <h2 className="text-[13px] font-bold text-ink">核心成员</h2>
          </div>
          {faction.members.length ? (
            <div className="divide-y divide-ink-line/60">
              {faction.members.map((member) => {
                const roleMeta =
                  MEMBER_ROLE[member.role as keyof typeof MEMBER_ROLE] ?? MEMBER_ROLE.MEMBER;
                return (
                  <div key={member.id} className="flex items-center gap-2 px-4 py-2">
                    <Avatar name={member.user.nickname} color={member.user.avatarColor} size="xs" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admin/users/${member.user.id}`}
                        className="truncate text-[12px] font-bold text-ink hover:text-brand"
                      >
                        {member.user.nickname}
                      </Link>
                      <p className="text-[10px] text-ink-mute">加入于 {formatDate(member.joinedAt)}</p>
                    </div>
                    <Badge tone={roleMeta.tone as "brand" | "violet" | "mute"}>{roleMeta.label}</Badge>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-[11.5px] text-ink-mute">还没有成员</p>
          )}
        </section>

        <section className="card">
          <div className="flex items-center justify-between border-b border-ink-line/60 px-4 py-2.5">
            <h2 className="text-[13px] font-bold text-ink">最近动态</h2>
            <Link href={`/factions/${faction.slug}`} className="text-[11px] font-semibold text-brand">
              派内主页
            </Link>
          </div>
          {faction.posts.length ? (
            <div className="divide-y divide-ink-line/60">
              {faction.posts.map((post) => (
                <div key={post.id} className="px-4 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/posts/${post.id}`}
                      className="truncate text-[12px] font-bold text-ink hover:text-brand"
                    >
                      {post.title ?? richTextToPlainText(post.content).slice(0, 16)}
                    </Link>
                    {post.status !== "PUBLISHED" ? <Badge tone="mute">已隐藏</Badge> : null}
                    <span className="text-[10px] text-ink-mute">{timeAgo(post.createdAt)}</span>
                  </div>
                  <p className="flex flex-wrap items-center gap-1 text-[10px] text-ink-mute">
                    <span>{post.author.nickname}</span>
                    <CompanyBadge
                      identity={pickUserIdentity(post.author.employments, faction.companyId)}
                      showKind={false}
                      showUnverified
                    />
                    <span>· 赞 {post.likeCount} · 评论 {post.commentCount}</span>
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-[11.5px] text-ink-mute">还没有发布内容</p>
          )}
        </section>
      </div>
    </div>
  );
}
