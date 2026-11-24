import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ADMIN_USER } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Icon } from "@/components/Icon";
import { QueryNotice } from "@/components/Notice";
import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminUserActionButton } from "@/components/admin/AdminUserActionButton";
import { Disclosure } from "@/components/Disclosure";
import { adminResetPasswordAction, adminUpdateUserAction } from "@/lib/actions/admin";
import { withBasePath } from "@/lib/base-path";
import { EMPLOYMENT_KIND, EMPLOYMENT_STATUS, MEMBER_ROLE, MEMBER_STATUS } from "@/lib/constants";
import { isOnline, presenceOf } from "@/lib/presence";
import { cn, formatDate, formatDateTime, splitList, timeAgo } from "@/lib/utils";
import { richTextToPlainText } from "@/lib/rich-text";

const POST_STATUS: Record<string, { label: string; tone: "ok" | "mute" | "bad" }> = {
  PUBLISHED: { label: "已发布", tone: "ok" },
  HIDDEN: { label: "已隐藏", tone: "mute" },
  DELETED: { label: "已删除", tone: "bad" },
};

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const user = await prisma.user.findUnique({
    where: { id },
    omit: { passwordHash: true },
    include: {
      employments: { include: { company: true, reviewer: { select: ADMIN_USER } }, orderBy: { createdAt: "desc" } },
      memberships: {
        include: { faction: { include: { company: true } } },
        orderBy: { joinedAt: "desc" },
      },
      posts: {
        include: { faction: { include: { company: true } } },
        orderBy: { createdAt: "desc" },
        take: 8,
      },
      leaderApplications: {
        include: { faction: { include: { company: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      _count: { select: { posts: true, comments: true, sessions: true, activitySignups: true } },
      sessions: {
        select: { id: true, createdAt: true, lastSeenAt: true },
        orderBy: { lastSeenAt: "desc" },
      },
    },
  });

  if (!user) notFound();

  const now = Date.now();
  const presence = presenceOf(user.sessions, now);
  const onlineSessions = user.sessions.filter((item) => isOnline(item.lastSeenAt, now));

  const redirectTo = `/admin/users/${user.id}`;
  const disabled = user.status === "DISABLED";
  const verified = user.employments.filter((item) => item.status === "VERIFIED");
  const activeMemberships = user.memberships.filter((item) => item.status === "ACTIVE");
  const managedFactions = activeMemberships.filter((item) => item.role !== "MEMBER");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link href="/admin/users" className="btn-quiet btn-sm">
          ← 成员列表
        </Link>
      </div>

      <QueryNotice ok={query.ok} error={query.error} />

      <section className="card p-4">
        <div className="flex items-start gap-3">
          <Avatar name={user.nickname} color={user.avatarColor} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="text-[18px] font-black tracking-tight text-ink">{user.nickname}</h1>
              {user.role === "ADMIN" ? <Badge tone="violet">运营</Badge> : <Badge tone="mute">普通成员</Badge>}
              {disabled ? <Badge tone="bad">已禁用</Badge> : <Badge tone="ok">正常</Badge>}
              {presence.online ? <Badge tone="ok">在线</Badge> : <Badge tone="mute">离线</Badge>}
            </div>
            <p className="mt-0.5 text-[11.5px] text-ink-soft">
              {user.email ?? user.phone ?? "未绑定登录账号"}
              {user.email && user.phone ? ` · ${user.phone}` : ""}
            </p>
            {user.bio ? <p className="mt-1 text-[11.5px] text-ink-mute">{user.bio}</p> : null}
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10.5px] text-ink-mute md:grid-cols-4">
              <span>注册于 {formatDate(user.createdAt)}</span>
              <span>
                最近登录 {user.lastLoginAt ? timeAgo(user.lastLoginAt) : "从未登录"}
              </span>
              <span>认证公司 {verified.length} 家</span>
              <span>
                在线设备 {onlineSessions.length}/{user.sessions.length}
              </span>
              <span>发帖 {user._count.posts} 条</span>
              <span>评论 {user._count.comments} 条</span>
              <span>加入派 {activeMemberships.length} 个</span>
              <span>活动报名 {user._count.activitySignups} 次</span>
              <span className="col-span-2 md:col-span-4">
                {presence.lastSeenAt
                  ? `最后活跃 ${formatDateTime(presence.lastSeenAt)}（${timeAgo(presence.lastSeenAt)}）`
                  : "尚无访问记录（该账号从未登录过或记录早于在线统计上线）"}
              </span>
            </div>
            {disabled && user.disabledReason ? (
              <p className="mt-2 rounded-xl bg-[#FDECEC] px-3 py-2 text-[11.5px] text-[#B42318]">
                禁用原因：{user.disabledReason}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-3 space-y-2 border-t border-ink-line/60 pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <AdminUserActionButton
              userId={user.id}
              redirectTo={redirectTo}
              action={disabled ? "enable" : "disable"}
              className={disabled ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
              label={disabled ? "恢复账号" : "禁用账号"}
            />
            <AdminUserActionButton
              userId={user.id}
              redirectTo={redirectTo}
              action={user.role === "ADMIN" ? "demote" : "promote"}
              className="btn-quiet btn-sm"
              label={user.role === "ADMIN" ? "取消运营权限" : "设为运营"}
            />
            <AdminUserActionButton
              userId={user.id}
              redirectTo={redirectTo}
              action="kick"
              className="btn-quiet btn-sm"
              label={`强制下线（${user._count.sessions}）`}
            />
          </div>
          {!disabled ? (
            <AdminActionForm
              className="flex items-center gap-2"
              action={adminUpdateUserAction}
              hidden={{ userId: user.id, redirectTo, action: "disable" }}
              field={{
                name: "reason",
                placeholder: "禁用原因（会写进站内通知，展示给该成员）",
                className: "flex-1",
              }}
              buttons={[
                { label: "带原因禁用", className: "btn-ghost btn-sm", pendingText: "…" },
              ]}
            />
          ) : null}

          <Disclosure
            className="rounded-xl bg-cream px-3 py-2.5"
            summaryClassName="text-[11.5px] font-semibold text-ink-soft"
            summary="重置登录密码"
          >
            <AdminActionForm
              className="mt-2 flex items-center gap-2"
              action={adminResetPasswordAction}
              hidden={{ userId: user.id, redirectTo }}
              field={{
                name: "password",
                type: "password",
                placeholder: "新密码：至少 8 位，含字母与数字",
                minLength: 8,
                required: true,
                className: "flex-1",
              }}
              buttons={[{ label: "重置", className: "btn-quiet btn-sm", pendingText: "重置中…" }]}
            />
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-mute">
              重置后该用户所有设备立即下线，并收到站内通知；请通过安全渠道告知本人。
            </p>
          </Disclosure>
        </div>
      </section>

      <section className="card">
        <div className="border-b border-ink-line/60 px-4 py-2.5">
          <h2 className="text-[13px] font-bold text-ink">
            登录设备（在线 {onlineSessions.length} / 共 {user.sessions.length}）
          </h2>
        </div>
        {user.sessions.length ? (
          <div className="divide-y divide-ink-line/60">
            {user.sessions.map((session, index) => {
              const online = isOnline(session.lastSeenAt, now);
              return (
                <div key={session.id} className="flex flex-wrap items-center gap-1.5 px-4 py-2.5">
                  <span
                    className={cn("h-1.5 w-1.5 rounded-full", online ? "bg-moss" : "bg-ink-mute/40")}
                  />
                  <span className="text-[12px] font-bold text-ink">设备 {index + 1}</span>
                  <span className="font-mono text-[10px] text-ink-mute">{session.id.slice(0, 8)}</span>
                  {online ? <Badge tone="ok">在线</Badge> : <Badge tone="mute">离线</Badge>}
                  <span className="text-[10.5px] text-ink-mute">
                    {session.lastSeenAt
                      ? `最后活跃 ${formatDateTime(session.lastSeenAt)} · ${timeAgo(session.lastSeenAt)}`
                      : "尚无访问记录"}
                  </span>
                  <span className="text-[10.5px] text-ink-mute">
                    登录于 {formatDateTime(session.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-4 py-6 text-center text-[11.5px] text-ink-mute">该成员当前没有任何登录会话</p>
        )}
      </section>

      <section className="card">
        <div className="border-b border-ink-line/60 px-4 py-2.5">
          <h2 className="text-[13px] font-bold text-ink">身份认证记录</h2>
        </div>
        {user.employments.length ? (
          <div className="divide-y divide-ink-line/60">
            {user.employments.map((item) => {
              const statusMeta =
                EMPLOYMENT_STATUS[item.status as keyof typeof EMPLOYMENT_STATUS] ??
                EMPLOYMENT_STATUS.PENDING;
              const files = splitList(item.proofFiles).map(withBasePath);
              return (
                <div key={item.id} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded-[3px] text-[7px] font-black text-white"
                      style={{ background: item.company.color }}
                    >
                      {item.company.logoText}
                    </span>
                    <span className="text-[12px] font-bold text-ink">
                      {item.company.scope === "OUTSIDER"
                        ? (item.employerName ?? "非大厂认证")
                        : item.company.shortName}
                    </span>
                    <Badge tone="mute">
                      {EMPLOYMENT_KIND[item.kind as keyof typeof EMPLOYMENT_KIND]?.label}
                    </Badge>
                    <Badge tone={statusMeta.tone as "ok" | "warn" | "bad"}>{statusMeta.label}</Badge>
                    <Badge tone="ocean">{item.method === "EMAIL" ? "邮箱验证" : "材料审核"}</Badge>
                    <span className="text-[10px] text-ink-mute">提交于 {formatDateTime(item.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-[10.5px] text-ink-mute">
                    {item.workEmail ?? "无工作邮箱"}
                    {item.title ? ` · ${item.title}` : ""}
                    {item.startedYear || item.leftYear
                      ? ` · ${item.startedYear ?? "?"} - ${item.leftYear ?? "至今"}`
                      : ""}
                  </p>
                  {item.reviewerNote ? (
                    <p className="mt-1 text-[10.5px] text-ink-soft">
                      审核备注（{item.reviewer?.nickname ?? "运营"}）：{item.reviewerNote}
                    </p>
                  ) : null}
                  {files.length ? (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {files.map((file) => (
                        <a
                          key={file}
                          href={file}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg bg-cream px-2 py-1 text-[10px] font-semibold text-ink-soft hover:text-brand"
                        >
                          证明材料
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-4 py-6 text-center text-[11.5px] text-ink-mute">该成员还没有提交身份认证</p>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card">
          <div className="border-b border-ink-line/60 px-4 py-2.5">
            <h2 className="text-[13px] font-bold text-ink">兴趣派关系（{activeMemberships.length}）</h2>
          </div>
          {user.memberships.length ? (
            <div className="divide-y divide-ink-line/60">
              {user.memberships.map((item) => {
                const roleMeta =
                  MEMBER_ROLE[item.role as keyof typeof MEMBER_ROLE] ?? MEMBER_ROLE.MEMBER;
                const statusLabel =
                  MEMBER_STATUS[item.status as keyof typeof MEMBER_STATUS] ?? item.status;
                return (
                  <div key={item.id} className="flex items-center gap-2 px-4 py-2">
                    <span className="text-[15px]">{item.faction.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/factions/${item.faction.slug}`}
                        className="truncate text-[12px] font-bold text-ink hover:text-brand"
                      >
                        {item.faction.name}
                      </Link>
                      <p className="text-[10px] text-ink-mute">
                        {item.faction.company.shortName} · {statusLabel} · {formatDate(item.joinedAt)}
                      </p>
                    </div>
                    {/* 角色徽章仅对 ACTIVE 成员展示；移出保留原 role 后，REMOVED/LEFT 记录不能显示为现任副派主 */}
                    {item.status === "ACTIVE" ? (
                      <Badge tone={roleMeta.tone as "brand" | "violet" | "mute"}>{roleMeta.label}</Badge>
                    ) : (
                      <Badge tone="mute">{statusLabel}</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-[11.5px] text-ink-mute">还没有加入任何兴趣派</p>
          )}
        </section>

        <section className="card">
          <div className="border-b border-ink-line/60 px-4 py-2.5">
            <h2 className="text-[13px] font-bold text-ink">派主认证申请</h2>
          </div>
          {user.leaderApplications.length ? (
            <div className="divide-y divide-ink-line/60">
              {user.leaderApplications.map((item) => (
                <div key={item.id} className="px-4 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12px] font-bold text-ink">{item.faction.name}</span>
                    <Badge tone="mute">
                      {item.requestedRole === "LEADER" ? "派主" : "副派主"}
                    </Badge>
                    <Badge
                      tone={
                        item.status === "APPROVED"
                          ? "ok"
                          : item.status === "REJECTED"
                            ? "bad"
                            : "warn"
                      }
                    >
                      {item.status === "APPROVED"
                        ? "已通过"
                        : item.status === "REJECTED"
                          ? "已驳回"
                          : "待审核"}
                    </Badge>
                    <span className="text-[10px] text-ink-mute">{timeAgo(item.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[10.5px] text-ink-mute">{item.reason}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-[11.5px] text-ink-mute">没有派主认证记录</p>
          )}
          {managedFactions.length ? (
            <div className="border-t border-ink-line/60 px-4 py-2 text-[10.5px] text-ink-mute">
              当前管理 {managedFactions.length} 个派：
              {managedFactions.map((item) => item.faction.name).join("、")}
            </div>
          ) : null}
        </section>
      </div>

      <section className="card">
        <div className="flex items-center justify-between border-b border-ink-line/60 px-4 py-2.5">
          <h2 className="text-[13px] font-bold text-ink">最近动态</h2>
          <Link href="/admin/posts" className="text-[11px] font-semibold text-brand">
            内容治理
          </Link>
        </div>
        {user.posts.length ? (
          <div className="divide-y divide-ink-line/60">
            {user.posts.map((post) => {
              const statusMeta = POST_STATUS[post.status] ?? POST_STATUS.PUBLISHED;
              return (
                <div key={post.id} className="px-4 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/posts/${post.id}`}
                      className="text-[12px] font-bold text-ink hover:text-brand"
                    >
                      {post.title ?? richTextToPlainText(post.content).slice(0, 18)}
                    </Link>
                    <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                    <span className="text-[10px] text-ink-mute">
                      {post.faction.name} · {timeAgo(post.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[10.5px] text-ink-mute">
                    {richTextToPlainText(post.content)}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-4 py-6 text-center text-[11.5px] text-ink-mute">还没有发布内容</p>
        )}
      </section>

      <p className="flex items-center gap-1.5 px-1 text-[10.5px] text-ink-mute">
        <Icon name="lock" size={12} />
        身份材料仅用于审核，请勿外传。所有处置操作会写入操作日志。
      </p>
    </div>
  );
}
