import Link from "next/link";
import type { Company, Faction, Post } from "@prisma/client";
import { Icon } from "@/components/Icon";
import { SectionHeader } from "@/components/Section";
import { categoryOf } from "@/lib/constants";
import type { IdentifiedAuthor } from "@/lib/revive";
import { timeAgo } from "@/lib/utils";
import { richTextToPlainText } from "@/lib/rich-text";

export type OtherFactionPost = Post & {
  author: IdentifiedAuthor;
  faction: Faction & { company: Company };
};

/** 首页「其他派新鲜事」：展示未加入的派里最新动态，引导用户去发现页逛派 */
export function OtherFactionFeed({ posts }: { posts: OtherFactionPost[] }) {
  if (!posts.length) return null;

  return (
    <div>
      <SectionHeader
        title="其他派新鲜事"
        desc="你还没加入的派，也在发生有意思的事"
        href="/discover"
        linkLabel="去逛逛"
      />
      <div className="card divide-y divide-ink-line/60">
        {posts.map((post) => {
          const meta = categoryOf(post.faction.category);
          return (
            <Link
              key={post.id}
              href={`/posts/${post.id}`}
              className="flex items-start gap-3 p-3 transition hover:bg-cream"
            >
              <span
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[17px]"
                style={{
                  backgroundImage: `linear-gradient(135deg, ${meta.from}, ${meta.to})`,
                }}
              >
                {post.faction.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] text-ink-mute">
                  <span className="max-w-[150px] truncate text-[11.5px] font-bold text-ink">
                    {post.faction.name}
                  </span>
                  <span>{post.faction.company.shortName}</span>
                  <span>·</span>
                  <span>{timeAgo(post.createdAt)}</span>
                  {post.kind === "ANNOUNCE" ? (
                    <span className="rounded bg-ink px-1 py-0.5 text-[9px] font-bold text-white">
                      公告
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-soft">
                  {post.title || richTextToPlainText(post.content)}
                </p>
                <div className="mt-1.5 flex items-center gap-3 text-[10.5px] text-ink-mute">
                  <span className="truncate">{post.author.nickname}</span>
                  <span className="flex items-center gap-0.5">
                    <Icon name="heart" size={11} />
                    {post.likeCount}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Icon name="message" size={11} />
                    {post.commentCount}
                  </span>
                </div>
              </div>
              <Icon name="right" size={14} className="mt-1 shrink-0 text-ink-mute" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
