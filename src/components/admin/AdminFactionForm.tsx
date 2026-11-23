"use client";

import { useActionState } from "react";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { adminUpdateFactionAction } from "@/lib/actions/admin";
import { INITIAL_ACTION_STATE } from "@/lib/types";
import { useFormValues } from "@/lib/use-form-values";

export type AdminFactionDefaults = {
  name: string;
  tagline: string;
  category: string;
  joinMode: string;
  sortOrder: string;
  allowCrossCompany: boolean;
};

/** 运营后台：编辑派资料。字段受控，保存失败时保留已填内容 */
export function AdminFactionForm({
  factionId,
  categoryOptions,
  defaults,
}: {
  factionId: string;
  categoryOptions: { key: string; emoji: string; label: string }[];
  defaults: AdminFactionDefaults;
}) {
  const [state, formAction] = useActionState(adminUpdateFactionAction, INITIAL_ACTION_STATE);
  const form = useFormValues({
    name: defaults.name,
    tagline: defaults.tagline,
    category: defaults.category,
    joinMode: defaults.joinMode,
    sortOrder: defaults.sortOrder,
    allowCrossCompany: defaults.allowCrossCompany ? "true" : "",
  });

  return (
    <form action={formAction} className="mt-2.5 space-y-2.5">
      <input type="hidden" name="factionId" value={factionId} />

      <Notice message={state.error} tone="error" />

      <label className="block">
        <span className="text-[10.5px] font-bold text-ink-mute">派名</span>
        <input {...form.field("name")} className="input mt-1 py-2 text-[12px]" />
      </label>
      <label className="block">
        <span className="text-[10.5px] font-bold text-ink-mute">一句话介绍</span>
        <input {...form.field("tagline")} className="input mt-1 py-2 text-[12px]" />
      </label>
      <div className="grid gap-2.5 md:grid-cols-2">
        <label className="block">
          <span className="text-[10.5px] font-bold text-ink-mute">兴趣分类</span>
          <select {...form.field("category")} className="input mt-1 py-2 text-[12px]">
            {categoryOptions.map((item) => (
              <option key={item.key} value={item.key}>
                {item.emoji} {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[10.5px] font-bold text-ink-mute">加入方式</span>
          <select {...form.field("joinMode")} className="input mt-1 py-2 text-[12px]">
            <option value="OPEN">自由加入</option>
            <option value="APPROVAL">需派主审批</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className="text-[10.5px] font-bold text-ink-mute">展示位置顺序</span>
        <input
          type="number"
          {...form.field("sortOrder")}
          min={0}
          max={9999}
          step={1}
          className="input mt-1 py-2 text-[12px] md:max-w-[220px]"
        />
        <span className="mt-1 block text-[10px] text-ink-mute">
          数值越大越靠前，影响发现页、首页推荐与搜索结果；0 表示不干预，改由成员数与动态数决定位置
        </span>
      </label>
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-line p-2.5 text-[12px] has-[:checked]:border-brand has-[:checked]:bg-brand-soft/40">
        <input
          type="checkbox"
          {...form.toggle("allowCrossCompany")}
          value="true"
          className="h-3.5 w-3.5 rounded accent-brand"
        />
        <span>允许跨公司加入</span>
        <span className="ml-auto text-[10px] text-ink-mute">关闭将自动作废跨公司待审申请</span>
      </label>
      <SubmitButton className="btn-primary btn-sm" pendingText="保存中…">
        保存派资料
      </SubmitButton>
    </form>
  );
}
