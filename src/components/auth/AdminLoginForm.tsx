"use client";

import { useActionState } from "react";
import { adminLoginAction } from "@/lib/actions/auth";
import { INITIAL_ACTION_STATE } from "@/lib/types";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { useFormValues } from "@/lib/use-form-values";

/** 管理端登录表单：只接受运营账号，与用户端登录完全独立 */
export function AdminLoginForm({ next = "/admin" }: { next?: string }) {
  const [state, formAction] = useActionState(adminLoginAction, INITIAL_ACTION_STATE);
  const form = useFormValues({ email: "", password: "" });

  return (
    <form action={formAction} className="space-y-3.5">
      <input type="hidden" name="next" value={next} />
      <Notice message={state.error} tone="error" />

      <div>
        <label className="label" htmlFor="admin-email" data-required>
          运营邮箱
        </label>
        <input
          id="admin-email"
          {...form.field("email")}
          type="email"
          autoComplete="username"
          required
          placeholder="admin@company.com"
          className="input"
        />
      </div>

      <div>
        <label className="label" htmlFor="admin-password" data-required>
          密码
        </label>
        <input
          id="admin-password"
          {...form.field("password")}
          type="password"
          autoComplete="current-password"
          required
          placeholder="请输入运营账号密码"
          className="input"
        />
      </div>

      <SubmitButton className="btn-primary w-full" pendingText="校验中…">
        进入管理端
      </SubmitButton>
    </form>
  );
}
