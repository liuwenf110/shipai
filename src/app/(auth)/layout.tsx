import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Icon } from "@/components/Icon";
import { PLATFORM_SLOGAN } from "@/lib/constants";

const POINTS = [
  { icon: "shield" as const, title: "真身份", desc: "在职、离职同事均可认证加入" },
  { icon: "compass" as const, title: "真同好", desc: "瑜伽、户外、徒步、桌游，按兴趣成派" },
  { icon: "flag" as const, title: "真派主", desc: "认证派主可管理成员、活动与内容" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-ink px-12 py-12 text-white lg:flex lg:flex-col">
        <div className="absolute -left-20 -top-24 h-72 w-72 rounded-full bg-brand/40 blur-[90px]" />
        <div className="absolute -bottom-28 right-0 h-72 w-72 rounded-full bg-plum/30 blur-[100px]" />

        <div className="relative flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-white/10 text-[15px] font-black">
            派
          </span>
          <span className="text-[17px] font-black tracking-tight">上十派</span>
        </div>

        <div className="relative mt-auto">
          <p className="text-[11px] font-semibold tracking-[0.3em] text-white/40">
            FOR BIG-TECH PEOPLE
          </p>
          <h2 className="mt-3 text-[34px] font-black leading-[1.18] tracking-tight">
            离职不离圈，
            <br />
            兴趣不断线。
          </h2>
          <p className="mt-3 max-w-[360px] text-[13px] leading-relaxed text-white/55">
            同一家公司、同一种热爱。用真实身份加入瑜伽派、户外派、徒步派、桌游派，
            和在职、离职的同事把爱好继续下去。
          </p>

          <div className="mt-9 space-y-3">
            {POINTS.map((point) => (
              <div key={point.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/80">
                  <Icon name={point.icon} size={16} />
                </span>
                <div>
                  <p className="text-[13px] font-bold">{point.title}</p>
                  <p className="text-[11.5px] text-white/45">{point.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mt-auto pt-10 text-[11px] text-white/30">
          {PLATFORM_SLOGAN} · 仅限已完成公司身份认证的用户参与
        </div>
      </aside>

      <main className="flex min-h-dvh flex-col px-5 pb-10 pt-6 sm:px-8">
        <div className="mb-8 flex items-center justify-between lg:hidden">
          <Logo />
          <Link href="/" className="text-xs font-semibold text-ink-mute">
            随便看看 →
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center">
          {children}
        </div>
        <div className="mx-auto mt-8 hidden w-full max-w-[380px] justify-between text-[11px] text-ink-mute lg:flex">
          <Link href="/" className="hover:text-ink">
            ← 返回首页
          </Link>
          <span>© 2026 上十派</span>
        </div>
      </main>
    </div>
  );
}
