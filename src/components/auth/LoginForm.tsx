"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/lib/actions/auth";
import { INITIAL_ACTION_STATE } from "@/lib/types";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { useFormValues } from "@/lib/use-form-values";

export function LoginForm({ next = "/" }: { next?: string }) {
  const [state, formAction] = useActionState(loginAction, INITIAL_ACTION_STATE);
  const form = useFormValues({ account: "", password: "" });

  return (
    <form action={formAction} className="space-y-3.5">
      <input type="hidden" name="next" value={next} />
      <Notice message={state.error} tone="error" />

      <div>
        <label className="label" htmlFor="account" data-required>
          手机号 / 邮箱
        </label>
        <input
          id="account"
          {...form.field("account")}
          type="text"
          autoComplete="username"
          required
          placeholder="手机号或邮箱"
          className="input"
        />
      </div>

      <div>
        <label className="label" htmlFor="password" data-required>
          密码
        </label>
        <input
          id="password"
          {...form.field("password")}
          type="password"
          autoComplete="current-password"
          required
          placeholder="请输入登录密码"
          className="input"
        />
      </div>

      <SubmitButton className="btn-primary w-full" pendingText="登录中…">
        登录
      </SubmitButton>

      <p className="text-right text-xs">
        <Link href="/forgot-password" className="font-semibold text-brand">
          忘记密码？
        </Link>
      </p>

      <p className="text-center text-xs text-ink-mute">
        还没有账号？
        <Link href="/register" className="ml-1 font-semibold text-brand">
          手机号 / 邮箱注册
        </Link>
      </p>
    </form>
  );
}
