"use client";

import { useActionState } from "react";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { adminUpdateUserAction } from "@/lib/actions/admin";
import { INITIAL_ACTION_STATE } from "@/lib/types";
import { cn } from "@/lib/utils";

/** 运营后台：单按钮切换用户状态（启用/禁用/运营身份/强制下线） */
export function AdminUserActionButton({
  userId,
  redirectTo,
  action,
  label,
  className,
  pendingText = "…",
}: {
  userId: string;
  redirectTo: string;
  action: "enable" | "disable" | "promote" | "demote" | "kick";
  label: React.ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const [state, formAction] = useActionState(adminUpdateUserAction, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <input type="hidden" name="action" value={action} />
      {state.error ? (
        <Notice message={state.error} tone="error" className="py-1.5 text-[11px]" />
      ) : null}
      <SubmitButton className={cn(className)} pendingText={pendingText}>
        {label}
      </SubmitButton>
    </form>
  );
}
