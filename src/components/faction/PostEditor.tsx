"use client";

import { useActionState, useEffect, useRef } from "react";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { RichTextEditor } from "@/components/post/RichTextEditor";
import { editPostAction } from "@/lib/actions/content";
import { INITIAL_ACTION_STATE } from "@/lib/types";
import { useFormValues } from "@/lib/use-form-values";

/** 作者编辑自己的帖子：标题与正文（链接改由富文本内联粘贴），配图与原有链接保持不变
 * isManager：作者同时是本派派主/副派主时额外渲染「置顶」「公告」勾选框（治理权，初值从帖子现状回填） */
export function PostEditor({
  postId,
  defaults,
  redirectTo,
  onSaved,
  isManager = false,
}: {
  postId: string;
  defaults: { title: string; content: string; link: string; pinned: boolean; isAnnounce: boolean };
  redirectTo: string;
  /** 保存成功回调：父级用于收起折叠面板 */
  onSaved?: () => void;
  isManager?: boolean;
}) {
  const [state, formAction] = useActionState(editPostAction, INITIAL_ACTION_STATE);
  // 受控回填：校验失败停在原页时不清空用户已改的内容（勾选框同理用 "true"/"" 存态）
  const form = useFormValues({
    title: defaults.title,
    content: defaults.content,
    pinned: defaults.pinned ? "true" : "",
    announce: defaults.isAnnounce ? "true" : "",
  });

  // 保存成功后通知父级收起面板；用 ref 守卫只触发一次，避免折叠面板重挂时循环回调
  const notified = useRef(false);
  useEffect(() => {
    if (state.message && !notified.current) {
      notified.current = true;
      onSaved?.();
    }
  }, [state.message, onSaved]);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      {state.message ? <Notice message={state.message} tone="ok" /> : null}
      <input {...form.field("title")} placeholder="标题（选填）" className="input py-2 text-[13px]" />
      {/* 正文升级为富文本：老帖纯文本原样进编辑器，改过格式后以 HTML 入库 */}
      <RichTextEditor
        name="content"
        defaultValue={form.values.content}
        placeholder="正文（必填，可粘贴图片/链接）"
        onChange={(value) => form.set("content", value)}
      />
      {state.error ? <Notice message={state.error} tone="error" /> : null}
      {isManager ? (
        <div className="flex flex-wrap items-center gap-2">
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
          <label className="flex cursor-pointer items-center gap-1 rounded-full bg-cream-sunk px-2.5 py-1 text-[11px] font-semibold text-ink-soft">
            <input
              type="checkbox"
              key={form.values.announce}
              {...form.toggle("announce")}
              value="1"
              className="h-3 w-3"
            />
            公告
          </label>
        </div>
      ) : null}
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-ink-mute">修改后内容立即生效，配图保持不变</span>
        <SubmitButton className="btn-primary btn-sm" pendingText="保存中…">
          保存修改
        </SubmitButton>
      </div>
    </form>
  );
}
