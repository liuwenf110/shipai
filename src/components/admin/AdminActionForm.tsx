"use client";

import { useActionState } from "react";
import { ConfirmSubmit } from "@/components/content/ConfirmSubmit";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/types";
import { useFormValues } from "@/lib/use-form-values";
import { cn } from "@/lib/utils";

type AdminAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export type AdminActionButton = {
  /** 提交时附带的按钮取值（同一表单多个按钮时用于区分动作） */
  value?: string;
  label: React.ReactNode;
  className?: string;
  pendingText?: string;
  /** 填写后按钮需二次确认 */
  confirmText?: string;
};

/**
 * 运营后台：备注/原因 + 动作按钮的通用表单。
 * 备注输入受控，校验失败（返回 error）时保留已填内容供直接修改。
 */
export function AdminActionForm({
  action,
  hidden,
  field,
  buttons,
  hint,
  className,
}: {
  action: AdminAction;
  hidden: Record<string, string>;
  field?: {
    name: string;
    placeholder: string;
    type?: "text" | "password";
    maxLength?: number;
    minLength?: number;
    required?: boolean;
    className?: string;
  };
  buttons: AdminActionButton[];
  hint?: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const form = useFormValues<Record<string, string>>({ [field?.name ?? "__none"]: "" });

  return (
    <form action={formAction} className={cn("space-y-2", className)}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <Notice message={state.error} tone="error" />

      {field ? (
        <input
          type={field.type ?? "text"}
          {...form.field(field.name)}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          minLength={field.minLength}
          required={field.required}
          className={cn("input py-2 text-[12px]", field.className)}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {buttons.map((button, index) =>
          button.confirmText ? (
            <ConfirmSubmit
              key={index}
              confirmText={button.confirmText}
              className={button.className}
              pendingText={button.pendingText}
            >
              {button.label}
            </ConfirmSubmit>
          ) : (
            <SubmitButton
              key={index}
              name={button.value === undefined ? undefined : "decision"}
              value={button.value}
              className={button.className}
              pendingText={button.pendingText}
            >
              {button.label}
            </SubmitButton>
          ),
        )}
        {hint ? <span className="ml-auto text-[10px] text-ink-mute">{hint}</span> : null}
      </div>
    </form>
  );
}
