// ⚠️ 一次性迁移脚本（2026-11 上线 recruit 列时执行）：已于 2026-11-24 全量重置线上数据，
// 禁止再次执行——公告/置顶帖的招募标由作者主动勾选，不得自动补标。
// 首页公开招募回填（幂等）：Post.recruit 是本次新增列，存量帖默认 false，
// 直接上线会让首页「首页公开招募」区块整块空掉，所以按「派主对外发布的那几类帖」补标：
// 1) ACTIVE 派里 status=PUBLISHED 且（公告 kind=ANNOUNCE 或置顶 pinned）的帖全部标招募；
// 2) 仍一条招募帖都没有的 ACTIVE 派，把它最新一条 PUBLISHED 帖标上，保证每个派至少露一次。
// 远端执行顺序固定：prisma generate → db push → node scripts/ops-recruit-backfill.js → restart
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const activeFactionIds = (await p.faction.findMany({ where: { status: "ACTIVE" }, select: { id: true } })).map(
    (row) => row.id,
  );

  const announced = await p.post.updateMany({
    where: {
      factionId: { in: activeFactionIds },
      status: "PUBLISHED",
      recruit: false,
      OR: [{ kind: "ANNOUNCE" }, { pinned: true }],
    },
    data: { recruit: true },
  });

  // 逐派补一条最新的：count 不支持 distinct，改成分页取有帖的派再逐个补
  const withRecruit = await p.post.groupBy({
    by: ["factionId"],
    where: { factionId: { in: activeFactionIds }, status: "PUBLISHED", recruit: true },
    _count: { _all: true },
  });
  const covered = new Set(withRecruit.map((row) => row.factionId));
  const missing = activeFactionIds.filter((id) => !covered.has(id));

  let topped = 0;
  for (const factionId of missing) {
    const latest = await p.post.findFirst({
      where: { factionId, status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!latest) continue;
    await p.post.update({ where: { id: latest.id }, data: { recruit: true } });
    topped += 1;
  }

  const total = await p.post.count({ where: { recruit: true, status: "PUBLISHED" } });
  const factions = await p.post.groupBy({
    by: ["factionId"],
    where: { recruit: true, status: "PUBLISHED" },
    _count: { _all: true },
  });
  console.log(
    `recruit backfill: 公告/置顶补标=${announced.count}，无招募帖的派补最新一条=${topped}，` +
      `当前招募帖总数=${total}，覆盖派数=${factions.length}/${activeFactionIds.length}`,
  );
  await p.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
