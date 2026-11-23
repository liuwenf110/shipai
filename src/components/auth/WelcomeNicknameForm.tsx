"use client";

import { useActionState } from "react";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { INITIAL_ACTION_STATE } from "@/lib/types";
import { useFormValues } from "@/lib/use-form-values";
import { setWxNicknameAction, skipWxNicknameAction } from "@/lib/actions/welcome";

/**
 * 微信注册后的昵称引导表单：一个昵称输入 + 「保存并继续」，附「先跳过」。
 * 字段受控（useFormValues），查重/违规/长度不合规时保留已填内容原地修改。
 */
export function WelcomeNicknameForm({ nickname }: { nickname: string }) {
  const [state, formAction] = useActionState(setWxNicknameAction, INITIAL_ACTION_STATE);
  const form = useFormValues({ nickname });
  const [skipState, skipAction] = useActionState(skipWxNicknameAction, INITIAL_ACTION_STATE);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-3">
        <Notice message={state.error} tone="error" />
        <div>
          <label className="label" htmlFor="nickname" data-required>
            昵称
          </label>
          <input
            id="nickname"
            {...form.field("nickname")}
            required
            minLength={2}
            maxLength={32}
            placeholder="同事怎么称呼你，中英文都可以"
            className="input"
          />
          <p className="hint mt-1">
            2-32 个字符，支持中文、英文、数字。这是别人在派里看到的名字。
          </p>
          {state.fieldErrors?.nickname ? (
            <p className="mt-1 text-[11px] text-[#B42318]">{state.fieldErrors.nickname}</p>
          ) : null}
        </div>
        <SubmitButton className="btn-primary w-full" pendingText="保存中…">
          保存并继续
        </SubmitButton>
      </form>

      <form action={skipAction}>
        <Notice message={skipState.error} tone="error" />
        <SubmitButton className="btn-ghost w-full btn-sm" pendingText="跳过中…">
          先跳过，用「{nickname}」这个默认昵称
        </SubmitButton>
      </form>
    </div>
  );
}
