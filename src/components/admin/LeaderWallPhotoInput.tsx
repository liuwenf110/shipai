"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

/**
 * 派主墙后台的照片选择控件：大号「选择照片」按钮 + 隐藏原生 input（label for 绑定）。
 * 直接把原生 <input type=file> 套 .input（w-full + 大内边距）在移动端浏览器里会把
 * 原生「选择文件」按钮挤成一小片空白，点大片区域弹不出框——即用户反馈的「点不动」。
 * 改成 label 驱动的隐藏 input 后，整颗按钮都是可靠点击区；input 仍是父表单的后代，
 * 随「保存这一条」一起提交，不选文件则 action 保留旧图。选图后回显文件名做反馈。
 */
export function LeaderWallPhotoInput({ id, current }: { id: string; current: string | null }) {
  const [file, setFile] = useState<string | null>(null);

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="btn-ghost btn-sm cursor-pointer">
        <Icon name="upload" size={13} />
        选择照片
      </label>
      <input
        id={id}
        type="file"
        name="image"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => setFile(event.target.files?.[0]?.name ?? null)}
      />
      <span className="max-w-[70%] truncate text-[11.5px] text-ink-mute">
        {file ? `已选：${file}` : current ? "已上传，不选则保留当前照片" : "尚未上传照片"}
      </span>
    </div>
  );
}
