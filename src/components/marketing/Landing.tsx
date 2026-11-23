import Link from "next/link";
import type { Company, Faction } from "@prisma/client";
import type { PublicUser } from "@/lib/revive";
import { FactionCard } from "@/components/FactionCard";
import { Icon } from "@/components/Icon";
import { AVATAR_COLORS_MOCK } from "@/lib/mock";

type FactionWithLeader = Faction & { company: Company; leader: PublicUser | null };

const STEPS = [
  {
    tag: "在职",
    icon: "mail" as const,
    title: "企业邮箱域名验证",
    desc: "填写公司邮箱并接收 6 位验证码，域名命中公司库即自动通过。",
    note: "alibaba-inc.com / bytedance.com / tencent.com …",
  },
  {
    tag: "离职",
    icon: "shield" as const,
    title: "离职材料人工审核",
    desc: "上传离职证明、工牌或社保截图，运营 1 个工作日内完成审核。",
    note: "审核通过后同样可以加入该公司所有兴趣派",
  },
];

const LEADER_POWERS = [
  { icon: "users" as const, title: "成员管理", desc: "审批加入申请、移出成员、查看身份构成" },
  { icon: "message" as const, title: "内容治理", desc: "置顶公告、隐藏违规帖、维护派内氛围" },
  { icon: "calendar" as const, title: "活动组织", desc: "发起线下活动、限制名额、一键通知全派" },
];

