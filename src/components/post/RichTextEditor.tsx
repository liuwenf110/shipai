"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { EmojiPicker } from "@/components/EmojiPicker";
import { withBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";

/** HTML 安全转义纯文本段（不处理 URL） */
function escapePlainText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 将纯文本中的 URL 自动包成 <a>（保留 URL 两侧的非空白字符），包括：
 * - 带协议的 http(s)://…
 * - 无协议但含常见域名后缀的：www.、mp.weixin.qq.com、与后面包含 .com/.cn/.net 等 TLD 的长域名。
 * 先转义后插入，避免 HTML 注入。服务端净化会保留 <a> 并强制 target=_blank。
 */
function linkifyPlainText(text: string): string {
  const escaped = escapePlainText(text);
  // 匹配 URL 主体：可选协议 + 域名(含子域) + 可选端口 + 可选路径/查询/锚点
  // 末尾排除常见中文标点与句号结尾（避免粘“看这个 https://x.com/abc。”把句号塑进 href）
  const urlRe =
    /(?:https?:\/\/|www\.|mp\.weixin\.qq\.com)[^\s<>"]+/gi;
  return escaped.replace(urlRe, (raw) => {
    // 剔掉尾部可能粘上的中文标点与句点
    const trimmed = raw.replace(/[，。；、：！？)\]》〉]+$/u, "");
    if (!trimmed) return raw;
    const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const tail = raw.slice(trimmed.length);
    return `<a href="${href}">${trimmed}</a>${tail}`;
  });
}

/**
 * 客户端粘贴预处理：与服务端白名单对齐，先剥射 script/style/on* 与 javascript: 链接，
 * 保留基本排版标签（标题/列表/引用/链接/图/加粗斜体下划划掉），避免直接粘入时 XSS。
 * 入库前服务端会再洗一道兼容旧行为。
 */
function sanitizePastedHtml(html: string): string {
  let out = html
    // 剥射不安全的块与行内属性
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|meta|link|object|iframe|form|input|button|noscript)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\s*(\/?)\s*(font|table|thead|tbody|tr|td|th|figure|figcaption|video|audio|source|canvas|svg|path|use|defs|g)[^>]*>/gi, "<$1span>")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\shref\s*=\s*["']\s*javascript:[^"']*["']/gi, ' href="#"');
  // 射射 data- 属性避免无意义体积
  out = out.replace(/\sdata-[\w-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // class/id 一律射掉，防止外部 CSS 影响主站样式
  out = out.replace(/\s(class|id)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return out;
}

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
  placeholder = "写点什么…支持从网页/微信/Word 直接粘贴保留排版",
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
    // 优先使用 text/html 保留拷过来的排版（标题/列表/加粗/颜色/链接），射掉脚本属性后插入
    const htmlFragment = event.clipboardData.getData("text/html");
    if (htmlFragment && /<\s*(h[1-6]|p|div|ul|ol|li|blockquote|pre|b|strong|i|em|u|s|strike|del|a|img|code|span|br|table)\b/i.test(htmlFragment)) {
      event.preventDefault();
      exec("insertHTML", sanitizePastedHtml(htmlFragment));
      return;
    }
    // 纯文本中自动识别 URL（含微信不带协议的 mp.weixin.qq.com 与 www. 开头）转为可点链接；其余走浏览器默认，入库前服务端净化
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    const linkified = linkifyPlainText(text);
    if (linkified !== escapePlainText(text)) {
      event.preventDefault();
      exec("insertHTML", `${linkified}&nbsp;`);
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

  /** 将当前选区包成指定标签（行内代码等）；无选区时插入一个占位例子方便用户接着写 */
  function wrapSelection(tag: string, _left: string, _right: string) {
    const selection = window.getSelection();
    const text = selection?.toString() ?? "";
    const inner = text || "代码";
    exec("insertHTML", `<${tag}>${escapePlainText(inner)}</${tag}>`);
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
      <div className="flex flex-wrap items-center gap-1 border-t border-ink-line/60 px-2 py-1.5">
        <select
          aria-label="段落样式"
          className="h-7 rounded-lg border border-ink-line/70 bg-white px-1.5 text-[11px] font-bold text-ink-soft hover:bg-cream-sunk"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            exec("formatBlock", v);
            e.target.value = "";
          }}
          defaultValue=""
        >
          <option value="">样式</option>
          <option value="h1">标题一</option>
          <option value="h2">标题二</option>
          <option value="h3">标题三</option>
          <option value="p">正文</option>
          <option value="blockquote">引用</option>
          <option value="pre">代码块</option>
        </select>
        <span className="mx-0.5 h-4 w-px bg-ink-line/60" />
        <button type="button" aria-label="加粗" className={cn(toolClass, "font-black")} onClick={() => exec("bold")}>
          B
        </button>
        <button type="button" aria-label="斜体" className={cn(toolClass, "italic")} onClick={() => exec("italic")}>
          I
        </button>
        <button type="button" aria-label="下划线" className={cn(toolClass, "underline")} onClick={() => exec("underline")}>
          U
        </button>
        <button type="button" aria-label="删除线" className={cn(toolClass, "line-through")} onClick={() => exec("strikeThrough")}>
          S
        </button>
        <button type="button" aria-label="行内代码" className={cn(toolClass, "font-mono text-[10.5px]")} onClick={() => wrapSelection("code", "`", "`")}>
          &lt;/&gt;
        </button>
        <span className="mx-0.5 h-4 w-px bg-ink-line/60" />
        <button type="button" aria-label="无序列表" className={toolClass} onClick={() => exec("insertUnorderedList")}>
          •
        </button>
        <button type="button" aria-label="有序列表" className={cn(toolClass, "text-[10.5px]")} onClick={() => exec("insertOrderedList")}>
          1.
        </button>
        <button type="button" aria-label="水平分割线" className={toolClass} onClick={() => exec("insertHTML", "<hr>")}>
          ―
        </button>
        <span className="mx-0.5 h-4 w-px bg-ink-line/60" />
        <button type="button" aria-label="插入链接" className={toolClass} onClick={insertLink}>
          <Icon name="link" size={13} />
        </button>
        <EmojiPicker onPick={(emoji) => exec("insertText", emoji)} align="left" compact />
        <button
          type="button"
          aria-label="插入图片"
          className={cn(toolClass, uploading && "opacity-50")}
          onClick={() => fileRef.current?.click()}
        >
          <Icon name="image" size={14} />
        </button>
        <button type="button" aria-label="清除格式" className={cn(toolClass, "text-[10.5px]")} onClick={() => exec("removeFormat")}>
          清除
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
          {uploading ? "图片上传中…" : hint || "支持图文混排粘贴"}
        </span>
      </div>
      {/* 真正随表单提交的字段：contentEditable 不是表单控件，值同步进这个隐藏域 */}
      <textarea name={name} value={html} onChange={() => {}} className="hidden" aria-hidden readOnly />
    </div>
  );
}
