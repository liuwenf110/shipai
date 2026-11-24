import Link from "next/link";
import type { ReactNode } from "react";
import type { Company, Faction, Post } from "@prisma/client";
import type { PublicUser } from "@/lib/revive";
import { Badge } from "@/components/Badge";
import { FeedStream } from "@/components/home/FeedStream";
import { HomeTicker } from "@/components/home/HomeTicker";
import { OtherFactionFeed, type OtherFactionPost } from "@/components/home/OtherFactionFeed";
import { ActivityFeedCard, type ActivityFeedRow } from "@/components/faction/ActivityFeedCard";
import { EmptyState, SectionHeader } from "@/components/Section";
import type { Viewer } from "@/lib/auth";
import type { HomeTickerItem } from "@/lib/home-ticker";
import { EMPLOYMENT_KIND } from "@/lib/constants";
import { categoryOf } from "@/lib/constants";

type FactionWithLeader = Faction & { company: Company; leader: PublicUser | null };
type FeedPost = Post & { author: PublicUser; faction: Faction & { company: Company } };

/** 首页混排进动态流的本派活动：除活动本体外带上派名标签与管理台身份，sortAt 用于算插入位置 */
export type HomeActivityRow = {
  activity: ActivityFeedRow;
  sortAt: Date;
  slug: string;
  factionName: string;
  factionEmoji: string;
  category: string;
  isManager: boolean;
  going: boolean;
};

