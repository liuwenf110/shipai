"use client";

import { useActionState } from "react";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { requestInviteCodeAction } from "@/lib/actions/invite";
import { INITIAL_ACTION_STATE } from "@/lib/types";
import { useFormValues } from "@/lib/use-form-values";

/** 申请邀请码：备注受控，提交失败时保留已填内容 */
export function InviteRequestForm({
  factionId,
  slug,
}: {
  factionId: string;
  slug: string;
}) {
  const [state, formAction] = useActionState(requestInviteCodeAction, INITIAL_ACTION_STATE);
  const form = useFormValues({ note: "" });

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="factionId" value={factionId} />
      <input type="hidden" name="slug" value={slug} />

      <Notice message={state.error} tone="error" />

      <div>
        <label className="label" data-required htmlFor="invite-note">
          邀请用途
        </label>
        <input
          id="invite-note"
          {...form.field("note")}
          required
          maxLength={120}
          placeholder="如：邀请 3 位跑步搭子一起入派"
          className="input"
        />
      </div>
      <SubmitButton className="btn-primary btn-sm w-full" pendingText="提交中…">
        申请邀请码
      </SubmitButton>
    </form>
  );
}
