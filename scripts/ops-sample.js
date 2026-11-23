// 抽检：ops 帖分布 + 线上页面渲染断言（只读）
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const posts = await p.post.findMany({
    where: { author: { bio: { startsWith: "[ops]" } } },
    select: { content: 1, faction: { select: { slug: 1 } } },
  });
  const bySlug = {};
  for (const x of posts) (bySlug[x.faction.slug] ||= []).push(x.content.slice(0, 18));
  for (const [slug, snippets] of Object.entries(bySlug)) {
    console.log(slug + " -> " + snippets.length + " 帖, 样例: " + snippets[0]);
  }
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
