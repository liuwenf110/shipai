"use client";

import { useEffect, useState } from "react";
import { withBasePath } from "@/lib/base-path";

/** 展示邀请链接并一键复制（完整地址依赖浏览器 origin） */
export function CopyInviteLink({ code }: { code: string }) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}${withBasePath(`/register?invite=${code}`)}`);
  }, [code]);

  const copy = async () => {
    const target = url || `${window.location.origin}${withBasePath(`/register?invite=${code}`)}`;
    try {
      await navigator.clipboard.writeText(target);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <code className="min-w-0 flex-1 truncate rounded-lg bg-cream px-2 py-1.5 text-[10.5px] text-ink-soft">
        {url || `…/register?invite=${code}`}
      </code>
      <button type="button" onClick={copy} className="btn-quiet btn-sm shrink-0">
        {copied ? "已复制" : "复制链接"}
      </button>
    </div>
  );
}
