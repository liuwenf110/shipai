import { prisma } from "@/lib/db";
import { apiError, apiOk, getApiUser } from "@/lib/api";

/** GET /api/v1/me 当前用户档案（身份、厂牌、派、未读数） */
export async function GET() {
  const user = await getApiUser();
  if (!user) return apiError("请先登录", 401);

  const [employments, memberships, unreadCount, postCount, pendingLeader] = await Promise.all([
    prisma.employment.findMany({
      where: { userId: user.id },
      include: { company: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.factionMember.findMany({
      where: { userId: user.id, status: { in: ["ACTIVE", "PENDING"] } },
      include: { faction: { include: { company: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.post.count({ where: { authorId: user.id, status: "PUBLISHED" } }),
    prisma.leaderApplication.count({ where: { userId: user.id, status: "PENDING" } }),
  ]);

  return apiOk({
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      nickname: user.nickname,
      avatarColor: user.avatarColor,
      bio: user.bio,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    },
    employments,
    memberships,
    stats: {
      unreadCount,
      postCount,
      pendingLeader,
      verifiedCompanies: employments.filter((item) => item.status === "VERIFIED").length,
    },
  });
}
