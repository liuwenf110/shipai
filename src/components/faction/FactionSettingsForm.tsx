"use client";

import { useActionState } from "react";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { updateFactionAction } from "@/lib/actions/faction";
import { INITIAL_ACTION_STATE } from "@/lib/types";
import { useFormValues } from "@/lib/use-form-values";

export type FactionSettingsDefaults = {
  name: string;
  tagline: string;
  description: string;
  joinMode: string;
  allowCrossCompany: boolean;
};

/** 管理台派资料设置：字段受控，保存失败时保留已填内容 */
export function FactionSettingsForm({
  factionId,
  slug,
  defaults,
}: {
  factionId: string;
  slug: string;
  defaults: FactionSettingsDefaults;
}) {
  const [state, formAction] = useActionState(updateFactionAction, INITIAL_ACTION_STATE);
  const form = useFormValues({
    name: defaults.name,
    tagline: defaults.tagline,
    description: defaults.description,
    joinMode: defaults.joinMode,
    allowCrossCompany: defaults.allowCrossCompany ? "true" : "",
  });

  return (
    <form action={formAction} className="card space-y-3 p-4">
      <input type="hidden" name="factionId" value={factionId} />
      <input type="hidden" name="slug" value={slug} />

      <Notice message={state.error} tone="error" />

      <div>
        <label className="label" data-required>
          派名
        </label>
        <input {...form.field("name")} required maxLength={16} className="input" />
      </div>
      <div>
        <label className="label">一句话介绍</label>
        <input {...form.field("tagline")} maxLength={40} className="input" />
      </div>
      <div>
        <label className="label">详细介绍</label>
        <textarea {...form.field("description")} rows={6} className="input resize-none" />
      </div>
      <div>
        <label className="label">加入方式</label>
        <div className="flex gap-2">
          <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border border-ink-line p-2.5 text-[12px] has-[:checked]:border-brand has-[:checked]:bg-brand-soft/40">
            <input type="radio" {...form.choice("joinMode", "OPEN")} />
            自由加入
          </label>
          <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-xl border border-ink-line p-2.5 text-[12px] has-[:checked]:border-brand has-[:checked]:bg-brand-soft/40">
            <input type="radio" {...form.choice("joinMode", "APPROVAL")} />
            需派主审批
          </label>
        </div>
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-ink-line p-3 transition has-[:checked]:border-brand has-[:checked]:bg-brand-soft/40">
        <input
          type="checkbox"
          {...form.toggle("allowCrossCompany")}
          value="true"
          className="mt-0.5 h-4 w-4 rounded border-ink-line accent-brand"
        />
        <div>
          <span className="text-[12px] font-bold text-ink">允许其他公司同事加入</span>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-mute">
            开启后跨公司申请一律需派主审批；关闭将自动作废待审的跨公司申请
          </p>
        </div>
      </label>
      <SubmitButton className="btn-primary w-full" pendingText="保存中…">
        保存设置
      </SubmitButton>
    </form>
  );
}