export function Landing({
  stats,
  featured,
  companies,
}: {
  stats: { companies: number; factions: number; members: number };
  featured: FactionWithLeader[];
  companies: Company[];
}) {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-5xl px-4 pb-10 pt-8 md:pb-14 md:pt-16">
          <div className="grid items-center gap-10 md:grid-cols-[1.1fr_0.9fr]">
            <div className="animate-rise">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-ink-soft ring-1 ring-ink-line">
                <span className="h-1.5 w-1.5 rounded-full bg-moss" />
                仅限大厂在职 / 离职员工 · 身份双通道认证
              </span>

              <h1 className="mt-5 text-[38px] font-black leading-[1.08] tracking-tight text-ink md:text-[52px]">
                把同事，
                <br />
                处成<span className="relative text-brand">
                  同好
                  <span className="absolute inset-x-0 bottom-1 h-2 -z-10 bg-brand/20" />
                </span>
                。
              </h1>

              <p className="mt-4 max-w-[430px] text-[13.5px] leading-relaxed text-ink-soft">
                上十派是大厂人的兴趣派社区。验证公司身份后，加入瑜伽派、户外派、徒步派、桌游派，
                和在职、离职的同事一起把爱好进行到底——关系从工位延续到山野与牌桌。
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <Link href="/register" className="btn-primary px-5">
                  验证身份，加入上十派
                  <Icon name="right" size={16} />
                </Link>
                {/* 未登录不引导进发现页：保留按钮样式但不可点 */}
                <span className="btn-ghost pointer-events-none px-4">
                  <Icon name="compass" size={16} />
                  先逛逛兴趣派
                </span>
              </div>

              <div className="mt-8 flex items-center gap-6">
                <Stat value={stats.companies} label="已入驻公司" />
                <span className="h-8 w-px bg-ink-line" />
                <Stat value={stats.factions} label="运行中的派" />
                <span className="h-8 w-px bg-ink-line" />
                <Stat value={stats.members} label="入驻用户" />
              </div>
            </div>

            {/* 视觉卡组 */}
            <div className="relative hidden md:block">
              <div className="absolute inset-x-6 -top-4 bottom-6 rotate-[-4deg] rounded-3xl bg-gradient-to-br from-[#FDE68A] to-[#F97316] opacity-70 blur-[1px]" />
              <div className="absolute inset-x-2 -top-1 bottom-2 rotate-[3deg] rounded-3xl bg-gradient-to-br from-[#BBF7D0] to-[#15803D] opacity-60" />
              <div className="card relative overflow-hidden p-5">
                <div className="flex items-center justify-between">
                  <span className="chip">🎵 音乐派 · 招募派主中</span>
                  <span className="text-[10px] font-semibold text-ink-mute">本周活动</span>
                </div>
                <h3 className="mt-3 text-[19px] font-black tracking-tight">下班后一起去排练房 jam</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-mute">
                  吉他、键盘、架子鼓——不限流派，新人友好。离职的老同事也欢迎回来。
                </p>
                <div className="mt-4 flex items-center justify-between rounded-2xl bg-cream p-3">
                  <div className="flex -space-x-2">
                    {AVATAR_COLORS_MOCK.map((color, index) => (
                      <span
                        key={color}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white"
                        style={{ background: color }}
                      >
                        {["林", "周", "顾", "陈", "许"][index]}
                      </span>
                    ))}
                    <span className="flex h-7 items-center justify-center rounded-full bg-white px-2 text-[10px] font-bold text-ink-soft ring-2 ring-white">
                      +N
                    </span>
                  </div>
                  <span className="rounded-full bg-ink px-2.5 py-1 text-[10px] font-bold text-white">
                    我要参加
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-brand-soft/70 px-3 py-2">
                  <Icon name="shield" size={14} className="text-brand-dark" />
                  <span className="text-[11px] font-semibold text-brand-dark">
                    全员均已完成公司身份认证
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 身份认证 */}
      <section className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-bold tracking-[0.22em] text-brand">IDENTITY</p>
            <h2 className="mt-1 text-[22px] font-black tracking-tight">两种身份，都能认证</h2>
          </div>
          <Link href="/verify" className="hidden text-xs font-semibold text-ink-mute hover:text-brand md:block">
            去认证 →
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {STEPS.map((step) => (
            <div key={step.tag} className="card p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-dark">
                  <Icon name={step.icon} size={17} />
                </span>
                <div>
                  <p className="text-[10px] font-bold tracking-widest text-ink-mute">
                    {step.tag === "在职" ? "ACTIVE" : "ALUMNI"}
                  </p>
                  <h3 className="text-[15px] font-bold tracking-tight">{step.title}</h3>
                </div>
              </div>
              <p className="mt-3 text-[12.5px] leading-relaxed text-ink-soft">{step.desc}</p>
              <p className="mt-2.5 rounded-lg bg-cream-sunk px-2.5 py-1.5 text-[10.5px] text-ink-mute">
                {step.note}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 精选派 */}
      <section className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-bold tracking-[0.22em] text-brand">CLUBS</p>
            <h2 className="mt-1 text-[22px] font-black tracking-tight">正在热闹的派</h2>
          </div>
          <span className="pointer-events-none text-xs font-semibold text-ink-mute">
            全部兴趣派 →
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((faction) => (
            // 未登录落地页只展示各派：卡片不可点进派主页（linkable=false）且不展示人数/帖子统计
            <FactionCard key={faction.id} faction={faction} linkable={false} showStats={false} />
          ))}
        </div>
      </section>

      {/* 厂牌墙 */}
      <section className="mx-auto max-w-5xl px-4 py-8">
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-line/70 px-5 py-4">
            <div>
              <h2 className="text-[16px] font-black tracking-tight">已接入的公司</h2>
              <p className="mt-0.5 text-[11px] text-ink-mute">
                企业邮箱域名库持续更新，找不到你的公司可联系运营补充
              </p>
            </div>
            <span className="chip">
              <Icon name="shield" size={11} /> {stats.companies} 家
            </span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-ink-line/60 sm:grid-cols-3 lg:grid-cols-4">
            {companies.map((company) => (
              <div key={company.id} className="flex items-center gap-2.5 bg-white px-4 py-3.5">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-black text-white"
                  style={{ background: company.color }}
                >
                  {company.logoText}
                </span>
                <p className="min-w-0 truncate text-[12.5px] font-bold text-ink">{company.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 招募派主 */}
      <section className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-3xl bg-ink px-6 py-8 text-white md:px-10 md:py-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold tracking-[0.22em] text-brand">FOR LEADERS</p>
              <h2 className="mt-1 text-[24px] font-black leading-tight tracking-tight">
                21 个基础派，
                <br className="md:hidden" />
                正在招募派主
              </h2>
              <p className="mt-2 max-w-[430px] text-[12.5px] leading-relaxed text-white/50">
                所有基础派均已开放加入，派主席位虚位以待。
                如果你是原厂某个兴趣派的组织者，完成身份认证后即可申请派主，
                审核通过后派主身份全平台展示。
              </p>
            </div>
            <span className="btn pointer-events-none bg-white/10 text-white ring-1 ring-white/20">
              <Icon name="flag" size={15} />
              查看招募中的派
            </span>
          </div>

          <div className="mt-7 grid gap-3 md:grid-cols-3">
            {LEADER_POWERS.map((power) => (
              <div key={power.title} className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
                <Icon name={power.icon} size={18} className="text-brand" />
                <p className="mt-2 text-[13px] font-bold">{power.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/45">{power.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-4 pb-10 pt-4">
        <div className="flex flex-col items-start justify-between gap-2 border-t border-ink-line pt-5 text-[11px] text-ink-mute sm:flex-row sm:items-center">
          <span>上十派 · 离职不离圈，兴趣不断线</span>
          <span>身份材料仅用于审核，不对外展示</span>
        </div>
      </footer>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-[22px] font-black leading-none tracking-tight text-ink">
        {value}
        <span className="text-brand">+</span>
      </p>
      <p className="mt-1 text-[10.5px] font-medium text-ink-mute">{label}</p>
    </div>
  );
}
