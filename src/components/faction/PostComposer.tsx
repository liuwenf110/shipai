"use client";

import { useEffect, useActionState, useRef, useState } from "react";
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
  // 配图支持多张：最多 9 张，与后端上限对齐
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [pickError, setPickError] = useState("");
  const MAX_IMAGES = 9;
  // 单张上限对齐 saveProofFile；总量留够 multipart 边界，避免撞 Server Action 的 8MB 请求体上限
  const MAX_ONE = 6 * 1024 * 1024;
  const MAX_TOTAL = 7 * 1024 * 1024;

  // 提交进 FormData 的是 input.files，state 只用来画缩略图：
  // 之前选完图就 input.value=""，等于每次都把待提交的文件清空，多图配图静默丢失（提交时 0 个文件）。
  // 现在每次改动已选列表都原样写回 input.files。
  function syncImageInput(files: File[]) {
    const input = imageInputRef.current;
    if (!input) return;
    if (files.length === 0) {
      input.value = "";
      return;
    }
    const store = new DataTransfer();
    for (const f of files) store.items.add(f);
    input.files = store.files;
  }

  function onImagePick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    const merged = [...imageFiles];
    let reason = "";
    for (const f of picked) {
      if (merged.length >= MAX_IMAGES) {
        reason = `最多 ${MAX_IMAGES} 张配图，多出来的已忽略`;
        break;
      }
      if (f.size > MAX_ONE) {
        reason = `「${f.name}」超过 6MB，已忽略`;
        continue;
      }
      if (merged.some((x) => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified)) {
        continue;
      }
      if (merged.reduce((sum, x) => sum + x.size, 0) + f.size > MAX_TOTAL) {
        reason = "配图总量接近 7MB，请删掉几张或换压缩后的图";
        continue;
      }
      merged.push(f);
    }
    setImageFiles(merged);
    setPickError(reason);
    syncImageInput(merged);
  }

  function removeImage(index: number) {
    const next = imageFiles.filter((_, i) => i !== index);
    setImageFiles(next);
    syncImageInput(next);
  }

  function clearImages() {
    setImageFiles([]);
    setPickError("");
    syncImageInput([]);
  }

  return (
    <form action={formAction} className="card p-3.5">
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
                  imageFiles.length > 0 && "bg-brand-soft text-brand-dark",
                )}
              >
                <Icon name="upload" size={13} />
                {imageFiles.length > 0
                  ? `已选 ${imageFiles.length}/${MAX_IMAGES} 张`
                  : state.error
                    ? "配图需重新选择"
                    : "配图（可多选）"}
                <input
                  ref={imageInputRef}
                  type="file"
                  name="image"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={onImagePick}
                />
              </label>
              {imageFiles.length > 0 ? (
                <button
                  type="button"
                  onClick={clearImages}
                  className="rounded-full px-2 py-1 text-[11px] font-semibold text-ink-mute hover:text-[#B42318]"
                >
                  清空配图
                </button>
              ) : null}
              {imageFiles.length > 0 ? (
                <div className="basis-full grid grid-cols-4 sm:grid-cols-6 md:grid-cols-9 gap-1.5">
                  {imageFiles.map((file, i) => (
                    <ImageThumb key={i} file={file} onRemove={() => removeImage(i)} />
                  ))}
                </div>
              ) : null}
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

          {pickError ? <Notice message={pickError} tone="info" /> : null}
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

/** 已选图片缩略图预览，带删除小按钮 */
function ImageThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg border border-ink-line/60 bg-cream-sunk">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={file.name} className="h-full w-full object-cover" />
      ) : null}
      <button
        type="button"
        aria-label="移除这张图"
        onClick={onRemove}
        className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-[10px] font-black text-white"
      >
        ×
      </button>
    </div>
  );
}
