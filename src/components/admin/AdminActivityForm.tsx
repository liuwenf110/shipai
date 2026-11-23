"use client";

import { useActionState } from "react";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { adminCreateActivityAction, adminEditActivityAction } from "@/lib/actions/admin";
import { INITIAL_ACTION_STATE } from "@/lib/types";
import { useFormValues } from "@/lib/use-form-values";
import { cn } from "@/lib/utils";

export type AdminActivityDefaults = {
  title?: string;
  startAt?: string;
  location?: string;
  capacity?: string;
  description?: string;
};

/** 运营后台：代发 / 编辑活动。字段受控，校验失败时保留已填内容 */
export function AdminActivityForm({
  mode,
  activityId,
  factionOptions,
  defaults,
  className,
}: {
  mode: "create" | "update";
  activityId?: string;
  factionOptions?: { id: string; label: string }[];
  defaults?: AdminActivityDefaults;
  className?: string;
}) {
  const [state, formAction] = useActionState(
    mode === "create" ? adminCreateActivityAction : adminEditActivityAction,
    INITIAL_ACTION_STATE,
  );
  const form = useFormValues({
    factionId: "",
    title: defaults?.title ?? "",
    startAt: defaults?.startAt ?? "",
    location: defaults?.location ?? "",
    capacity: defaults?.capacity ?? "20",
    description: defaults?.description ?? "",
  });
  // capacity=0 即「不限」：勾选态直接从受控值派生，无需额外 state
  const unlimited = form.values.capacity === "0";

  return (
    <form action={formAction} className={cn("space-y-2.5", className)}>
      {activityId ? <input type="hidden" name="activityId" value={activityId} /> : null}

      <Notice message={state.error} tone="error" />

      <p className="text-[11px] text-ink-mute">
        带 <span className="text-brand">*</span> 的为必填项
      </p>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {mode === "create" ? (
          <div>
            <label className="label" data-required>
              所属派
            </label>
            <select {...form.field("factionId")} required className="input">
              <option value="" disabled>
                选择派
              </option>
              {(factionOptions ?? []).map((faction) => (
                <option key={faction.id} value={faction.id}>
                  {faction.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label className="label" data-required>
            活动名称
          </label>
          <input {...form.field("title")} required placeholder="周末香山徒步" className="input" />
        </div>
        <div>
          <label className="label" data-required>
            时间
          </label>
          <input type="datetime-local" {...form.field("startAt")} required className="input" />
        </div>
        <div>
          <label className="label" data-required>
            地点
          </label>
          <input {...form.field("location")} required placeholder="香山公园东门" className="input" />
        </div>
        <div>
          <label className="label">
            人数上限
          </label>
          <div className="flex items-center gap-2">
            {/* 不用 disabled：禁用态不会提交值，readOnly 置灰但仍传 0 */}
            <input
              type="number"
              {...form.field("capacity")}
              min={unlimited ? 0 : 1}
              max={500}
              readOnly={unlimited}
              className={cn("input", unlimited && "opacity-50")}
            />
            <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[11.5px] font-medium text-ink-soft">
              <input
                key={String(unlimited)}
                type="checkbox"
                defaultChecked={unlimited}
                onChange={(event) => form.set("capacity", event.target.checked ? "0" : "20")}
              />
              不限
            </label>
          </div>
        </div>
      </div>

      <div>
        <label className="label">活动说明</label>
        <textarea
          {...form.field("description")}
          rows={mode === "create" ? 3 : 2}
          className="input resize-none"
        />
      </div>

      <SubmitButton
        className="btn-primary btn-sm"
        pendingText={mode === "create" ? "发布中…" : "保存中…"}
      >
        {mode === "create" ? "发布并通知全派" : "保存修改"}
      </SubmitButton>
    </form>
  );
}
