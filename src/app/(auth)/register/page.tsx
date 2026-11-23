import { redirect } from "next/navigation";
import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isInviteUsable, normalizeInviteCode } from "@/lib/invite";

const STEPS = [
  { step: "01", title: "注册账号", desc: "手机号 / 邮箱 + 昵称，30 秒完成" },
  { step: "02", title: "验证公司身份", desc: "在职用企业邮箱，离职交材料审核" },
  { step: "03", title: "加入兴趣派", desc: "瑜伽、户外、徒步、桌游任你挑" },
];

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; invite?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect("/");

  const code = params.invite ? normalizeInviteCode(params.invite) : "";
  const invite = code
    ? await prisma.inviteCode.findUnique({
        where: { code },
        include: {
          faction: { include: { company: true } },
          leader: { select: { nickname: true } },
        },
      })
    : null;
  const usableInvite =
    invite && invite.faction.status === "ACTIVE" && isInviteUsable(invite) ? invite : null;

  return (
    <div>
      <h1 className="text-[26px] font-black tracking-tight text-ink">创建上十派账号</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-mute">
        支持手机号或邮箱注册，仅限互联网大厂在职 / 离职员工，加入前需完成公司身份验证。
      </p>

      {usableInvite ? (
        <div className="mt-4 rounded-2xl border border-brand/30 bg-brand-soft/50 px-3.5 py-3">
          <p className="text-[10.5px] font-bold tracking-[0.16em] text-brand-dark">派主邀请</p>
          <p className="mt-1 text-[13px] font-bold text-ink">
            「{usableInvite.faction.name}」派主 {usableInvite.leader.nickname} 邀请你加入
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-mute">
            {usableInvite.faction.company.shortName} · 邀请码已自动填入，注册成功后直接成为本派成员
          </p>
        </div>
      ) : code ? (
        <div className="mt-4 rounded-2xl bg-cream px-3.5 py-3">
          <p className="text-[11px] font-bold text-[#B42318]">该邀请码已失效</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-mute">
            可能已被使用或超过 30 天有效期。你可以直接注册，注册后向派主重新索取邀请码。
          </p>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-3 gap-2">
        {STEPS.map((item) => (
          <div key={item.step} className="rounded-xl bg-white/70 p-2.5 ring-1 ring-ink-line/70">
            <span className="text-[10px] font-black text-brand">{item.step}</span>
            <p className="mt-0.5 text-[11.5px] font-bold text-ink">{item.title}</p>
            <p className="mt-0.5 text-[10px] leading-snug text-ink-mute">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <RegisterForm
          next={params.next ?? "/"}
          inviteCode={usableInvite?.code ?? ""}
          invitedFaction={usableInvite?.faction.name ?? ""}
        />
      </div>

      <p className="mt-4 text-center text-[11px] text-ink-mute">
        已经是成员？<Link href="/login" className="font-semibold text-brand">登录</Link>
      </p>
    </div>
  );
}
