"use client";

import { useActionState, useState } from "react";
import type { Company } from "@prisma/client";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { createFactionAction } from "@/lib/actions/faction";
import { CATEGORY_LIST } from "@/lib/constants";
import { INITIAL_ACTION_STATE } from "@/lib/types";
import { useFormValues } from "@/lib/use-form-values";
import { cn } from "@/lib/utils";

export function NewFactionForm({ companies }: { companies: Company[] }) {
  const [state, formAction] = useActionState(createFactionAction, INITIAL_ACTION_STATE);
  const [category, setCategory] = useState("HIKING");
  // 除分类外的字段都受控：提交被驳回时保留已填内容与所选公司
  const form = useFormValues({
    companyId: companies[0]?.id ?? "",
    name: "",
    tagline: "",
    description: "",
    allowCrossCompany: "",
  });
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="card space-y-4 p-4">
      <Notice message={state.error} tone="error" />
      <p className="text-[11px] text-ink-mute">
        带 <span className="text-brand">*</span> 的为必填项
      </p>

      <div>
        <label className="label" data-required>所属公司</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {companies.map((company) => (
            <label
              key={company.id}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-ink-line bg-white p-2.5 transition has-[:checked]:border-brand has-[:checked]:bg-brand-soft/40"
            >
              <input
                type="radio"
                {...form.choice("companyId", company.id)}
                className="sr-only"
                required
              />
              <span
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[9px] font-black text-white"
                style={{ background: company.color }}
              >
                {company.logoText}
              </span>
              <span className="truncate text-[12px] font-bold text-ink">{company.shortName}</span>
            </label>
          ))}
        </div>
        <p className="hint mt-1">只能为你已完成身份认证的公司创建派</p>
      </div>

      <div>
        <label className="label" data-required>兴趣分类</label>
        <input type="hidden" name="category" value={category} />
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_LIST.map((meta) => (
            <button
              key={meta.key}
              type="button"
              onClick={() => setCategory(meta.key)}
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold transition",
                category === meta.key
                  ? "bg-ink text-white"
                  : "bg-cream-sunk text-ink-soft hover:text-ink",
              )}
            >
              <span>{meta.emoji}</span>
              {meta.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="name" data-required>
          派名
        </label>
        <input
          id="name"
          {...form.field("name")}
          required
          maxLength={16}
          placeholder="如：周末野径徒步派"
          className="input"
        />
        {errors.name ? <p className="mt-1 text-[11px] text-[#B42318]">{errors.name}</p> : null}
      </div>

      <div>
        <label className="label" htmlFor="tagline" data-required>
          一句话介绍
        </label>
        <input
          id="tagline"
          {...form.field("tagline")}
          required
          maxLength={40}
          placeholder="如：每周六早 7 点，把 KPI 走成海拔"
          className="input"
        />
        {errors.tagline ? <p className="mt-1 text-[11px] text-[#B42318]">{errors.tagline}</p> : null}
      </div>

      <div>
        <label className="label" htmlFor="description" data-required>
          详细介绍与运营计划
        </label>
        <textarea
          id="description"
          {...form.field("description")}
          rows={5}
          required
          placeholder="介绍派的活动频率、路线 / 场地、适合什么水平的人，以及你打算怎么运营。审核通过后即可开派。"
          className="input resize-none"
        />
        {errors.description ? (
          <p className="mt-1 text-[11px] text-[#B42318]">{errors.description}</p>
        ) : null}
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-ink-line bg-white p-3 transition has-[:checked]:border-brand has-[:checked]:bg-brand-soft/40">
        <input
          type="checkbox"
          {...form.toggle("allowCrossCompany")}
          value="true"
          className="mt-0.5 h-4 w-4 rounded border-ink-line accent-brand"
        />
        <div>
          <span className="text-[12px] font-bold text-ink">允许其他公司同事加入</span>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-mute">
            开启后，非本公司认证用户可申请加入，一律需派主审批
          </p>
        </div>
      </label>

      <div className="rounded-xl bg-cream px-3 py-2.5 text-[11px] leading-relaxed text-ink-mute">
        <span className="font-bold text-ink-soft">提交后会发生什么？</span>
        <br />
        运营会同时审核「新建派」和你的「派主认证申请」，通过后该派立即上线，你成为认证派主。
      </div>

      <SubmitButton className="btn-primary w-full" pendingText="提交中…">
        <Icon name="flag" size={15} />
        提交建派与派主认证申请
      </SubmitButton>
    </form>
  );
}
