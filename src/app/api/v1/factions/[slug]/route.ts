import { prisma } from "@/lib/db";
import { apiError, apiOk, getApiUser, PUBLIC_USER } from "@/lib/api";

/** GET /api/v1/factions/[slug] 派详情 + 成员关系 + 待审申请 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await getApiUser();

  const faction = await prisma.faction.findUnique({
    where: { slug },
    include: {
      company: true,
      leader: { select: PUBLIC_USER },
      // 成员数口径与 memberCount 一致：仅统计 ACTIVE，排除 LEFT/REMOVED/PENDING 记录
      _count: {
        select: {
          members: { where: { status: "ACTIVE" } },
          posts: true,
          activities: true,
        },
      },
    },
  });
  if (!faction) return apiError("该派不存在", 404);

  const [membership, application] = await Promise.all([
    user
      ? prisma.factionMember.findUnique({
          where: { factionId_userId: { factionId: faction.id, userId: user.id } },
        })
      : Promise.resolve(null),
    user
      ? prisma.leaderApplication.findFirst({
          where: { factionId: faction.id, userId: user.id, status: "PENDING" },
        })
      : Promise.resolve(null),
  ]);

  const isManager = Boolean(membership?.status === "ACTIVE" && membership.role !== "MEMBER");
  // 待审成员数仅对派管理者可见
  const pendingMemberCount = isManager
    ? await prisma.factionMember.count({ where: { factionId: faction.id, status: "PENDING" } })
    : 0;

  const employments =
    user
      ? await prisma.employment.findMany({
          where: { userId: user.id, status: "VERIFIED" },
          include: { company: { select: { shortName: true } } },
        })
      : [];

  const isVerifiedAnywhere = employments.length > 0;
  const sameCompany = employments.find((e) => e.companyId === faction.companyId) ?? null;
  const isSameCompany = Boolean(sameCompany);
  const isCrossCompany = isVerifiedAnywhere && !isSameCompany;
  const canJoin = isSameCompany || (isVerifiedAnywhere && faction.allowCrossCompany);
  const needApproval = isCrossCompany || faction.joinMode === "APPROVAL";

  return apiOk({
    ...faction,
    membership: membership
      ? { status: membership.status, role: membership.role }
      : null,
    pendingApplication: application
      ? { id: application.id, requestedRole: application.requestedRole }
      : null,
    canJoin,
    isSameCompany,
    isCrossCompany,
    needApproval,
    verifiedCompanies: employments.map((e) => ({
      shortName: e.company.shortName,
      kind: e.kind,
    })),
    isManager,
    pendingMemberCount,
  });
}
