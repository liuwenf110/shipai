"use client";

import { useActionState } from "react";
import { INITIAL_ACTION_STATE } from "@/lib/types";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { useFormValues } from "@/lib/use-form-values";
import { wxBindExistingAction, wxQuickRegisterAction } from "@/lib/actions/wxauth";

/**
 * 微信首次进入登录页的引导块：本机暂无与 openid 绑定的账号时展示。
 * 上半部注册（wxQuickRegisterAction，需填手机号或邮箱至少一项），下半部绑定已有账号（复用登录的账号密码校验）。
 */
export function WxSetupPanel({ next = "/" }: { next?: string }) {
  const [regState, regAction] = useActionState(wxQuickRegisterAction, INITIAL_ACTION_STATE);
  const regForm = useFormValues({ account: "" });
  const [state, formAction] = useActionState(wxBindExistingAction, INITIAL_ACTION_STATE);
  const form = useFormValues({ account: "", password: "" });

  return (
    <div className="space-y-4 rounded-2xl border border-brand/40 bg-brand-soft/50 p-4">
      <p className="text-[13px] font-black text-ink">微信登录成功，还差一步</p>

      <form action={regAction} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <Notice message={regState.error} tone="error" />
        <input
          {...regForm.field("account")}
          type="text"
          required
          placeholder="手机号或邮箱（必填其一）"
          className="input"
        />
        <SubmitButton className="btn-primary w-full" pendingText="注册中…">
          一键注册新账号
        </SubmitButton>
      </form>

      <div className="flex items-center gap-2 text-[11px] text-ink-mute">
        <span className="h-px flex-1 bg-ink-line" />
        已有账号？绑定继续
        <span className="h-px flex-1 bg-ink-line" />
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <Notice message={state.error} tone="error" />
        <input
          {...form.field("account")}
          type="text"
          autoComplete="username"
          required
          placeholder="手机号 / 邮箱"
          className="input"
        />
        <input
          {...form.field("password")}
          type="password"
          autoComplete="current-password"
          required
          placeholder="账号密码"
          className="input"
        />
        <SubmitButton className="btn-ghost w-full" pendingText="绑定中…">
          绑定并登录
        </SubmitButton>
      </form>
    </div>
  );
}
