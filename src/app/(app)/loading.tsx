import { Icon } from "@/components/Icon";

/**
 * (app) 组共用路由骨架：点底部标签时链接是动态路由，客户端要先取 RSC 再渲染，
 * 没有这层兜底就会出现「点了半天页面一动不动」。
 * 骨架只铺内容区，TopBar/BottomNav 在 layout 里不参与替换，所以导航始终可点。
 */
export default function AppLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-6 pt-5">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-ink-mute">
        <Icon name="sparkle" size={14} className="animate-spin" />
        加载中…
      </div>
      <div className="mt-3 space-y-3">
        <div className="card h-[72px] animate-pulse bg-white/60" />
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="card space-y-2.5 p-4">
            <div className="flex items-center gap-2.5">
              <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-cream-sunk" />
              <span className="flex-1 space-y-1.5">
                <span className="block h-3 w-1/3 animate-pulse rounded bg-cream-sunk" />
                <span className="block h-3 w-1/5 animate-pulse rounded bg-cream-sunk/70" />
              </span>
            </div>
            <span className="block h-3 w-full animate-pulse rounded bg-cream-sunk" />
            <span className="block h-3 w-4/5 animate-pulse rounded bg-cream-sunk/70" />
          </div>
        ))}
      </div>
    </div>
  );
}
