"use client";

import { useActionState, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { updateLeaderPhotoAction } from "@/lib/actions/faction";
import { INITIAL_ACTION_STATE } from "@/lib/types";

type LeaderPhotoDefaults = {
  name: string;
  color: string;
  /** 库中当前照片的相对路径，无图为 null */
  image: string | null;
};

/**
 * 派主照片设置：管理台「设置」tab 内，只对派主本人渲染。
 * 照片写进 User.avatarImage，一处上传、派主墙 / 派卡片 / 派详情页共用同一张；未上传时各处回落字母头像。
 */
export function LeaderPhotoForm({
  factionId,
  slug,
  defaults,
}: {
  factionId: string;
  slug: string;
  defaults: LeaderPhotoDefaults;
}) {
  const [state, formAction] = useActionState(updateLeaderPhotoAction, INITIAL_ACTION_STATE);
  // 仅用于选图后的本地预览，真正入库要等表单提交
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <form action={formAction} className="card mt-3 space-y-3 p-4">
      <input type="hidden" name="factionId" value={factionId} />
      <input type="hidden" name="slug" value={slug} />

      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[12px] font-bold text-ink">派主照片</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-mute">
            照片会出现在发现页派主墙与本派展示位，3MB 内的 JPG / PNG / WEBP；不上传则显示字母头像。
          </p>
        </div>
        <Notice message={state.error} tone="error" />
      </div>

      <div className="flex items-center gap-3">
        <Avatar name={defaults.name} color={defaults.color} src={preview ?? defaults.image} size="xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-bold text-ink">{defaults.name}</p>
          <p className="mt-0.5 text-[11px] text-ink-mute">
            {defaults.image ? "已上传照片" : "还没有上传照片"}
          </p>
          <label className="btn-ghost btn-sm mt-2 cursor-pointer">
            <Icon name="upload" size={13} />
            {preview ? "已选择本地图片" : "选择照片"}
            <input
              type="file"
              name="image"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setPreview(file ? URL.createObjectURL(file) : null);
              }}
            />
          </label>
        </div>
      </div>

      <div className="flex gap-2">
        <SubmitButton className="btn-primary flex-1" pendingText="上传中…">
          保存照片
        </SubmitButton>
        {defaults.image ? (
          <button
            type="submit"
            name="action"
            value="remove"
            className="btn-quiet btn-sm"
          >
            移除
          </button>
        ) : null}
      </div>
    </form>
  );
}
