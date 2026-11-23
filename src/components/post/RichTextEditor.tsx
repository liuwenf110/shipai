"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { withBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";

/**
 * 轻量富文本正文编辑器（发帖/编辑帖共用）：
 * - contentEditable 承载正文，隐藏 textarea 同名提交 HTML 给 Server Action（服务端净化入库）；
 * - 粘贴截图/复制的图片自动上传并以内联 <img> 插入正文，无需再走配图选择器；
 * - 粘贴纯文本 URL 自动转为可点击链接；工具条提供加粗/斜体/链接/列表/插图。
 * 老式纯文本内容原样进编辑器（CSS pre-wrap 保留换行），不强制转 HTML。
 */
export function RichTextEditor({
  name,
  defaultValue = "",
  placeholder = "写点什么…支持粘贴图片和链接",
  minHeight = 88,
  onFocus,
  onChange,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  minHeight?: number;
  onFocus?: () => void;
  /** 内容变化回调：父级用于受控保留（提交失败不清空） */
  onChange?: (value: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 提交字段受控于组件自身状态：action 失败后 React form.reset 时受控值不会被洗掉
  const [html, setHtml] = useState(defaultValue);
  const [uploading, setUploading] = useState(false);
  const [hint, setHint] = useState("");

  // 初始内容只在挂载时灌入一次，避免受控重渲染冲掉光标
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (defaultValue) editor.innerHTML = defaultValue;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emit() {
    const value = editorRef.current?.innerHTML ?? "";
    setHtml(value);
    onChange?.(value);
  }

  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    emit();
  }

  function showHint(text: string) {
    setHint(text);
    window.setTimeout(() => setHint(""), 2400);
  }

  async function uploadImage(file: File): Promise<string | null> {
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(withBasePath("/api/uploads"), { method: "POST", body: form });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        showHint(data.error ?? "图片上传失败");
        return null;
      }
      return data.url;
    } catch {
      showHint("图片上传失败，请重试");
      return null;
    }
  }

  /** 上传后在光标处插入站内图；src 带部署前缀保证即时预览，入库时服务端会归一回相对路径 */
  async function insertImage(file: File) {
    setUploading(true);
    const url = await uploadImage(file);
    setUploading(false);
    if (url) exec("insertHTML", `<img src="${withBasePath(url)}" alt="图片">`);
  }

  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const items = Array.from(event.clipboardData?.items ?? []);
    const imageFiles = items
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (imageFiles.length) {
      event.preventDefault();
      imageFiles.forEach((file) => void insertImage(file));
      return;
    }
    // 纯文本整段是 URL 时转成可点击链接；其余（含富文本粘贴）走浏览器默认，入库前服务端净化
    const text = event.clipboardData.getData("text/plain").trim();
    if (/^https?:\/\/\S+$/i.test(text)) {
      event.preventDefault();
      const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
      exec("insertHTML", `<a href="${safe}">${safe}</a>&nbsp;`);
    }
  }

  function insertLink() {
    const raw = window.prompt("粘贴链接地址（支持公众号文章）");
    if (!raw) return;
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const safe = url.replace(/"/g, "%22");
    const selection = window.getSelection();
    // 有选区则把选区变成链接，无选区则直接插入一个可见链接
    if (selection && selection.toString().trim()) {
      exec("createLink", safe);
    } else {
      exec("insertHTML", `<a href="${safe}">${safe.replace(/&/g, "&amp;")}</a>&nbsp;`);
    }
  }

  const toolClass =
    "flex h-7 w-7 items-center justify-center rounded-lg text-[12px] font-black text-ink-soft hover:bg-cream-sunk";

  return (
    <div className="rounded-xl border border-ink-line bg-white focus-within:ring-2 focus-within:ring-brand/40">
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        className="rte input-none px-3 py-2.5 text-[13.5px] leading-relaxed text-ink-soft"
        style={{ minHeight, maxHeight: 320, overflowY: "auto" }}
        onInput={emit}
        onBlur={emit}
        onFocus={onFocus}
        onPaste={onPaste}
      />
      <div className="flex items-center gap-1 border-t border-ink-line/60 px-2 py-1.5">
        <button type="button" aria-label="加粗" className={toolClass} onClick={() => exec("bold")}>
          B
        </button>
        <button type="button" aria-label="斜体" className={cn(toolClass, "italic")} onClick={() => exec("italic")}>
          I
        </button>
        <button type="button" aria-label="无序列表" className={toolClass} onClick={() => exec("insertUnorderedList")}>
          •
        </button>
        <button type="button" aria-label="插入链接" className={toolClass} onClick={insertLink}>
          <Icon name="link" size={13} />
        </button>
        <button
          type="button"
          aria-label="插入图片"
          className={cn(toolClass, uploading && "opacity-50")}
          onClick={() => fileRef.current?.click()}
        >
          <Icon name="image" size={14} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void insertImage(file);
            event.target.value = "";
          }}
        />
        <span className="ml-auto text-[10.5px] text-ink-mute">
          {uploading ? "图片上传中…" : hint || "截图可直接粘贴"}
        </span>
      </div>
      {/* 真正随表单提交的字段：contentEditable 不是表单控件，值同步进这个隐藏域 */}
      <textarea name={name} value={html} onChange={() => {}} className="hidden" aria-hidden readOnly />
    </div>
  );
}