export function HomeFeed({
  viewer,
  myFactions,
  posts,
  likedIds,
  otherPosts,
  activities,
  pendingLeaderFactionIds,
  feedHasMore,
  tickerItems,
}: {
  viewer: Viewer;
  myFactions: { faction: FactionWithLeader; role: string; status: string }[];
  posts: FeedPost[];
  likedIds: string[];
  /** 首页「公开招募」条目：未加入的派里被勾选了公开招募的帖（每派最多一条） */
  otherPosts: OtherFactionPost[];
  /** 自己所属派的未开始活动，混排进「派内新鲜事」 */
  activities: HomeActivityRow[];
  /** 已提交派主 / 副派主申请且仍在审核中的派，这些派不再重复引导申请 */
  pendingLeaderFactionIds: string[];
  /** 首页顶部消息栏的轮播条目（服务端按真实数据拼好，空数组则整条不渲染） */
  tickerItems: HomeTickerItem[];
  feedHasMore: boolean;
}) {
  const activeFactions = myFactions.filter((item) => item.status === "ACTIVE");
  const leaderOf = myFactions.filter((item) => item.role === "LEADER" || item.role === "ADMIN");

  // 老派主认证入口：点击卡片尽量直达「派主认证申请页」——
  // 优先「已加入、暂无派主、本公司在职/离职认证」且未在审核中的派；
  // 其次跳到审核中派的申请页（页内展示审核状态）；
  // 再次兜底到本公司已加入的普通成员派，由申请页自行提示不符合条件的原因；
  // 没有任何可申请的派时才退回发现页自行挑选
  const isCompanyMember = (item: (typeof activeFactions)[number]) =>
    item.role === "MEMBER" &&
    viewer.verifiedEmployments.some((employment) => employment.companyId === item.faction.companyId);
  const leaderApplyFaction = activeFactions.find(
    (item) =>
      isCompanyMember(item) &&
      !item.faction.leaderId &&
      !pendingLeaderFactionIds.includes(item.faction.id),
  );
  // 审核中的申请入口只认「本人仍是普通成员且该派暂无派主」的记录，
  // 避免 seed 残留的历史 PENDING 申请（如已是派主的用户在自管派上的旧申请）把链接带偏
  const pendingApplyFaction = activeFactions.find(
    (item) =>
      pendingLeaderFactionIds.includes(item.faction.id) &&
      item.role === "MEMBER" &&
      !item.faction.leaderId,
  );
  const leaderApplyTarget =
    leaderApplyFaction ?? pendingApplyFaction ?? activeFactions.find(isCompanyMember);
  // 「审核中」文案与链接同源，不被自管派/已就位派的历史残留申请触发
  const hasPendingLeaderApply = Boolean(pendingApplyFaction);
  const leaderApplyHref = leaderApplyTarget
    ? `/factions/${leaderApplyTarget.faction.slug}/apply`
    : "/discover";

  // 活动卡内含报名表单、是 Server Component，不能直接在客户端动态流里渲染；
  // 先在服务端渲染成节点，再按发布时间算出该插在第几条帖子前面交给 FeedStream
  // 置顶帖永远占住流首，活动只插在它后面，否则新活动会把派公告顶下去
  const pinnedCount = posts.findIndex((post) => !post.pinned);
  const pinnedHead = pinnedCount === -1 ? posts.length : pinnedCount;
  const activitySlots = activities.map((row) => {
    const made = new Date(row.sortAt).getTime();
    const found = posts.findIndex((post) => new Date(post.createdAt).getTime() < made);
    return {
      at: Math.max(pinnedHead, found === -1 ? posts.length : found),
      node: (
        <ActivityFeedCard
          key={row.activity.id}
          activity={row.activity}
          slug={row.slug}
          isMember
          isManager={row.isManager}
          currentUserId={viewer.user.id}
          going={row.going}
          path="/"
          signedIn
          isVerified={viewer.isVerified}
          factionTag={{
            emoji: row.factionEmoji,
            name: row.factionName,
            // 无封面活动用派别渐变图块补上视觉锚点
            from: categoryOf(row.category).from,
            to: categoryOf(row.category).to,
          }}
        />
      ),
    };
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 md:py-6">
      {/* 消息栏要横跨左右两栏，所以放在 grid 外面 */}
      <HomeTicker items={tickerItems} />
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          {/* 派内动态 */}
          <div>
            <SectionHeader title="派内新鲜事" desc="你加入的派里，大家正在聊" />
            {/* 派里一条帖子都没有但有活动时，活动卡仍要出现在流里 */}
            {posts.length || activitySlots.length ? (
              <FeedStream
                initialPosts={posts.map((post) => ({
                  ...post,
                  liked: likedIds.includes(post.id),
                }))}
                initialHasMore={feedHasMore}
                activitySlots={activitySlots}
              />
            ) : (
              <div className="card">
                <EmptyState
                  icon="message"
                  title="派内还很安静"
                  desc="成为第一个发帖的人，把周末计划丢出来"
                  actionLabel="去发第一条"
                  actionHref={activeFactions[0] ? `/factions/${activeFactions[0].faction.slug}?tab=posts` : "/discover"}
                />
              </div>
            )}
          </div>

          {/* 首页公开招募（按帖勾选） */}
          <OtherFactionFeed posts={otherPosts} />
        </div>

        {/* 右栏 */}
        <aside className="hidden space-y-4 md:block">
          <div className="card p-4">
            <h3 className="text-[13px] font-bold text-ink">身份认证进度</h3>
            <div className="mt-3 space-y-2.5">
              {viewer.employments.length ? (
                viewer.employments.map((employment) => (
                  <div key={employment.id} className="flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-[9px] font-black text-white"
                      style={{ background: employment.company.color }}
                    >
                      {employment.company.logoText}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] font-semibold text-ink">
                        {employment.company.name}
                      </p>
                      <p className="text-[10px] text-ink-mute">
                        {EMPLOYMENT_KIND[employment.kind as keyof typeof EMPLOYMENT_KIND]?.label}
                        {employment.title ? ` · ${employment.title}` : ""}
                      </p>
                    </div>
                    {employment.status === "VERIFIED" ? (
                      <Badge tone="ok">已认证</Badge>
                    ) : employment.status === "PENDING" ? (
                      <Badge tone="warn">审核中</Badge>
                    ) : (
                      <Badge tone="bad">未通过</Badge>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-[11px] leading-relaxed text-ink-mute">
                  还没有提交身份认证。
                  <Link href="/verify" className="ml-1 font-semibold text-brand">
                    立即认证
                  </Link>
                </p>
              )}
            </div>
          </div>

          {/* 整卡可点击：只要加入过符合条件的派就直达派主认证申请页，否则去发现页 */}
          <Link
            href={leaderApplyHref}
            className="block rounded-2xl bg-gradient-to-br from-ink to-[#2B2420] p-4 text-white transition hover:brightness-110"
          >
            <p className="text-[11px] font-semibold tracking-widest text-brand">派主认证</p>
            <p className="mt-1 text-[13px] font-bold leading-snug">你是原厂某个兴趣派的老派主？</p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/50">
              {leaderApplyFaction
                ? `「${leaderApplyFaction.faction.name}」暂无派主，可直接提交派主申请。`
                : hasPendingLeaderApply
                  ? "你提交的派主认证正在审核中，结果会通过站内消息通知。"
                  : "提交活动组织经验与运营计划，认证后可管理派内成员、内容与活动。"}
            </p>
            <span className="mt-3 inline-flex text-[11px] font-bold text-white/80">
              {leaderApplyFaction
                ? "去申请派主 →"
                : hasPendingLeaderApply
                  ? "查看申请进度 →"
                  : "去对应的派申请 →"}
            </span>
          </Link>

        </aside>
      </div>
    </div>
  );
}
