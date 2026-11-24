"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { RichTextEditor } from "@/components/post/RichTextEditor";
import { createPostAction } from "@/lib/actions/faction";
import { INITIAL_ACTION_STATE } from "@/lib/types";
import { useFormValues } from "@/lib/use-form-values";
import { cn } from "@/lib/utils";

export function PostComposer({
  factionId,
  factionName,
  isLeader,
  placeholder = "分享一次活动、一个周末计划，或一句吐槽…",
}: {
  factionId: string;
  factionName: string;
  /** 调用方传的是 isManager（派主 + 副派主）：置顶与公告勾选框只对这两个角色渲染；首页公开招募全员可用 */
  isLeader: boolean;
  placeholder?: string;
}) {
  const [state, formAction] = useActionState(createPostAction, INITIAL_ACTION_STATE);
  // 正文与标题受控：发帖失败时不清空，用户直接改完再发
  const form = useFormValues({ title: "", content: "" });
  const [expanded, setExpanded] = useState(false);
  const [imageName, setImageName] = useState("");

  return (
    <form
      action={formAction}
      className="card p-3.5"
      onSubmit={() => {
        setImageName("");
      }}
    >
      <input type="hidden" name="factionId" value={factionId} />
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-black text-white">
          {isLeader ? "派" : "我"}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          {expanded ? (
            <input
              {...form.field("title")}
              placeholder="标题（选填，公告建议填写）"
              className="input py-2 text-[13px]"
            />
          ) : null}
          <RichTextEditor
            name="content"
            defaultValue={form.values.content}
            placeholder={`${placeholder}（必填，可粘贴图片/链接）`}
            onFocus={() => setExpanded(true)}
            onChange={(value) => form.set("content", value)}
          />

          {expanded ? (
            <div className="flex flex-wrap items-center gap-2">
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-1 rounded-full bg-cream-sunk px-2.5 py-1 text-[11px] font-semibold text-ink-soft",
                  imageName && "bg-brand-soft text-brand-dark",
                )}
              >
                <Icon name="upload" size={13} />
                {imageName ? "已选择图片" : state.error ? "配图需重新选择" : "配图"}
                <input
                  type="file"
                  name="image"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => setImageName(event.target.files?.[0]?.name ?? "")}
                />
              </label>
              {isLeader ? (
                <>
                  <label className="flex cursor-pointer items-center gap-1 rounded-full bg-cream-sunk px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
                    <input type="checkbox" name="pinned" value="1" className="h-3 w-3" />
                    置顶
                  </label>
                  <label className="flex cursor-pointer items-center gap-1 rounded-full bg-cream-sunk px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
                    <input type="checkbox" name="announce" value="1" className="h-3 w-3" />
                    公告
                  </label>
                </>
              ) : null}
              {/* 首页公开招募：任何成员都能把自己这条动态放进首页招募流（不构成新的对外可见面，
                  首页原本就会把未加入派的最新动态展示给外人，现在改成按帖主动勾选） */}
              <label
                title="勾选后本帖进入首页「首页公开招募」，未加入本派的用户也能看到并点进来"
                className="flex cursor-pointer items-center gap-1 rounded-full bg-cream-sunk px-2.5 py-1 text-[11px] font-semibold text-ink-soft"
              >
                <input type="checkbox" name="recruit" value="1" className="h-3 w-3" />
                首页公开招募
              </label>
              <span className="text-[10.5px] text-ink-mute">
                {isLeader ? `以派主身份发布在「${factionName}」` : `发布在「${factionName}」`}
              </span>
            </div>
          ) : null}

          {state.error ? <Notice message={state.error} tone="error" /> : null}

          <div className="flex items-center justify-between">
            <span className="text-[10.5px] text-ink-mute">发言需遵守派规，派主可隐藏违规内容</span>
            <SubmitButton
              className="btn-primary btn-sm"
              disabled={state.error ? false : undefined}
              pendingText="发布中…"
            >
              发布
            </SubmitButton>
          </div>
        </div>
      </div>
    </form>
  );
}
