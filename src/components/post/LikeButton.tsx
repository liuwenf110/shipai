"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { stripBasePath } from "@/lib/base-path";
import { apiPost, ApiClientError } from "@/lib/client";
import { cn } from "@/lib/utils";

/** 点赞按钮：直接调用 /api/v1/posts/[id]/like，乐观更新 */
export function LikeButton({
  postId,
  liked,
  count,
  size = 15,
  showLabel = false,
  className,
}: {
  postId: string;
  liked: boolean;
  count: number;
  size?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const [state, setState] = useState({ liked, count });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const pathname = usePathname();

  const toggle = async () => {
    if (pending) return;
    const previous = state;
    setPending(true);
    setError("");
    setState({
      liked: !previous.liked,
      count: Math.max(0, previous.count + (previous.liked ? -1 : 1)),
    });

    try {
      const response = await apiPost<{ liked: boolean; likeCount: number }>(
        `/api/v1/posts/${postId}/like`,
      );
      setState({ liked: response.data.liked, count: response.data.likeCount });
      router.refresh();
    } catch (caught) {
      setState(previous);
      if (caught instanceof ApiClientError && caught.status === 401) {
        router.push(`/login?next=${encodeURIComponent(stripBasePath(pathname))}`);
        return;
      }
      setError(caught instanceof Error ? caught.message : "操作失败");
    } finally {
      setPending(false);
    }
  };

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={cn(
          "flex items-center gap-1 font-semibold transition disabled:opacity-60",
          state.liked ? "text-brand" : "hover:text-brand",
          className,
        )}
        aria-pressed={state.liked}
      >
        <Icon name="heart" size={size} />
        {showLabel ? (state.liked ? "已点赞" : "点赞") : null}
        <span>{state.count}</span>
      </button>
      {error ? <span className="text-[10px] font-medium text-[#B42318]">{error}</span> : null}
    </span>
  );
}
