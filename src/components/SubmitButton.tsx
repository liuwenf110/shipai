"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

export function SubmitButton({
  children,
  className = "btn-primary",
  pendingText = "处理中…",
  disabled,
  name,
  value,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      title={title}
      disabled={pending || disabled}
      className={cn(className)}
    >
      {pending ? pendingText : children}
    </button>
  );
}

export function IconSubmit({
  children,
  className,
  title,
  name,
  value,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      title={title}
      disabled={pending}
      className={cn("transition disabled:opacity-40", className)}
    >
      {children}
    </button>
  );
}
