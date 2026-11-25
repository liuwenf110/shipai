import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { cn } from "@/lib/utils";

/**
 * 可点击进入公开主页的用户头像：/users/[id]。
 * 仅用于「他人」；自己的头像保持原样（指向 /me 或不可点），后台 /admin/** 不接线。
 */
export function UserAvatar({
  id,
  name,
  color,
  size = "sm",
  ring = false,
  src = null,
  className,
}: {
  id: string;
  name: string;
  color?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  ring?: boolean;
  /** 照片头像（User.avatarImage）：凡数据里带该字段的展示位都应传入，缺图自动回落字母头像 */
  src?: string | null;
  className?: string;
}) {
  return (
    <Link
      href={`/users/${id}`}
      className={cn("inline-flex shrink-0 hover:opacity-90", className)}
      aria-label={`${name} 的主页`}
      title={name}
    >
      <Avatar name={name} color={color} size={size} ring={ring} src={src} />
    </Link>
  );
}
