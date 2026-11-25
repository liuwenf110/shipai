"use client";

import { useActionState, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { updateAvatarAction } from "@/lib/actions/account";
import { INITIAL_ACTION_STATE } from "@/lib/types";

/**
 * 用户自助头像：在「我的」页账号自助区展开。
 * 照片写进 User.avatarImage，与派主照片同一字段，个人主页 / 派主墙 / 帖子评论等处共用同一张；
 * 未上传时各处回落字母头像。选图后本地即时预览，真正入库要等表单提交。
 */
export function AvatarForm({
  name,
  color,
  image,
}: {
  name: string;
  color: string;
  /** 库中当前头像的相对路径，无图为 null */
  image: string | null;
}) {
  const [state, formAction] = useActionState(updateAvatarAction, INITIAL_ACTION_STATE);
  // 仅用于选图后的本地预览，真正入库要等表单提交
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <form action={formAction} className="space-y-3 border-t border-ink-line/60 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] leading-relaxed text-ink-mute">
          头像会展示在你的个人主页、派主墙与帖子/评论等处，3MB 内的 JPG / PNG / WEBP；不上传则显示字母头像。
        </p>
        <Notice message={state.error} tone="error" />
      </div>

      <div className="flex items-center gap-3">
        <Avatar name={name} color={color} src={preview ?? image} size="xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-bold text-ink">{name}</p>
          <p className="mt-0.5 text-[11px] text-ink-mute">{image ? "已上传头像" : "还没有上传头像"}</p>
          <label className="btn-ghost btn-sm mt-2 cursor-pointer">
            <Icon name="upload" size={13} />
            {preview ? "已选择本地图片" : "选择头像"}
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
          保存头像
        </SubmitButton>
        {image ? (
          <button type="submit" name="action" value="remove" className="btn-quiet btn-sm">
            移除
          </button>
        ) : null}
      </div>
    </form>
  );
}
