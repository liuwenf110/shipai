import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "找回密码 - 上十派" };

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="text-[26px] font-black tracking-tight text-ink">找回密码</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-mute">
        输入注册时的账号邮箱，我们会发送 6 位验证码帮你重置登录密码。
      </p>
      <div className="mt-6">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
