/**
 * QA 测试数据准备脚本（仅本地开发库使用）
 * 用法：npx tsx prisma/qa-fixtures.ts
 *
 * 目的：给「派主管理台 / 运营后台」的审核与治理页面准备可操作的待办数据，
 * 便于逐页做功能回归；脚本幂等，可重复执行。
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("demo123456", 10);

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("缺少运营账号，请先执行 npm run db:seed");

  const leader = await prisma.user.findUnique({ where: { email: "zhixia@alibaba-inc.com" } });
  if (!leader) throw new Error("缺少派主测试账号 zhixia@alibaba-inc.com");

  const alibaba = await prisma.company.findFirst({ where: { domains: { contains: "alibaba-inc.com" } } });
  if (!alibaba) throw new Error("缺少阿里巴巴公司数据");

  const yoga = await prisma.faction.findUnique({ where: { slug: "yoga" } });
  if (!yoga) throw new Error("缺少 yoga 派数据");

  // 1. 指定派主 + 派主成员身份
  await prisma.faction.update({ where: { id: yoga.id }, data: { leaderId: leader.id } });
  await prisma.factionMember.upsert({
    where: { factionId_userId: { factionId: yoga.id, userId: leader.id } },
    create: { factionId: yoga.id, userId: leader.id, role: "LEADER", status: "ACTIVE" },
    update: { role: "LEADER", status: "ACTIVE" },
  });

  // 2. 派内成员（同为 ACTIVE）+ 一位待审加入申请
  const candidates = await prisma.user.findMany({
    where: { email: { in: ["shenzhou@alibaba-inc.com", "bailu@alibaba-inc.com", "chenxi@meituan.com"] } },
    select: { id: true, email: true },
  });
  for (const person of candidates) {
    await prisma.factionMember.upsert({
      where: { factionId_userId: { factionId: yoga.id, userId: person.id } },
      create: { factionId: yoga.id, userId: person.id, role: "MEMBER", status: "ACTIVE" },
      update: { role: "MEMBER", status: "ACTIVE" },
    });
  }
  const pendingPerson = candidates.find((item) => item.email === "chenxi@meituan.com");
  if (pendingPerson) {
    await prisma.factionMember.update({
      where: { factionId_userId: { factionId: yoga.id, userId: pendingPerson.id } },
      data: { status: "PENDING", appliedAt: new Date() },
    });
  }

  // 3. 未来活动 + 一条报名
  const activity = await prisma.activity.upsert({
    where: { id: "qa_activity_yoga_0001" },
    create: {
      id: "qa_activity_yoga_0001",
      factionId: yoga.id,
      creatorId: leader.id,
      title: "QA 测试·周末晨跑",
      description: "测试用活动说明",
      location: "西湖断桥",
      startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      capacity: 5,
    },
    update: { startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });
  const memberA = candidates.find((item) => item.email === "shenzhou@alibaba-inc.com");
  if (memberA) {
    await prisma.activitySignup.upsert({
      where: { activityId_userId: { activityId: activity.id, userId: memberA.id } },
      create: { activityId: activity.id, userId: memberA.id },
      update: { status: "GOING" },
    });
    await prisma.activity.update({ where: { id: activity.id }, data: { signupCount: 1 } });
  }

  // 4. 待审身份认证（材料审核）
  const alumni = await prisma.user.findUnique({ where: { email: "gunan@tencent.com" } });
  const tencent = await prisma.company.findFirst({ where: { domains: { contains: "tencent.com" } } });
  if (alumni && tencent) {
    await prisma.employment.upsert({
      where: { userId_companyId_kind: { userId: alumni.id, companyId: tencent.id, kind: "ALUMNI" } },
      create: {
        userId: alumni.id,
        companyId: tencent.id,
        kind: "ALUMNI",
        status: "PENDING",
        method: "MANUAL",
        title: "IEG · 游戏策划",
        startedYear: 2018,
        leftYear: 2024,
        proofNote: "QA 测试用离职证明说明",
      },
      update: { status: "PENDING", reviewerId: null, reviewerNote: null, reviewedAt: null },
    });
  }

  // 5. 待审派主申请（给没有派主的派，避免与「已有派主」校验冲突）
  const outdoor = await prisma.faction.findUnique({ where: { slug: "outdoor" } });
  const applicant = await prisma.user.findUnique({ where: { email: "shenzhou@alibaba-inc.com" } });
  if (outdoor && applicant) {
    await prisma.faction.update({ where: { id: outdoor.id }, data: { leaderId: null } });
    await prisma.factionMember.upsert({
      where: { factionId_userId: { factionId: outdoor.id, userId: applicant.id } },
      create: { factionId: outdoor.id, userId: applicant.id, role: "MEMBER", status: "ACTIVE" },
      update: { status: "ACTIVE" },
    });
    const exists = await prisma.leaderApplication.findFirst({
      where: { factionId: outdoor.id, status: "PENDING" },
    });
    if (!exists) {
      await prisma.leaderApplication.create({
        data: {
          factionId: outdoor.id,
          userId: applicant.id,
          requestedRole: "LEADER",
          reason: "QA 测试·申请担任户外派派主",
          plan: "每周组织一次徒步，每月一次露营",
          experience: "带过 3 次公司团建",
        },
      });
    }
  }

  // 6. 待审邀请码申请
  const pendingInvite = await prisma.inviteCode.findFirst({
    where: { factionId: yoga.id, status: "PENDING" },
  });
  if (!pendingInvite) {
    await prisma.inviteCode.create({
      data: { factionId: yoga.id, leaderId: leader.id, note: "QA 测试·邀请两位同事入派" },
    });
  }

  // 7. 待处理举报（指向 yoga 派的一条已发布帖子）
  const post = await prisma.post.findFirst({
    where: { factionId: yoga.id, status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
  });
  const reporter = candidates[0];
  if (post && reporter) {
    await prisma.report.upsert({
      where: {
        targetType_targetId_reporterId: {
          targetType: "POST",
          targetId: post.id,
          reporterId: reporter.id,
        },
      },
      create: {
        targetType: "POST",
        targetId: post.id,
        reporterId: reporter.id,
        reason: "SPAM",
        detail: "QA 测试用举报内容",
        status: "PENDING",
      },
      update: { status: "PENDING", handledById: null, handledAt: null, handledNote: null },
    });
  }

  // 8. 确保测试账号可登录（统一密码 demo123456）
  await prisma.user.updateMany({
    where: {
      email: {
        in: [
          "admin@changpai.app",
          "zhixia@alibaba-inc.com",
          "shenzhou@alibaba-inc.com",
          "bailu@alibaba-inc.com",
          "chenxi@meituan.com",
          "gunan@tencent.com",
        ],
      },
    },
    data: { passwordHash, status: "ACTIVE" },
  });

  const summary = {
    admin: "admin@changpai.app",
    leader: "zhixia@alibaba-inc.com",
    member: "shenzhou@alibaba-inc.com",
    crossCompany: "chenxi@meituan.com",
    faction: yoga.slug,
    activityId: activity.id,
    postId: post?.id ?? null,
  };
  console.log("QA fixtures ready:", summary);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
