"use client";

import { Fragment, useState, type ReactNode } from "react";
import { PostCard } from "@/components/PostCard";
import { apiGet } from "@/lib/client";
import { revivePost, type PostJson } from "@/lib/revive";

/** 服务端渲染好的活动卡插槽：at 表示插在第几条帖子前面 */
export type FeedSlot = { at: number; node: ReactNode };

/** 首页动态流：首屏服务端渲染，后续分页通过 /api/v1/feed 拉取 */
export function FeedStream({
  initialPosts,
  initialHasMore,
  pageSize = 8,
  redirectTo = "/",
  activitySlots = [],
}: {
  initialPosts: PostJson[];
  initialHasMore: boolean;
  pageSize?: number;
  redirectTo?: string;
  activitySlots?: FeedSlot[];
}) {
  const [posts, setPosts] = useState<PostJson[]>(initialPosts);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError("");

    try {
      const response = await apiGet<unknown[]>(
        `/api/v1/feed?page=${page + 1}&pageSize=${pageSize}`,
      );
      const next = response.data.map(revivePost);
      setPosts((items) => {
        const seen = new Set(items.map((item) => item.id));
        return [...items, ...next.filter((item) => !seen.has(item.id))];
      });
      setPage((value) => value + 1);
      setHasMore(Boolean(response.meta?.hasMore));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  // 落在末尾之后（at === 帖子数）的活动卡单独补在列表尾部，其余按下标穿插
  const tailSlots = activitySlots.filter((slot) => slot.at >= posts.length);

  return (
    <div className="space-y-3">
      {posts.map((post, index) => (
        <Fragment key={post.id}>
          {activitySlots
            .filter((slot) => slot.at === index)
            .map((slot, slotIndex) => (
              <Fragment key={`slot-${index}-${slotIndex}`}>{slot.node}</Fragment>
            ))}
          <PostCard post={post} liked={Boolean(post.liked)} redirectTo={redirectTo} />
        </Fragment>
      ))}

      {tailSlots.map((slot, slotIndex) => (
        <Fragment key={`slot-tail-${slotIndex}`}>{slot.node}</Fragment>
      ))}

      {error ? <p className="text-center text-[11px] text-[#B42318]">{error}</p> : null}

      {hasMore ? (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="btn-quiet w-full disabled:opacity-60"
        >
          {loading ? "加载中…" : "加载更多"}
        </button>
      ) : posts.length ? (
        <p className="py-2 text-center text-[11px] text-ink-mute">已经到底了</p>
      ) : null}
    </div>
  );
}
