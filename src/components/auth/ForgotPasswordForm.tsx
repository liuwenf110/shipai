"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";
import { confirmResetCode, sendResetCode } from "@/lib/actions/password";
import { INITIAL_ACTION_STATE } from "@/lib/types";
import { cn } from "@/lib/utils";

/** 忘记密码：两步（发码 → 验证码 + 新密码），沿用在职认证的受控两步交互 */
export function ForgotPasswordForm() {
  const [sendState, sendAction] = useActionState(sendResetCode, INITIAL_ACTION_STATE);
  const [confirmState, confirmAction] = useActionState(confirmResetCode, INITIAL_ACTION_STATE);
  const [codeSent, setCodeSent] = useState(false);
  // 字段受控：提交失败后 React 会重置 DOM，受控值能保住已填内容供用户直接修改重提
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (sendState.ok) setCodeSent(true);
  }, [sendState.ok]);

  if (confirmState.ok) {
    return (
      <div className="rounded-2xl bg-[#E9F6EF] p-4 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-moss">
          <Icon name="check" size={20} />
        </span>
        <p className="mt-2 text-[13px] font-bold text-moss">密码已重置</p>
        <p className="mt-0.5 text-[11px] text-[#3D6B58]">出于安全考虑，你已退出所有设备，请用新密码登录</p>
        <Link href="/login" className="btn-primary btn-sm mt-3">
          前往登录
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <form action={sendAction} className="space-y-3">
        <div>
          <label className="label" htmlFor="fp-email" data-required>
            账号邮箱
          </label>
          <input
            id="fp-email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setCodeSent(false);
            }}
            placeholder="注册时使用的邮箱"
            className="input"
          />
        </div>
        <Notice message={sendState.error} tone="error" />
        <Notice message={sendState.message} tone="ok" />
        {sendState.devCode ? (
          <div className="rounded-xl border border-dashed border-brand/40 bg-brand-soft/60 px-3 py-2.5">
            <p className="text-[11px] font-bold text-brand-dark">开发模式 · 验证码已直出</p>
            <p className="mt-0.5 text-[13px] font-black tracking-[0.3em] text-ink">{sendState.devCode}</p>
          </div>
        ) : null}
        <SubmitButton className="btn-ghost w-full" pendingText="发送中…">
          <Icon name="mail" size={15} />
          {codeSent ? "重新发送验证码" : "发送验证码"}
        </SubmitButton>
      </form>

      <form
        action={confirmAction}
        className={cn(
          "space-y-3 rounded-2xl p-3",
          codeSent ? "bg-cream" : "border border-dashed border-ink-line/80",
        )}
      >
        <input type="hidden" name="email" value={email} />
        <div>
          <label className="label" htmlFor="fp-code" data-required>
            6 位验证码
          </label>
          <input
            id="fp-code"
            name="code"
            inputMode="numeric"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="请输入邮件中的验证码"
            className="input text-center text-[18px] font-bold tracking-[0.45em]"
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="label" htmlFor="fp-password" data-required>
              新密码
            </label>
            <input
              id="fp-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 8 位，含字母和数字"
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="fp-confirm" data-required>
              确认新密码
            </label>
            <input
              id="fp-confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="再输一次"
              className="input"
            />
          </div>
        </div>
        {!codeSent ? (
          <p className="text-[10.5px] leading-relaxed text-ink-mute">
            已收到验证码？直接输入即可校验；未收到请先点上方「发送验证码」。
          </p>
        ) : null}
        <Notice message={confirmState.error} tone="error" />
        <SubmitButton className="btn-primary w-full" pendingText="重置中…">
          重置密码
        </SubmitButton>
      </form>

      <p className="text-center text-xs text-ink-mute">
        想起密码了？
        <Link href="/login" className="ml-1 font-semibold text-brand">
          返回登录
        </Link>
      </p>
    </div>
  );
}
