"use client";

import { useActionState } from "react";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { changePasswordAction } from "@/lib/actions/account";
import { INITIAL_ACTION_STATE } from "@/lib/types";
import { useFormValues } from "@/lib/use-form-values";

/** 修改密码：字段受控，校验失败时保留已填内容（改密成功后服务端会重定向） */
export function PasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, INITIAL_ACTION_STATE);
  const form = useFormValues({ current: "", next: "", confirm: "" });

  return (
    <form action={formAction} className="space-y-2.5 border-t border-ink-line/60 px-4 py-3">
      <Notice message={state.error} tone="error" />
      <div>
        <label className="label" data-required>
          当前密码
        </label>
        <input
          type="password"
          {...form.field("current")}
          required
          className="input"
          autoComplete="current-password"
        />
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div>
          <label className="label" data-required>
            新密码
          </label>
          <input
            type="password"
            {...form.field("next")}
            required
            minLength={8}
            className="input"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="label" data-required>
            确认新密码
          </label>
          <input
            type="password"
            {...form.field("confirm")}
            required
            minLength={8}
            className="input"
            autoComplete="new-password"
          />
        </div>
      </div>
      <p className="hint">至少 8 位，需同时包含字母和数字；改密后其它设备需重新登录。</p>
      <SubmitButton className="btn-primary btn-sm" pendingText="更新中…">
        更新密码
      </SubmitButton>
    </form>
  );
}
