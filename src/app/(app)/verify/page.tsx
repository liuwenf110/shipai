import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { VerifyFlow } from "@/components/verify/VerifyFlow";
import { Badge } from "@/components/Badge";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { EMPLOYMENT_KIND, EMPLOYMENT_STATUS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "身份认证" };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; invited?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser("/verify");

  const [companies, outsiderCompany, employments] = await Promise.all([
    // 大厂磁贴只列已开通的大厂，非大厂认证走单独入口（占位公司行 scope=OUTSIDER）
    prisma.company.findMany({ where: { scope: "CORP" }, orderBy: { verifiedCount: "desc" } }),
    prisma.company.findFirst({ where: { scope: "OUTSIDER" }, orderBy: { createdAt: "asc" } }),
    prisma.employment.findMany({
      where: { userId: user.id },
      include: { company: true },
      orderBy: [{ verifiedAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const verified = employments.filter((item) => item.status === "VERIFIED");

  // 邀请码注册：已完成自动入派，提示补完身份认证
  const invitedFaction = params.invited
    ? await prisma.faction.findUnique({
        where: { slug: params.invited },
        select: { name: true, slug: true },
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold tracking-[0.22em] text-brand">IDENTITY</p>
          <h1 className="mt-1 text-[24px] font-black tracking-tight">公司身份认证</h1>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-mute">
            通过认证后才能加入对应的兴趣派，认证信息只会以「在职 / 离职」标签展示。
            不在已开通大厂名单里的，可以走「非大厂认证」，由运营人工审核。
          </p>
        </div>
        <Link href="/inbox" className="btn-ghost btn-sm">
          <Icon name="mail" size={14} />
          发件记录
        </Link>
      </div>

      {params.welcome ? (
        <Notice
          message="账号创建成功，先完成公司身份认证，再去挑选兴趣派"
          tone="info"
          className="mt-4"
        />
      ) : null}

      {invitedFaction ? (
        <div className="mt-2 rounded-2xl border border-brand/30 bg-brand-soft/50 px-3.5 py-3">
          <p className="text-[12px] font-bold text-ink">
            你已通过邀请码加入「{invitedFaction.name}」
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-mute">
            完成一家公司的身份认证后，就能在派内发帖、评论与报名活动。
          </p>
          <Link
            href={`/factions/${invitedFaction.slug}`}
            className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-brand"
          >
            先去看看这个派 <Icon name="right" size={11} />
          </Link>
        </div>
      ) : null}

      {/* 已提交记录 */}
      {employments.length ? (
        <div className="mt-4 space-y-2.5">
          {employments.map((employment) => {
            const meta =
              EMPLOYMENT_STATUS[employment.status as keyof typeof EMPLOYMENT_STATUS] ??
              EMPLOYMENT_STATUS.PENDING;
            // 非大厂记录挂在系统占位公司行上，对用户只报他自报的公司名
            const isOutsider = employment.company.scope === "OUTSIDER";
            const displayName = isOutsider
              ? (employment.employerName ?? "非大厂身份")
              : employment.company.name;
            return (
              <div key={employment.id} className="card p-3.5">
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[11px] font-black text-white"
                    style={{ background: employment.company.color }}
                  >
                    {employment.company.logoText}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-[13.5px] font-bold text-ink">{displayName}</p>
                      <Badge tone={meta.tone as "warn" | "ok" | "bad"}>{meta.label}</Badge>
                      <Badge tone="mute">
                        {EMPLOYMENT_KIND[employment.kind as keyof typeof EMPLOYMENT_KIND]?.label ??
                          employment.kind}
                      </Badge>
                      {isOutsider ? <Badge tone="violet">非大厂</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink-mute">
                      {employment.method === "EMAIL"
                        ? `企业邮箱验证 · ${employment.workEmail ?? ""}`
                        : isOutsider
                          ? `人工审核 · 在职证明${employment.title ? ` · ${employment.title}` : ""}`
                          : `人工审核 · ${employment.title ?? "未填写部门"}`}
                      {employment.verifiedAt ? ` · ${formatDate(employment.verifiedAt)} 通过` : ""}
                    </p>
                    {employment.reviewerNote ? (
                      <p className="mt-1.5 rounded-lg bg-cream px-2 py-1.5 text-[10.5px] leading-relaxed text-ink-soft">
                        运营备注：{employment.reviewerNote}
                      </p>
                    ) : null}
                    {employment.status === "VERIFIED" ? (
                      <Link
                        href={isOutsider ? "/discover" : `/discover?company=${employment.companyId}`}
                        className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-brand"
                      >
                        {isOutsider ? "查看非大厂的派" : "查看该公司的派"} <Icon name="right" size={11} />
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-5">
        <VerifyFlow companies={companies} outsider={outsiderCompany} />
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        {[
          { icon: "lock" as const, title: "材料不公开", desc: "仅运营审核时可见" },
          { icon: "shield" as const, title: "防冒用", desc: "邮箱域 + 材料双重校验" },
          { icon: "users" as const, title: "权益一致", desc: "在职/离职同权" },
        ].map((item) => (
          <div key={item.title} className="rounded-xl bg-white/70 p-3 ring-1 ring-ink-line/60">
            <Icon name={item.icon} size={15} className="text-ink-mute" />
            <p className="mt-1.5 text-[11.5px] font-bold text-ink">{item.title}</p>
            <p className="text-[10px] text-ink-mute">{item.desc}</p>
          </div>
        ))}
      </div>

      {verified.length >= 2 ? (
        <div className="mt-3 rounded-xl bg-ink px-3.5 py-3 text-white">
          <p className="text-[12px] font-bold">你已点亮 {verified.length} 枚厂牌</p>
          <p className="mt-0.5 text-[10.5px] text-white/50">
            可在「我的」页查看完整厂牌墙，每家公司都可以加入对应的兴趣派。
          </p>
        </div>
      ) : null}
    </div>
  );
}
