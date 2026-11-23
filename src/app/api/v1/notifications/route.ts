import { prisma } from "@/lib/db";
import { apiError, apiOk, getApiUser, metaOf, paging } from "@/lib/api";

/** GET /api/v1/notifications?page= 消息中心（真实数据） */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await getApiUser();
  if (!user) return apiError("请先登录", 401);

  const { page, pageSize, skip } = paging(url, 20);
  const where = { userId: user.id };

  const [total, unreadCount, items] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  return apiOk({ items, unreadCount }, metaOf(page, pageSize, total));
}

/** POST /api/v1/notifications 全部标记已读 */
export async function POST() {
  const user = await getApiUser();
  if (!user) return apiError("请先登录", 401);

  const result = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return apiOk({ updated: result.count });
}
