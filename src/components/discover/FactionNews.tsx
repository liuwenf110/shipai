import { FeedStream } from "@/components/home/FeedStream";
import { SectionHeader, EmptyState } from "@/components/Section";
import type { PostJson } from "@/lib/revive";

const NEWS_VISIBLE = 10; // 首屏服务端渲染条数，再多的一条条靠 /api/v1/news 按需拉

/**
 * 发现页「派新鲜事」：展示所有可见派的最新发布帖子。
 * 只服务端渲染前 10 条，其余交给 FeedStream 的「加载更多」打 /api/v1/news。
 * 旧做法是把 50 条全渲染进 ShowMore 的 hidden 容器里：多出的 40 张卡片的元素树整份
 * 写进 flight 载荷（实测发现页 flight 191KB / HTML 441KB），手机上解析+水合期间
 * 点底部标签像没反应。
 */
export function FactionNews({
  posts,
  total,
  emptyAction,
}: {
  posts: PostJson[];
  /** 可见范围内新鲜事总条数，用来判断首屏之后还有没有得加载 */
  total: number;
  emptyAction: { label: string; href: string };
}) {
  const first = posts.slice(0, NEWS_VISIBLE);

  return (
    <section className="mx-auto max-w-5xl px-4 pt-5">
      <SectionHeader title="派新鲜事" desc="各派里正在聊的最新话题" />
      {first.length ? (
        <FeedStream
          initialPosts={first}
          initialHasMore={total > first.length}
          endpoint="/api/v1/news"
          pageSize={NEWS_VISIBLE}
          redirectTo="/discover"
          compact
        />
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
