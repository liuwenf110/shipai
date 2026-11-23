"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { registerAction } from "@/lib/actions/auth";
import { INITIAL_ACTION_STATE } from "@/lib/types";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { DisclaimerConsent } from "@/components/auth/DisclaimerConsent";
import { cn } from "@/lib/utils";

type RegisterValues = {
  account: string;
  email: string;
  nickname: string;
  password: string;
  confirm: string;
  inviteCode: string;
  inviteFrom: string;
  terms: boolean;
};

export function RegisterForm({
  next = "/",
  inviteCode = "",
  invitedFaction = "",
}: {
  next?: string;
  inviteCode?: string;
  invitedFaction?: string;
}) {
  const [state, formAction] = useActionState(registerAction, INITIAL_ACTION_STATE);
  const [channel, setChannel] = useState<"phone" | "email">("phone");
  // 字段受控：表单提交后 React 会重置 DOM，受控值能保住已填内容供用户修改重提
  const [values, setValues] = useState<RegisterValues>({
    account: "",
    email: "",
    nickname: "",
    password: "",
    confirm: "",
    inviteCode,
    inviteFrom: "",
    terms: false,
  });
  const errors = state.fieldErrors ?? {};
  const phoneMode = channel === "phone";

  function update<K extends keyof RegisterValues>(key: K, value: RegisterValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function switchChannel(target: "phone" | "email") {
    if (target === channel) return;
    setChannel(target);
    // 手机号与邮箱格式不同，切换通道时清空账号，避免带着上一种格式的值提交
    update("account", "");
  }

  return (
    <form action={formAction} className="space-y-3.5">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="channel" value={channel} />
      <Notice message={state.error} tone="error" />
      <p className="text-[11px] text-ink-mute">
        带 <span className="text-brand">*</span> 的为必填项
      </p>

      <div className="flex rounded-full bg-cream p-1">
        <button
          type="button"
          onClick={() => switchChannel("phone")}
          className={cn("tab-pill flex-1", phoneMode && "tab-pill-active")}
        >
          手机号注册
        </button>
        <button
          type="button"
          onClick={() => switchChannel("email")}
          className={cn("tab-pill flex-1", !phoneMode && "tab-pill-active")}
        >
          邮箱注册
        </button>
      </div>

      <div>
        <label className="label" htmlFor="account" data-required>
          {phoneMode ? "手机号" : "常用邮箱"}
        </label>
        <input
          id="account"
          name="account"
          type={phoneMode ? "tel" : "email"}
          inputMode={phoneMode ? "tel" : "email"}
          autoComplete={phoneMode ? "tel" : "email"}
          required
          maxLength={phoneMode ? 11 : undefined}
          value={values.account}
          onChange={(event) => update("account", event.target.value)}
          placeholder={phoneMode ? "11 位手机号，用于登录" : "用于登录与接收审核结果"}
          className="input"
        />
        <FieldError message={errors.account} />
        <p className="hint mt-1">
          {phoneMode
            ? "手机号仅用于登录，公司身份仍需企业邮箱或离职材料认证。"
            : "在职认证时另填企业邮箱，个人邮箱仅用于登录。"}
        </p>
      </div>

      {phoneMode ? (
        <div>
          <label className="label" htmlFor="email" data-required>
            常用邮箱
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={values.email}
            onChange={(event) => update("email", event.target.value)}
            placeholder="用于找回密码与接收审核结果"
            className="input"
          />
          <FieldError message={errors.email} />
          <p className="hint mt-1">手机号注册也需绑定邮箱，忘记密码时凭此邮箱找回。</p>
        </div>
      ) : null}

      <div>
        <label className="label" htmlFor="nickname" data-required>
          昵称
        </label>
        <input
          id="nickname"
          name="nickname"
          required
          minLength={2}
          maxLength={32}
          value={values.nickname}
          onChange={(event) => update("nickname", event.target.value)}
          placeholder="同事怎么称呼你，中英文都可以"
          className="input"
        />
        <p className="hint mt-1">2-32 个字符，支持中文、英文、数字。</p>
        <FieldError message={errors.nickname} />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="label" htmlFor="password" data-required>
            密码
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={values.password}
            onChange={(event) => update("password", event.target.value)}
            placeholder="至少 8 位"
            className="input"
          />
          <FieldError message={errors.password} />
        </div>
        <div>
          <label className="label" htmlFor="confirm" data-required>
            确认密码
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={values.confirm}
            onChange={(event) => update("confirm", event.target.value)}
            placeholder="再输一次"
            className="input"
          />
          <FieldError message={errors.confirm} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="inviteCode">
          邀请码（选填）
        </label>
        <input
          id="inviteCode"
          name="inviteCode"
          value={values.inviteCode}
          onChange={(event) => update("inviteCode", event.target.value)}
          maxLength={16}
          placeholder="有派主的邀请码就填在这里"
          className="input uppercase tracking-[0.12em]"
        />
        <p className="hint mt-1">
          {invitedFaction
            ? `注册成功后自动加入「${invitedFaction}」，无需再申请`
            : "填写有效邀请码，注册后自动加入对应兴趣派"}
        </p>
        <FieldError message={errors.inviteCode} />
      </div>

      <div>
        <label className="label" htmlFor="inviteFrom">
          邀请人（选填）
        </label>
        <input
          id="inviteFrom"
          name="inviteFrom"
          value={values.inviteFrom}
          onChange={(event) => update("inviteFrom", event.target.value)}
          placeholder="填写邀请你的同事昵称，方便派主认领"
          className="input"
        />
      </div>

      <DisclaimerConsent
        error={errors.terms}
        checked={values.terms}
        onCheckedChange={(checked) => update("terms", checked)}
      />

      <SubmitButton className="btn-primary w-full" pendingText="创建中…">
        注册并验证公司身份
      </SubmitButton>

      <p className="text-center text-[11px] leading-relaxed text-ink-mute">
        注册即表示同意仅以「同厂同好」为目的使用平台，
        <br />
        身份材料仅用于审核，不会公开展示。
      </p>

      <p className="text-center text-xs text-ink-mute">
        已有账号？
        <Link href="/login" className="ml-1 font-semibold text-brand">
          直接登录
        </Link>
      </p>
    </form>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-[11px] font-medium text-[#B42318]">{message}</p>;
}
