import { prisma } from "@/lib/db";
import { apiError, apiOk, getApiUser, IDENTIFIED_USER, metaOf, paging, readJson } from "@/lib/api";
import { withPostIdentity } from "@/lib/revive";
import { buildLinkSnapshot, normalizeLinkUrl } from "@/lib/link-preview";
import { looksRichText, richTextToPlainText, sanitizeRichText } from "@/lib/rich-text";
import { audienceOfUserOrAdmin, canAccessFaction } from "@/lib/scope";

/** GET /api/v1/factions/[slug]/posts?page= 派内帖子分页 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const { page, pageSize, skip } = paging(url, 10);
  const user = await getApiUser();

  const faction = await prisma.faction.findUnique({ where: { slug }, select: { id: true } });
  if (!faction) return apiError("该派不存在", 404);

  // 派内帖子跟随派隔离：跨阵营拿不到列表，也拿不到总数
  const audience = await audienceOfUserOrAdmin(user);
  if (!(await canAccessFaction(faction.id, audience, user?.id))) return apiError("该派不存在", 404);

  const where = { factionId: faction.id, status: "PUBLISHED" };
  const [total, posts] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      include: {
        author: { select: IDENTIFIED_USER },
        faction: { include: { company: true } },
      },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
    }),
  ]);

  const likes =
    user && posts.length
      ? await prisma.postLike.findMany({
          where: { userId: user.id, postId: { in: posts.map((item) => item.id) } },
          select: { postId: true },
        })
      : [];
  const likedIds = new Set(likes.map((item) => item.postId));

  return apiOk(
    posts.map((post) =>
      withPostIdentity({ ...post, liked: likedIds.has(post.id) }, post.faction.companyId),
    ),
    metaOf(page, pageSize, total),
  );
}

/** POST /api/v1/factions/[slug]/posts 派内发帖（图片走 Server Action；link 可选，附公众号文章/外站链接） */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await getApiUser();
  if (!user) return apiError("请先登录", 401);

  const body = await readJson<{ title?: string; content?: string; kind?: string; link?: string }>(request);
  // 与 Server Action 同源：富文本净化入库，空帖按剥标签后纯文本判定
  const rawContent = String(body?.content ?? "").trim();
  const content = looksRichText(rawContent) ? sanitizeRichText(rawContent) : rawContent;
  const title = String(body?.title ?? "").trim();
  const linkRaw = String(body?.link ?? "").trim();
  const linkUrl = linkRaw ? normalizeLinkUrl(linkRaw) : null;
  if (linkRaw && !linkUrl) return apiError("链接格式不正确，请粘贴网页链接");
  if (!richTextToPlainText(content).trim()) return apiError("内容不能为空");

  const faction = await prisma.faction.findUnique({
    where: { slug },
    include: { company: true },
  });
  if (!faction) return apiError("该派不存在", 404);
  if (faction.status !== "ACTIVE") return apiError("该派暂未开放发帖");

  const membership = await prisma.factionMember.findUnique({
    where: { factionId_userId: { factionId: faction.id, userId: user.id } },
  });
  if (!membership || membership.status !== "ACTIVE") return apiError("加入本派后才能发帖", 403);

  const isManager = membership.role !== "MEMBER";
  const linkSnapshot = linkUrl ? await buildLinkSnapshot(linkUrl) : null;
  const post = await prisma.post.create({
    data: {
      factionId: faction.id,
      authorId: user.id,
      title: title || null,
      content,
      ...(linkSnapshot ?? {}),
      kind: isManager && (body?.kind === "ANNOUNCE" || !title) ? "ANNOUNCE" : "POST",
      pinned: false,
    },
    include: {
      author: { select: IDENTIFIED_USER },
      faction: { include: { company: true } },
    },
  });

  await prisma.faction.update({
    where: { id: faction.id },
    data: { postCount: { increment: 1 } },
  });

  return apiOk(withPostIdentity({ ...post, liked: false }, faction.companyId), undefined);
}
