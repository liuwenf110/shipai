import { prisma } from "@/lib/db";
import { apiOk } from "@/lib/api";

/** GET /api/v1/companies 公司列表（含已认证人数与派数量） */
export async function GET() {
  const companies = await prisma.company.findMany({
    include: {
      _count: {
        select: {
          factions: true,
          employments: { where: { status: "VERIFIED" } },
        },
      },
    },
  });

  const sorted = companies.sort((a, b) => b._count.employments - a._count.employments);
  return apiOk(sorted);
}
