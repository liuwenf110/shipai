import { prisma } from "@/lib/db";
import { loadFactionActivity, sliceFactions } from "@/lib/activity";
import { apiOk, getApiUser, metaOf, paging, PUBLIC_USER } from "@/lib/api";
import { audienceOfUserOrAdmin, factionAccessWhere } from "@/lib/scope";

/** GET /api/v1/factions?category=&company=&q=&page=&pageSize= */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") || undefined;
  const companyId = url.searchParams.get("company") || undefined;
  const q = url.searchParams.get("q")?.trim() || undefined;
  const statusParam = url.searchParams.get("status");
  const statuses = statusParam ? statusParam.split(",").filter(Boolean) : ["ACTIVE", "REVIEWING"];
  const { page, pageSize, skip } = paging(url, 12);
  const user = await getApiUser();
  const audience = await audienceOfUserOrAdmin(user);

  // 与发现页首屏同一隔离口径：后台筛选项走同一接口，漏一条就等于隔了一层窗
  const where = {
    AND: [
      { status: { in: statuses } },
      factionAccessWhere(audience, user?.id),
      category && category !== "ALL" ? { category } : {},
      companyId ? { companyId } : {},
      q
        ? {
            OR: [
              { name: { contains: q } },
              { tagline: { contains: q } },
              { description: { contains: q } },
            ],
          }
        : {},
    ],
  };

  const [total, candidates, activity] = await Promise.all([
    prisma.faction.count({ where }),
    prisma.faction.findMany({
      where,
      include: { company: true, leader: { select: PUBLIC_USER } },
    }),
    loadFactionActivity(),
  ]);

  // 与发现页首屏同一口径：后台权重钉顶，其余按活跃度，排完再切片分页
  const rows = sliceFactions(candidates, activity, skip, pageSize);

  const memberships = user
    ? await prisma.factionMember.findMany({
        where: { userId: user.id, factionId: { in: rows.map((item) => item.id) } },
        select: { factionId: true, status: true },
      })
    : [];
  const joinedMap = new Map(memberships.map((item) => [item.factionId, item.status]));

  const data = rows.map((faction) => ({
    ...faction,
    membershipStatus: joinedMap.get(faction.id) ?? null,
  }));

  return apiOk(data, metaOf(page, pageSize, total));
}
