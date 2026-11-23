import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { hasWxNeedNicknameFlag } from "@/lib/wx";
import { WelcomeNicknameForm } from "@/components/auth/WelcomeNicknameForm";

// 根 layout 的 title.template 会自动补「 · 上十派」，此处再写一遍会变成品牌名重复
export const metadata: Metadata = { title: "设置昵称" };

/**
 * 微信一键注册后的昵称引导页：只有带着「待设置昵称」标记时才可达，
 * 保存或跳过都续上原有的 /verify 身份认证流程。
 */
export default async function WelcomePage() {
  const user = await requireUser("/verify");
  if (!(await hasWxNeedNicknameFlag())) redirect("/verify");

  return (
    <div>
      <p className="text-[11px] font-bold tracking-[0.22em] text-brand">WELCOME</p>
      <h1 className="mt-1.5 text-[26px] font-black tracking-tight text-ink">
        欢迎加入上十派
      </h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-mute">
        微信只给了我们一个占位名字「{user.nickname}」，给自己起个昵称吧，
        之后也能在「我的」页面随时改。
      </p>
      <div className="mt-6">
        <WelcomeNicknameForm nickname={user.nickname} />
      </div>
    </div>
  );
}
