"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { SubmitButton } from "@/components/SubmitButton";
import { submitReportAction } from "@/lib/actions/content";
import { cn } from "@/lib/utils";

const REASONS = [
  { value: "SPAM", label: "垃圾广告 / 引流" },
  { value: "ABUSE", label: "人身攻击 / 引战" },
  { value: "PORN", label: "色情低俗" },
  { value: "FRAUD", label: "虚假信息 / 诈骗" },
  { value: "OTHER", label: "其他违规" },
];

/** 举报按钮：点击后就地展开原因选择，提交走 server action */
export function ReportButton({
  targetType,
  targetId,
  redirectTo,
  label = "举报",
  className,
}: {
  targetType: "POST" | "COMMENT" | "USER";
  targetId: string;
  redirectTo: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-0.5 text-[11px] font-semibold text-ink-mute transition hover:text-[#B42318]",
          className,
        )}
      >
        <Icon name="flag" size={13} />
        {label}
      </button>
    );
  }

  return (
    <form
      action={submitReportAction}
      className="rounded-xl border border-ink-line/70 bg-white p-3 text-left"
    >
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div className="flex items-center justify-between">
        <p className="text-[12px] font-bold text-ink">举报这条内容</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-ink-mute transition hover:text-ink"
          aria-label="取消举报"
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {REASONS.map((reason, index) => (
          <label
            key={reason.value}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-cream px-2 py-1.5 text-[11.5px] text-ink-soft has-[:checked]:bg-brand/10 has-[:checked]:font-semibold has-[:checked]:text-brand"
          >
            <input
              type="radio"
              name="reason"
              value={reason.value}
              defaultChecked={index === 0}
              className="accent-brand"
            />
            {reason.label}
          </label>
        ))}
      </div>

      <textarea
        name="detail"
        rows={2}
        maxLength={200}
        placeholder="补充说明（选填），方便我们快速判断"
        className="input mt-2 w-full resize-none text-[12px]"
      />

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn-quiet btn-sm"
        >
          取消
        </button>
        <SubmitButton className="btn-primary btn-sm" pendingText="提交中…">
          提交举报
        </SubmitButton>
      </div>
    </form>
  );
}
