"use client";

import { useFormStatus } from "react-dom";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 需要二次确认的表单提交按钮，用于删除、退出登录等不可逆操作。
 * 原先用 window.confirm，但小程序 web-view 会在原生 JS 弹窗顶部强制加「www.xxx.com」域名抬头；
 * 改为页面内自定义弹窗，确认后调用 form.requestSubmit() 提交，彻底规避域名显示。
 */
export function ConfirmSubmit({
  children,
  confirmText = "确定要执行该操作吗？",
  className = "btn-quiet btn-sm",
  pendingText = "处理中…",
  title,
}: {
  children: React.ReactNode;
  confirmText?: string;
  className?: string;
  pendingText?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        ref={buttonRef}
        type="submit"
        title={title}
        disabled={pending}
        className={cn(className, pending && "opacity-60")}
        onClick={(event) => {
          // 拦截原生提交，先弹自定义确认框
          event.preventDefault();
          setOpen(true);
        }}
      >
        {pending ? pendingText : children}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[15px] font-bold text-ink">{confirmText}</p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                className="btn-quiet flex-1"
                onClick={() => setOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={() => {
                  setOpen(false);
                  // 关闭弹窗后再提交，走原表单 action（Server Action）
                  buttonRef.current?.form?.requestSubmit();
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
