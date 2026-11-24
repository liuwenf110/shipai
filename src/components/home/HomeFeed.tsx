import { HomeTicker } from "@/components/home/HomeTicker";
import { ActivityFeedCard, type ActivityFeedRow } from "@/components/faction/ActivityFeedCard";
import { OtherFactionFeed, type OtherFactionPost } from "@/components/home/OtherFactionFeed";
import { SectionHeader } from "@/components/Section";
import type { HomeTickerItem } from "@/lib/home-ticker";
import { categoryOf } from "@/lib/constants";

/**
 * 首页在「派内发贴勾选公开招募」改造后收敛为三块：
 * 顶部只剩消息栏；下方是全站可见的近期活动列表；
 * 最后是全部勾选了「首页公开招募」的帖子（派内新鲜事已整体迁去发现页）。
 */

/** 首页活动列表行：除活动本体外带上派标签信息与管理台身份（行形状沿用原首页混排口径） */
export type HomeActivityRow = {
  activity: ActivityFeedRow;
  slug: string;
  factionName: string;
  factionEmoji: string;
  category: string;
  isManager: boolean;
  going: boolean;
};

export function HomeFeed({
  viewer,
  tickerItems,
  activities,
  recruitPosts,
}: {
  /** 当前登录用户：活动卡要按本人视角算「我发起 / 已报名 / 能否直接报名」 */
  viewer: { user: { id: string }; isVerified: boolean };
  /** 顶部消息栏轮播条目（服务端按真实数据拼好，空数组则整条不渲染） */
  tickerItems: HomeTickerItem[];
  /** 近期活动：全平台可见派里未开始的报名中活动，按临近开场排序 */
  activities: HomeActivityRow[];
  /** 公开招募流：所有勾选了「首页公开招募」的已发布帖（不限是否入派） */
  recruitPosts: OtherFactionPost[];
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 md:py-6">
      {/* 顶部只保留消息栏 */}
      <HomeTicker items={tickerItems} />

      {/* 活动列表：整站报名入口，卡片与派页/发现页共用 ActivityFeedCard */}
      {activities.length ? (
        <section>
          <SectionHeader title="近期活动" desc="正在报名的活动，认证后即可参加" />
          <div className="space-y-3">
            {activities.map((row) => (
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
            ))}
          </div>
        </section>
      ) : null}

      {/* 公开招募：派内发帖勾选了「首页公开招募」的全部帖子 */}
      <OtherFactionFeed posts={recruitPosts} />
    </div>
  );
}
