"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { RichTextEditor } from "@/components/post/RichTextEditor";
import { SubmitButton } from "@/components/SubmitButton";
import { createActivityAction, updateActivityAction } from "@/lib/actions/faction";
import { INITIAL_ACTION_STATE } from "@/lib/types";
import { useFormValues } from "@/lib/use-form-values";
import { cn } from "@/lib/utils";

export type ActivityDefaults = {
  title?: string;
  startAt?: string;
  location?: string;
  capacity?: string;
  description?: string;
  pinned?: boolean;
};

/** 新建 / 编辑活动：字段受控，校验失败时保留已填内容供直接修改 */
export function ActivityForm({
  mode,
  slug,
  redirectTo,
  factionId,
  activityId,
  defaults,
  className,
  isManager = false,
}: {
  mode: "create" | "update";
  slug: string;
  redirectTo: string;
  factionId?: string;
  activityId?: string;
  defaults?: ActivityDefaults;
  className?: string;
  /** 派主/副派主：新建与编辑表单都渲染「置顶」勾选框（编辑时初值从活动现状回填） */
  isManager?: boolean;
}) {
  const [state, formAction] = useActionState(
    mode === "create" ? createActivityAction : updateActivityAction,
    INITIAL_ACTION_STATE,
  );
  const form = useFormValues({
    title: defaults?.title ?? "",
    startAt: defaults?.startAt ?? "",
    location: defaults?.location ?? "",
    capacity: defaults?.capacity ?? "20",
    description: defaults?.description ?? "",
    pinned: defaults?.pinned ? "true" : "",
  });
  const creating = mode === "create";
  const [imageName, setImageName] = useState("");
  // capacity=0 即「不限」：勾选态直接从受控值派生，无需额外 state
  const unlimited = form.values.capacity === "0";

  return (
    <form
      action={formAction}
      className={cn(creating ? "mt-3 space-y-2.5" : "mt-2.5 space-y-2.5", className)}
      onSubmit={() => setImageName("")}
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      {factionId ? <input type="hidden" name="factionId" value={factionId} /> : null}
      {activityId ? <input type="hidden" name="activityId" value={activityId} /> : null}

      <Notice message={state.error} tone="error" />

      <div className="grid gap-2.5 sm:grid-cols-2">
        <div>
          <label className="label" data-required>活动名称</label>
          <input
            {...form.field("title")}
            required
            placeholder="周六香山野径徒步"
            className="input"
          />
        </div>
        <div>
          <label className="label" data-required>时间</label>
          <input type="datetime-local" {...form.field("startAt")} required className="input" />
        </div>
        <div>
          <label className="label" data-required>地点</label>
          <input {...form.field("location")} required placeholder="香山公园东门" className="input" />
        </div>
        <div>
          <label className="label">人数上限</label>
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
        {/* 与发帖正文同源：富文本可粘贴图片/链接，提交 HTML 由服务端净化入库 */}
        <RichTextEditor
          name="description"
          defaultValue={form.values.description}
          placeholder="路线难度、集合方式、装备要求、费用说明…（可粘贴图片/链接）"
          onChange={(value) => form.set("description", value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label
          className={cn(
            "flex cursor-pointer items-center gap-1 rounded-full bg-cream-sunk px-2.5 py-1 text-[11px] font-semibold text-ink-soft",
            imageName && "bg-brand-soft text-brand-dark",
          )}
        >
          <Icon name="upload" size={13} />
          {imageName ? "已选择图片" : creating ? "添加配图" : "更换配图"}
          <input
            type="file"
            name="image"
            accept="image/*"
            className="hidden"
            onChange={(event) => setImageName(event.target.files?.[0]?.name ?? "")}
          />
        </label>
        {isManager ? (
          <label className="flex cursor-pointer items-center gap-1 rounded-full bg-cream-sunk px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
            {/* key 强制重挂：React 19 在 action 结束后 form.reset，靠 defaultChecked 才能保住用户的勾选 */}
            <input
              type="checkbox"
              key={form.values.pinned}
              {...form.toggle("pinned")}
              value="1"
              className="h-3 w-3"
            />
            置顶
          </label>
        ) : null}
        <span className="text-[10.5px] text-ink-mute">
          {creating ? "选填，jpg/png/webp 等，≤ 6MB" : "不选则保留原图"}
        </span>
      </div>

      <SubmitButton
        className={creating ? "btn-primary w-full" : "btn-primary btn-sm"}
        pendingText={creating ? "发布中…" : "保存中…"}
      >
        {creating ? <Icon name="calendar" size={15} /> : null}
        {creating ? "发布活动并通知全派" : "保存修改"}
      </SubmitButton>
    </form>
  );
}
