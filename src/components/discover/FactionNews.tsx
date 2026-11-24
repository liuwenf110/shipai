import { PostCard } from "@/components/PostCard";
import { SectionHeader, EmptyState } from "@/components/Section";
import { ShowMore } from "@/components/ShowMore";
import type { PostJson } from "@/lib/revive";

const NEWS_VISIBLE = 10; // 首屏展示条数，其余折叠在「更多」里

/**
 * 发现页「派新鲜事」：展示所有可见派的最新发布帖子。
 * 首屏服务端渲染前 10 条，超出部分由 ShowMore 静态展开（内容已在服务端渲染，无需再发 API）。
 */
export function FactionNews({
  posts,
  emptyAction,
}: {
  posts: PostJson[];
  /** 一条帖子都没有时的引导 */
  emptyAction: { label: string; href: string };
}) {
  const visible = posts.slice(0, NEWS_VISIBLE);
  const extra = posts.slice(NEWS_VISIBLE);

  return (
    <section className="mx-auto max-w-5xl px-4 pt-5">
      <SectionHeader title="派新鲜事" desc="各派里正在聊的最新话题" />
      {visible.length ? (
        <>
          <div className="space-y-3">
            {visible.map((post) => (
              <PostCard key={post.id} post={post} liked={Boolean(post.liked)} redirectTo="/discover" />
            ))}
          </div>
          {extra.length ? (
            <ShowMore count={extra.length}>
              <div className="mt-3 space-y-3">
                {extra.map((post) => (
                  <PostCard key={post.id} post={post} liked={Boolean(post.liked)} redirectTo="/discover" />
                ))}
              </div>
            </ShowMore>
          ) : null}
        </>
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
