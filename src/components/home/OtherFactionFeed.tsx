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

/**
 * 首页「公开招募」：展示所有勾选了「首页公开招募」的帖（不限是否入派），
 * 卡片网格布局，每张卡右下角固定一枚「招募中」角标，整卡点进帖子详情引导入派。
 */
export function OtherFactionFeed({ posts }: { posts: OtherFactionPost[] }) {
  if (!posts.length) return null;

  return (
    <section id="recruit-feed">
      <SectionHeader
        title="公开招募"
        desc="各派正在公开招人的动态，点进去看详情就能加入"
        href="/discover"
        linkLabel="去逛逛"
      />
      <div className="grid gap-3 md:grid-cols-2">
        {posts.map((post) => {
          const meta = categoryOf(post.faction.category);
          return (
            <Link
              key={post.id}
              href={`/posts/${post.id}`}
              className="card flex flex-col gap-2 p-4 transition-shadow hover:shadow-float"
            >
              {/* 顶行：派图标 + 公告标 + 时间 */}
              <div className="flex items-center gap-2">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[16px]"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${meta.from}, ${meta.to})`,
                  }}
                >
                  {post.faction.emoji}
                </span>
                {post.kind === "ANNOUNCE" ? (
                  <span className="rounded bg-ink px-1.5 py-0.5 text-[9px] font-bold text-white">
                    公告
                  </span>
                ) : null}
                <span className="ml-auto text-[10px] text-ink-mute">{timeAgo(post.createdAt)}</span>
              </div>

              {/* 标题 */}
              <p className="line-clamp-2 text-[14px] font-bold leading-snug text-ink">
                {post.title || richTextToPlainText(post.content).slice(0, 60)}
              </p>

              {/* 正文摘要：有标题时展示内容前几行 */}
              {post.title ? (
                <p className="line-clamp-2 text-[12px] leading-relaxed text-ink-soft">
                  {richTextToPlainText(post.content)}
                </p>
              ) : null}

              {/* 底部：左列作者与互动数，右列「招募中」角标 */}
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-ink-line/60 pt-2">
                <div className="flex min-w-0 items-center gap-2.5 text-[10.5px] text-ink-mute">
                  <span className="max-w-[90px] truncate">{post.author.nickname}</span>
                  <span className="flex items-center gap-0.5">
                    <Icon name="heart" size={11} />
                    {post.likeCount}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Icon name="message" size={11} />
                    {post.commentCount}
                  </span>
                </div>
                <span className="shrink-0 rounded-full bg-brand px-2.5 py-1 text-[10px] font-black tracking-wide text-white shadow-sm">
                  招募中
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
