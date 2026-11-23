import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/Section";
import { NewFactionForm } from "@/components/faction/NewFactionForm";

export const metadata = { title: "组建新派" };

export default async function NewFactionPage() {
  const user = await requireUser("/factions/new");

  const employments = await prisma.employment.findMany({
    where: { userId: user.id, status: "VERIFIED" },
    include: { company: true },
  });
  const companies = employments.map((item) => item.company);

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <Link
        href="/discover"
        className="flex items-center gap-1 text-[12px] font-semibold text-ink-mute hover:text-ink"
      >
        <Icon name="back" size={14} />
        发现
      </Link>

      <div className="mt-3">
        <p className="text-[11px] font-bold tracking-[0.22em] text-brand">NEW CLUB</p>
        <h1 className="mt-1 text-[24px] font-black tracking-tight">组建一个新的派</h1>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-mute">
          为你的公司开一个新兴趣派。提交后由运营审核，通过即成为认证派主，可管理成员、内容与活动。
        </p>
      </div>

      <div className="mt-4">
        {companies.length ? (
          <NewFactionForm companies={companies} />
        ) : (
          <div className="card">
            <EmptyState
              icon="shield"
              title="还没有完成公司身份认证"
              desc="建派需要对该公司完成在职邮箱或离职材料认证，认证通过后即可创建"
              actionLabel="去认证身份"
              actionHref="/verify"
            />
          </div>
        )}
      </div>
    </div>
  );
}
