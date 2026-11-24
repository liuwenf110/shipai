import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PUBLIC_USER, IDENTIFIED_USER } from "@/lib/api";
import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/Badge";
import { CompanyBadge } from "@/components/CompanyBadge";
import { Icon } from "@/components/Icon";
import { Notice, QueryNotice } from "@/components/Notice";
import { EmptyState } from "@/components/Section";
import { ConfirmSubmit } from "@/components/content/ConfirmSubmit";
import { Disclosure } from "@/components/Disclosure";
import { PostEditor } from "@/components/faction/PostEditor";
import { PostShareButton } from "@/components/post/PostShareButton";
import { ReportButton } from "@/components/content/ReportButton";
import { CommentSection } from "@/components/post/CommentSection";
import { LinkCard } from "@/components/post/LinkCard";
import { LikeButton } from "@/components/post/LikeButton";
import { deleteOwnPostAction } from "@/lib/actions/content";
import { categoryOf } from "@/lib/constants";
import { withBasePath } from "@/lib/base-path";
import { pickUserIdentity } from "@/lib/identity";
import { listMentionCandidates } from "@/lib/mention";
import { withCommentIdentity } from "@/lib/revive";
import { audienceOfUserOrAdmin, canAccessFaction } from "@/lib/scope";
import { looksRichText, prepareRichTextForRender, richTextToPlainText, linkifyPlainText } from "@/lib/rich-text";
import { formatDateTime, splitList } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id },
    select: { title: true, content: true, factionId: true },
  });
  // 富文本帖取剥标签后的摘要作标题，避免把 HTML 写进浏览器标签页
  const summary = post ? richTextToPlainText(post.content).slice(0, 16) : "";
  if (!post) return { title: "帖子" };
  // 帖标跟随所属派隔离
  const metaUser = await getCurrentUser();
  const metaAudience = await audienceOfUserOrAdmin(metaUser);
  if (!(await canAccessFaction(post.factionId, metaAudience, metaUser?.id))) return { title: "帖子" };
  return { title: post.title ?? (summary || "帖子") };
}

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const user = await getCurrentUser();
  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      author: { select: IDENTIFIED_USER },
      faction: { include: { company: true, leader: true } },
      comments: {
        where: { status: "PUBLISHED" },
        include: {
          // 高亮 @ 片段需要昵称，只取 userId 则刷新后退化纯文本
          mentions: { select: { userId: true, user: { select: { nickname: true } } } },
          author: {
            select: {
              ...PUBLIC_USER,
              employments: {
                where: { status: "VERIFIED" },
                select: {
                  companyId: true,
                  kind: true,
                  company: { select: { shortName: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!post) notFound();

  // 帖子内容不单独定阵营，一律跟随它所属的派
  const audience = await audienceOfUserOrAdmin(user);
  if (!(await canAccessFaction(post.factionId, audience, user?.id))) notFound();

  // 评论文档附带作者认证身份（公司 + 在职/离职），同公司优先
  const initialComments = post.comments.map((comment) =>
    withCommentIdentity(comment, post.faction.companyId),
  );
  // 帖子作者展示认证公司（不展示在职/离职状态），同派公司优先
  const authorIdentity = pickUserIdentity(post.author.employments, post.faction.companyId);

  const [membership, like, atCandidates] = await Promise.all([
    user
      ? prisma.factionMember.findUnique({
          where: { factionId_userId: { factionId: post.factionId, userId: user.id } },
        })
      : Promise.resolve(null),
    user
      ? prisma.postLike.findUnique({
          where: { postId_userId: { postId: post.id, userId: user.id } },
        })
      : Promise.resolve(null),
    // 可 @ 的人：未登录时为空数组，评论区也就不渲染 @ 排
    user ? listMentionCandidates(post.id, user.id) : Promise.resolve([]),
  ]);

  const isMember = membership?.status === "ACTIVE";
  const isManager = Boolean(isMember && membership && membership.role !== "MEMBER");
  const isAuthor = post.authorId === user?.id;
  const canSeeHidden = post.status === "PUBLISHED" || post.authorId === user?.id || isManager;
  const meta = categoryOf(post.faction.category);
  // 图库对 /uploads 前缀不做子路径适配，生产需补 /shipai 前缀才能经 nginx 命中应用
  const images = splitList(post.images).map(withBasePath);
  const path = `/posts/${post.id}`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <div className="flex items-center justify-between">
        <Link
          href={`/factions/${post.faction.slug}?tab=posts`}
          className="flex items-center gap-1 text-[12px] font-semibold text-ink-mute hover:text-ink"
        >
          <Icon name="back" size={14} />
          {post.faction.name}
        </Link>
        <div className="flex items-center gap-2">
          {isAuthor ? (
            <form action={deleteOwnPostAction} className="flex">
              <input type="hidden" name="postId" value={post.id} />
              <input
                type="hidden"
                name="redirectTo"
                value={`/factions/${post.faction.slug}?tab=posts`}
              />
              <ConfirmSubmit
                confirmText="删除后不可恢复，确定删除这条动态？"
                className="flex items-center gap-0.5 text-[11px] font-semibold text-ink-mute transition hover:text-[#B42318]"
              >
                <Icon name="trash" size={13} />
                删除
              </ConfirmSubmit>
            </form>
          ) : null}
          {isManager ? (
            <Link
              href={`/factions/${post.faction.slug}/manage?tab=posts`}
              className="text-[11px] font-semibold text-ink-mute hover:text-brand"
            >
              管理内容 →
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-2">
        <QueryNotice ok={query.ok} error={query.error} />
      </div>

      {!canSeeHidden ? (
        <div className="card mt-3">
          <EmptyState icon="lock" title="内容已被隐藏" desc="该帖已被派主或运营隐藏，暂不可查看" />
        </div>
      ) : (
        <>
          {post.status === "HIDDEN" ? (
            <Notice message="该帖当前处于隐藏状态，仅作者与管理者可见" tone="info" className="mt-2" />
          ) : null}

          <article className="card mt-3 p-4">
            <div className="flex items-center gap-2.5">
              <UserAvatar id={post.author.id} name={post.author.nickname} color={post.author.avatarColor} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13.5px] font-bold text-ink">{post.author.nickname}</span>
                  <CompanyBadge identity={authorIdentity} showKind={false} showUnverified />
                  {post.pinned ? <Badge tone="brand">置顶</Badge> : null}
                  {post.kind === "ANNOUNCE" ? <Badge tone="mute">公告</Badge> : null}
                </div>
                <p className="mt-0.5 text-[11px] text-ink-mute">
                  {formatDateTime(post.createdAt)} · 发布于
                  <Link
                    href={`/factions/${post.faction.slug}`}
                    className="ml-1 font-semibold text-ink-soft hover:text-brand"
                  >
                    {post.faction.name}
                  </Link>
                </p>
              </div>
            </div>

            {post.title ? (
              <h1 className="mt-3 text-[20px] font-black leading-snug tracking-tight text-ink">
                {post.title}
              </h1>
            ) : null}

            {/* 富文本帖渲染净化后的 HTML（含正文内联图）；纯文本老帖保持 pre-wrap 原样 */}
            {looksRichText(post.content) ? (
              <div
                className="post-rich mt-2 text-[14px] leading-[1.75] text-ink-soft"
                dangerouslySetInnerHTML={{ __html: prepareRichTextForRender(post.content) }}
              />
            ) : (
              <div
                className="post-rich mt-2 whitespace-pre-wrap text-[14px] leading-[1.75] text-ink-soft"
                // 纯文本老帖保留换行同时把内面裸 URL 自动包成可点链接
                dangerouslySetInnerHTML={{ __html: linkifyPlainText(post.content).replace(/\n/g, "<br>") }}
              />
            )}

            {post.linkUrl ? (
              <LinkCard
                url={post.linkUrl}
                title={post.linkTitle}
                image={post.linkImage}
                description={post.linkDesc}
                className="mt-3"
              />
            ) : null}

            {images.length ? (
              <div className="mt-3 space-y-2">
                {images.map((image) => (
                  <div key={image} className="overflow-hidden rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image}
                      alt="帖子图片"
                      className="w-full object-cover"
                      style={{ background: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}
                    />
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-4 flex items-center gap-4 border-t border-ink-line/60 pt-3">
              <LikeButton
                postId={post.id}
                liked={Boolean(like)}
                count={post.likeCount}
                size={16}
                showLabel
                className="text-[12px]"
              />
              <span className="flex items-center gap-1 text-[12px] font-semibold text-ink-mute">
                <Icon name="message" size={16} />
                {post.commentCount} 条评论
              </span>
              {/* 转发：把帖子外链发给小程序外的用户，对方浏览器直接打开即可匿名观看 */}
              <span className="ml-auto flex items-center gap-3">
                <PostShareButton
                  title={post.title ?? richTextToPlainText(post.content).slice(0, 24)}
                  path={path}
                  image={images[0]}
                  summary={richTextToPlainText(post.content).slice(0, 40)}
                />
              </span>
            </div>
          </article>

          {/* 仅作者可改自己的帖：派主/运营只能隐藏或删除，不能修改内容；作者本身是派主时编辑框附带置顶/公告开关 */}
          {isAuthor ? (
            <div className="card mt-3 p-4">
              <Disclosure
                summaryClassName="text-[12px] font-semibold text-ink-mute hover:text-brand"
                summary="编辑这条动态"
              >
                <div className="mt-2.5">
                  <PostEditor
                    postId={post.id}
                    isManager={isManager}
                    defaults={{
                      title: post.title ?? "",
                      content: post.content,
                      link: post.linkUrl ?? "",
                      image: images[0] ?? "",
                      pinned: post.pinned,
                      isAnnounce: post.kind === "ANNOUNCE",
                      recruit: post.recruit,
                    }}
                    redirectTo={path}
                  />
                </div>
              </Disclosure>
            </div>
          ) : null}

          {/* 评论区：发表与刷新走 /api/v1 接口 */}
          <CommentSection
            postId={post.id}
            initialComments={initialComments}
            canComment={Boolean(user)}
            isLoggedIn={Boolean(user)}
            loginHref={`/login?next=${encodeURIComponent(path)}`}
            viewerId={user?.id}
            redirectTo={path}
            atCandidates={atCandidates}
          />

          {user && !isAuthor ? (
            <div className="mt-2 flex justify-end">
              <ReportButton
                targetType="POST"
                targetId={post.id}
                redirectTo={path}
                label="举报这条动态"
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
