// 活动群聊成员与报名状态的联动：报名进群、退报出群。
// 群未拉起（发起人还没一键建群）时一切静默——建群时会把当时全部 GOING 报名一次性拉入。
import { prisma } from "@/lib/db";

export async function syncGroupMembership(
  activityId: string,
  userId: string,
  active: boolean,
) {
  const group = await prisma.groupChat.findUnique({
    where: { activityId },
    select: { id: true },
  });
  if (!group) return;
  if (active) {
    await prisma.groupChatMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId } },
      create: { groupId: group.id, userId },
      update: {},
    });
  } else {
    await prisma.groupChatMember.deleteMany({
      where: { groupId: group.id, userId },
    });
  }
}
