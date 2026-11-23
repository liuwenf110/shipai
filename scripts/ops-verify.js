// 运营大师执行后的生产库核验（只读）
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const q = async (s) => {
  const r = await p.$queryRawUnsafe(s);
  return Array.isArray(r) ? Object.values(r[0])[0] : r;
};
(async () => {
  console.log("users", await q("SELECT COUNT(*) c FROM User"));
  console.log("ops_users", await q("SELECT COUNT(*) c FROM User WHERE bio LIKE '[ops]%'"));
  console.log("posts", await q("SELECT COUNT(*) c FROM Post"));
  console.log("comments", await q("SELECT COUNT(*) c FROM Comment"));
  console.log("likes", await q("SELECT COUNT(*) c FROM PostLike"));
  console.log("orphan_posts", await q("SELECT COUNT(*) c FROM Post p LEFT JOIN User u ON p.authorId=u.id WHERE u.id IS NULL"));
  console.log("orphan_members", await q("SELECT COUNT(*) c FROM FactionMember m LEFT JOIN User u ON m.userId=u.id WHERE u.id IS NULL"));
  console.log("fake_left", await q("SELECT COUNT(*) c FROM User WHERE email GLOB '*[0-9]@*inc.com'"));
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
