import { prisma } from "@/lib/db";
import { apiError, apiOk, getApiUser } from "@/lib/api";
import { syncGroupMembership } from "@/lib/groupchat";
import { audienceOfUserOrAdmin, canAccessFaction } from "@/lib/scope";

/** POST /api/v1/activities/[id]/signup 报名 / 取消报名（切换） */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getApiUser();
  if (!user) return apiError("请先登录", 401);

  const activity = await prisma.activity.findUnique({ where: { id } });
  if (!activity) return apiError("活动不存在", 404);

  // 报名不要求入派，因此必须单独拦跨阵营：否则外部用户能通过接口报上大厂活动并收到名单
  const audience = await audienceOfUserOrAdmin(user);
  if (!(await canAccessFaction(activity.factionId, audience, user.id))) {
    return apiError("活动不存在", 404);
  }

  // 认证过的用户（在职或离职）无需加入派系即可直接报名活动
  const verified = await prisma.employment.findFirst({
    where: { userId: user.id, status: "VERIFIED" },
    select: { id: true },
  });
  if (!verified) {
    return apiError("完成公司身份认证后即可参加活动", 403);
  }

  const existing = await prisma.activitySignup.findUnique({
    where: { activityId_userId: { activityId: id, userId: user.id } },
  });

  if (existing?.status === "GOING") {
    await prisma.$transaction([
      prisma.activitySignup.update({
        where: { id: existing.id },
        data: { status: "CANCELLED" },
      }),
      prisma.activity.update({
        where: { id },
        data: { signupCount: { decrement: 1 } },
      }),
    ]);
    // 退报同步退出该活动已拉起的群聊
    await syncGroupMembership(id, user.id, false);
    const updated = await prisma.activity.findUnique({
      where: { id },
      select: { signupCount: true },
    });
    return apiOk({ signedUp: false, signupCount: updated?.signupCount ?? 0 });
  }

  if (activity.status !== "OPEN") return apiError("活动已关闭报名");
  // capacity=0 表示不限人数，不参与满员拦截
  if (activity.capacity > 0 && activity.signupCount >= activity.capacity) return apiError("名额已满");

  await prisma.$transaction([
    existing
      ? prisma.activitySignup.update({
          where: { id: existing.id },
          data: { status: "GOING" },
        })
      : prisma.activitySignup.create({ data: { activityId: id, userId: user.id } }),
    prisma.activity.update({ where: { id }, data: { signupCount: { increment: 1 } } }),
  ]);
  // 群已拉起时重新报名自动回到群里
  await syncGroupMembership(id, user.id, true);

  const updated = await prisma.activity.findUnique({
    where: { id },
    select: { signupCount: true },
  });
  return apiOk({ signedUp: true, signupCount: updated?.signupCount ?? 0 });
}
