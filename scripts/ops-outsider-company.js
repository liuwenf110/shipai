// 非大厂认证占位公司行（幂等）：Company.scope=OUTSIDER、domains 为空
// 借一条真实公司行让 Employment 外键、后台审核队列、认证计数全部复用现有链路，详见 src/lib/actions/verify.ts
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

const OUTSIDER = {
  id: "cmp_outsider_default",
  name: "其他公司（非大厂）",
  shortName: "非大厂",
  domains: "",
  scope: "OUTSIDER",
  industry: "其他",
  color: "#5B6B7B",
  logoText: "非",
};

(async () => {
  const { id, name, ...rest } = OUTSIDER;
  const row = await p.company.upsert({
    where: { id },
    create: { id, name, ...rest },
    // 不改 name（唯一键）也不动 verifiedCount，只保证阵营与展示字段正确
    update: rest,
  });
  console.log("outsider company:", row.id, row.name, row.scope, "verifiedCount=" + row.verifiedCount);
  const corp = await p.company.count({ where: { scope: "CORP" } });
  console.log("corp companies:", corp);
  await p.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
