import { THUMB_AVATAR, thumbSrc } from "@/lib/thumb";
import { cn, initials } from "@/lib/utils";

const SIZES = {
  xs: "h-7 w-7 text-[11px]",
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-lg",
  xl: "h-20 w-20 text-2xl",
};

export function Avatar({
  name,
  color = "#FF5A1F",
  size = "sm",
  ring = false,
  src = null,
  className,
}: {
  name: string;
  color?: string;
  size?: keyof typeof SIZES;
  ring?: boolean;
  /** 照片头像：库里存的 /uploads 相对路径，缺图时自动回落字母头像 */
  src?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white",
        SIZES[size],
        ring && "ring-2 ring-white",
        className,
      )}
      style={src ? undefined : { background: `linear-gradient(135deg, ${color}, ${color}CC)` }}
    >
      {/* 头像最大渲染 80px，统一走 160w 缩略：过去直接上原图，线上实测单张头像原图最大 816KB */}
      {src ? (
        <img
          src={thumbSrc(src, THUMB_AVATAR)}
          alt={name}
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
