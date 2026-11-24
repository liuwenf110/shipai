import Link from "next/link";
import type { Company, Faction, Post } from "@prisma/client";
import { UserAvatar } from "@/components/UserAvatar";
import { CompanyBadge } from "@/components/CompanyBadge";
import { Icon } from "@/components/Icon";
import { LikeButton } from "@/components/post/LikeButton";
import { LinkCard } from "@/components/post/LinkCard";
import { categoryOf } from "@/lib/constants";
import { withBasePath } from "@/lib/base-path";
import type { IdentifiedAuthor } from "@/lib/revive";
import { extractRichImagePaths, looksRichText, richTextToPlainText } from "@/lib/rich-text";
import { splitList, timeAgo } from "@/lib/utils";

type PostCardData = Post & {
  author: IdentifiedAuthor;
  faction: Faction & { company: Company };
};

export function PostCard({
  post,
  liked = false,
  showFaction = true,
  showAuthorCompany = true,
  compact = false,
}: {
  post: PostCardData;
  liked?: boolean;
  /** 保留兼容旧调用：点赞改为调用接口后不再需要跳回地址 */
  redirectTo?: string;
  showFaction?: boolean;
  /** 是否展示作者认证公司（仅公司名，未认证显示「未认证」）；全站默认展示 */
  showAuthorCompany?: boolean;
  /** 紧凑模式：缩小配图高度与文本行数，用于发现页列表 */
  compact?: boolean;
}) {
  const meta = categoryOf(post.faction.category);
  // 库里存的是 /uploads/xxx 相对路径；生产挂在 /shipai 子路径下，渲染前必须补前缀，否则 nginx 不转发到应用导致破图
  const images = splitList(post.images).map(withBasePath);
  // 富文本帖摘要剥标签；无配图字段时用正文首张内联图作封面
  const summary = looksRichText(post.content) ? richTextToPlainText(post.content) : post.content;
  const richCover = looksRichText(post.content) ? extractRichImagePaths(post.content)[0] : undefined;
  const cover = images[0] ?? (richCover ? withBasePath(richCover) : null);

  return (
    <article className="card p-4">
      <div className="flex items-center gap-2.5">
        <UserAvatar id={post.author.id} name={post.author.nickname} color={post.author.avatarColor} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[13px] font-bold text-ink">{post.author.nickname}</span>
            {showAuthorCompany ? (
              <CompanyBadge
                identity={post.author.identity}
                showKind={false}
                showUnverified
              />
            ) : null}
            {post.pinned ? (
              <span className="flex items-center gap-0.5 rounded bg-brand-soft px-1 py-0.5 text-[9px] font-bold text-brand-dark">
                <Icon name="pin" size={9} /> 置顶
              </span>
            ) : null}
            {post.kind === "ANNOUNCE" ? (
              <span className="rounded bg-ink px-1 py-0.5 text-[9px] font-bold text-white">
                公告
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-mute">
            {showFaction ? (
              <>
                <span>{post.faction.emoji}</span>
                <Link
                  href={`/factions/${post.faction.slug}`}
                  className="font-semibold text-ink-soft hover:text-brand"
                >
                  {post.faction.name}
                </Link>
                <span className="text-ink-line">·</span>
              </>
            ) : null}
            <span>{timeAgo(post.createdAt)}</span>
          </div>
        </div>
      </div>

      <Link href={`/posts/${post.id}`} className="mt-3 block">
        {post.title ? (
          <h3 className="mb-1 text-[15px] font-bold leading-snug tracking-tight text-ink">
            {post.title}
          </h3>
        ) : null}
        <p className={`whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-soft ${compact ? "line-clamp-2" : "line-clamp-4"}`}>
          {summary}
        </p>
        {cover ? (
          <div className="mt-2.5 overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt="帖子图片"
              className={`w-full object-cover ${compact ? "max-h-28 sm:max-h-36" : "max-h-64"}`}
              style={{ background: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}
            />
          </div>
        ) : null}
      </Link>

      {/* 外链卡片放在正文链接块之外，避免 <a> 嵌套 */}
      {post.linkUrl ? (
        <LinkCard
          url={post.linkUrl}
          title={post.linkTitle}
          image={post.linkImage}
          description={post.linkDesc}
          className="mt-2.5"
        />
      ) : null}

      <div className="mt-3 flex items-center gap-4 border-t border-ink-line/60 pt-2.5 text-[11.5px] text-ink-mute">
        <LikeButton postId={post.id} liked={liked} count={post.likeCount} />
        <Link
          href={`/posts/${post.id}`}
          className="flex items-center gap-1 font-semibold hover:text-ink"
        >
          <Icon name="message" size={15} />
          {post.commentCount}
        </Link>
      </div>
    </article>
  );
}
