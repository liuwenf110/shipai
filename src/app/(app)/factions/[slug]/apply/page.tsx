import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { LeaderApplyForm } from "@/components/faction/LeaderApplyForm";
import { categoryOf } from "@/lib/constants";

export const metadata = { title: "派主认证申请" };

export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser(`/factions/${slug}/apply`);

  const faction = await prisma.faction.findUnique({
    where: { slug },
    include: { company: true, leader: true },
  });
  if (!faction) notFound();

  const [employment, membership, pending, viceLeaderCount] = await Promise.all([
    // 派主 / 副派主申请只要求完成过任一公司认证，公司限制由「必须为本派成员」把关
    prisma.employment.findFirst({
      where: { userId: user.id, status: "VERIFIED" },
    }),
    prisma.factionMember.findUnique({
      where: { factionId_userId: { factionId: faction.id, userId: user.id } },
    }),
    prisma.leaderApplication.findFirst({
      where: { factionId: faction.id, userId: user.id, status: "PENDING" },
    }),
    prisma.factionMember.count({
      where: { factionId: faction.id, status: "ACTIVE", role: "ADMIN" },
    }),
  ]);

  if (!employment) redirect(`/verify`);
  if (!membership || membership.status !== "ACTIVE") {
    redirect(`/factions/${slug}?error=${encodeURIComponent("先加入本派，再申请派主认证")}`);
  }
  if (membership.role !== "MEMBER") {
    redirect(`/factions/${slug}?error=${encodeURIComponent("你已是本派管理者，无需重复申请")}`);
  }

  // 岗位空缺决定可申请角色：无派主→派主；已有派主但无副派主→副派主；两者均就位→不开放
  const requestedRole: "LEADER" | "ADMIN" | null = !faction.leaderId
    ? "LEADER"
    : viceLeaderCount === 0
      ? "ADMIN"
      : null;
  if (!requestedRole) {
    redirect(`/factions/${slug}?error=${encodeURIComponent("本派派主与副派主均已就位，暂不开放申请")}`);
  }

  const meta = categoryOf(faction.category);

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <Link
        href={`/factions/${slug}`}
        className="flex items-center gap-1 text-[12px] font-semibold text-ink-mute hover:text-ink"
      >
        <Icon name="back" size={14} />
        返回 {faction.name}
      </Link>

      <div className="mt-3 flex items-start gap-3">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-2xl text-[22px]"
          style={{ backgroundImage: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}
        >
          {faction.emoji}
        </span>
        <div>
          <h1 className="text-[20px] font-black tracking-tight">
            {requestedRole === "LEADER" ? "申请派主" : "申请副派主"}
          </h1>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-mute">
            {requestedRole === "LEADER"
              ? "本派暂无认证派主，审核通过后你将成为派主，管理成员、内容与活动。"
              : "本派已有认证派主、暂无副派主，审核通过后你将成为副派主，协助日常管理。"}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-mute">
            运营驳回后，你仍保留本派普通成员身份
          </p>
        </div>
      </div>

      <div className="mt-4">
        {pending ? (
          <div className="card p-4">
            <Notice message="你已提交申请，运营正在审核中，请留意站内消息" tone="info" />
          </div>
        ) : (
          <LeaderApplyForm
            factionId={faction.id}
            factionName={faction.name}
            requestedRole={requestedRole}
          />
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {[
          { icon: "users" as const, label: "成员审批与移出" },
          { icon: "pin" as const, label: "置顶公告 / 隐藏违规帖" },
          { icon: "calendar" as const, label: "发起活动并通知全派" },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2.5 text-[11px] font-semibold text-ink-soft ring-1 ring-ink-line/60"
          >
            <Icon name={item.icon} size={14} className="text-brand" />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
