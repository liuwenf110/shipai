"use client";

import { useActionState } from "react";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { updateProfileAction } from "@/lib/actions/account";
import { INITIAL_ACTION_STATE } from "@/lib/types";
import { useFormValues } from "@/lib/use-form-values";

/** 编辑个人资料：字段受控，保存失败时保留用户输入 */
export function ProfileForm({
  nickname,
  email,
  bio,
}: {
  nickname: string;
  email: string;
  bio: string;
}) {
  const [state, formAction] = useActionState(updateProfileAction, INITIAL_ACTION_STATE);
  const form = useFormValues({ nickname, email, bio });

  return (
    <form action={formAction} className="space-y-2.5 border-t border-ink-line/60 px-4 py-3">
      <Notice message={state.error} tone="error" />
      <div>
        <label className="label" data-required>
          昵称
        </label>
        <input
          {...form.field("nickname")}
          required
          minLength={2}
          maxLength={32}
          placeholder="中英文都可以，2-32 个字符"
          className="input"
        />
        {state.fieldErrors?.nickname ? (
          <p className="mt-1 text-[11px] text-[#B42318]">{state.fieldErrors.nickname}</p>
        ) : null}
      </div>
      <div>
        <label className="label" data-required>
          常用邮箱
        </label>
        <input
          {...form.field("email")}
          type="email"
          required
          placeholder="用于找回密码，每个账号必须绑定"
          className="input"
        />
        <p className="mt-1 text-[11px] text-ink-mute">改邮箱不影响登录：旧邮箱仍可作为本账号的登录名继续使用。</p>
      </div>
      <div>
        <label className="label">一句话简介</label>
        <input
          {...form.field("bio")}
          maxLength={60}
          placeholder="比如：周末重装徒步爱好者"
          className="input"
        />
      </div>
      <SubmitButton className="btn-primary btn-sm" pendingText="保存中…">
        保存资料
      </SubmitButton>
    </form>
  );
}
