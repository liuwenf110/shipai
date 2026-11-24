import { FeedStream, type FeedSlot } from "@/components/home/FeedStream";
import { SectionHeader, EmptyState } from "@/components/Section";
import type { PostJson } from "@/lib/revive";

/**
 * 发现页「派新鲜事」：原首页的派内动态流整体迁移至此。
 * 首屏服务端只渲染 10 条，其余通过 FeedStream 的 /api/v1/feed 分页与「更多」补出；
 * 本派未开始活动由服务端预渲染成插槽混排（活动卡含表单，是 Server Component）。
 */
export function FactionNews({
  posts,
  likedIds,
  activitySlots,
  hasMore,
  emptyAction,
}: {
  posts: PostJson[];
  likedIds: string[];
  /** 服务端渲染好的活动卡插槽（at = 插在第几条帖子之前） */
  activitySlots: FeedSlot[];
  hasMore: boolean;
  /** 一条帖子都没有时的引导（入派/去发现兴趣派） */
  emptyAction: { label: string; href: string };
}) {
  const withLiked = posts.map((post) => ({ ...post, liked: likedIds.includes(post.id) }));

  return (
    <section className="mx-auto max-w-5xl px-4 pt-5">
      <SectionHeader title="派新鲜事" desc="你加入的派里，大家正在聊" />
      {withLiked.length || activitySlots.length ? (
        // pageSize=10 与首屏条数对齐：「更多」加载的每页也是 10 条
        <FeedStream initialPosts={withLiked} initialHasMore={hasMore} pageSize={10} redirectTo="/discover" activitySlots={activitySlots} />
      ) : (
        <div className="card">
          <EmptyState
            icon="message"
            title="派里还很安静"
            desc="成为第一个发帖的人，把周末计划丢出来"
            actionLabel={emptyAction.label}
            actionHref={emptyAction.href}
          />
        </div>
      )}
    </section>
  );
}
