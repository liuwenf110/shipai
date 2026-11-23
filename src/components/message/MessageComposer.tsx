"use client";

import { useActionState } from "react";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { sendMessageAction } from "@/lib/actions/message";
import { INITIAL_ACTION_STATE } from "@/lib/types";
import { useFormValues } from "@/lib/use-form-values";
import { MESSAGE_MAX_LEN } from "@/lib/constants";

/** 私信发送框：受控 textarea，发送失败（超长/限流/违规）保留输入 */
export function MessageComposer({ conversationId }: { conversationId: string }) {
  const [state, formAction] = useActionState(sendMessageAction, INITIAL_ACTION_STATE);
  const form = useFormValues({ content: "" });

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      {state.error ? <Notice message={state.error} tone="error" /> : null}
      <div className="flex items-end gap-2">
        <textarea
          {...form.field("content")}
          rows={2}
          required
          maxLength={MESSAGE_MAX_LEN}
          placeholder="发一条私信…（仅双方可见）"
          className="input flex-1 resize-none text-[13.5px] leading-relaxed"
          onKeyDown={(event) => {
            // Enter 发送、Shift+Enter 换行
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <SubmitButton className="btn-primary btn-sm self-end" pendingText="发送中…">
          发送
        </SubmitButton>
      </div>
    </form>
  );
}
