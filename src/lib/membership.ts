import "server-only";

import { prisma } from "@/lib/db";

/**
 * 跨公司开关由开→关时，作废该派仍处 PENDING 的跨公司加入申请。
 *
 * 竞态说明：旧实现"先 findMany 再逐条 update"，清理期间若申请被审批通过，
 * 会被改回 REMOVED 但 memberCount 已 +1，造成计数漂移。这里把
 * "算跨公司 userId 集合 → updateMany（仅命中仍 PENDING 的行）→ createMany 通知"
 * 全部放进同一事务：SQLite 写事务串行化，事务内快照即最终结果。
 * 派主管理台（updateFactionAction）与运营后台（adminUpdateFactionAction、
 * adminUpdateFactionCompanyAction）共用本实现。
 */
export async function revokeCrossCompanyPendingApplications(
  factionId: string,
  companyId: string,
  factionName: string,
  /** 通知文案可覆盖：换公司场景下「已关闭跨公司加入」会误导申请人 */
  message: { title: string; body: string } = {
    title: `「${factionName}」已关闭跨公司加入`,
    body: "你的申请自动作废",
  },
) {
  await prisma.$transaction(async (tx) => {
    const pending = await tx.factionMember.findMany({
      where: { factionId, status: "PENDING" },
      select: { id: true, userId: true },
    });
    if (!pending.length) return;

    const userIds = [...new Set(pending.map((item) => item.userId))];
    const sameCompany = await tx.employment.findMany({
      where: { userId: { in: userIds }, companyId, status: "VERIFIED" },
      select: { userId: true },
    });
    const sameCompanyUserIds = new Set(sameCompany.map((item) => item.userId));
    const crossRows = pending.filter((item) => !sameCompanyUserIds.has(item.userId));
    if (!crossRows.length) return;

    const updated = await tx.factionMember.updateMany({
      where: { id: { in: crossRows.map((item) => item.id) }, status: "PENDING" },
      data: { status: "REMOVED" },
    });
    if (!updated.count) return;

    await tx.notification.createMany({
      data: crossRows.map((item) => ({
        userId: item.userId,
        type: "SYSTEM",
        title: message.title,
        body: message.body,
        link: "/discover",
      })),
    });
  });
}
