import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import type { Viewer } from "@/lib/auth";

export function TopBar({
  viewer,
  miniProgram = false,
}: {
  viewer: Viewer | null;
  // 小程序 web-view 内：顶部已有小程序原生导航栏，隐藏 Logo/站名避免双标题，仅保留操作区
  miniProgram?: boolean;
}) {
  const primary = viewer?.verifiedEmployments[0];

  return (
    <header className="sticky top-0 z-30 border-b border-ink-line/70 bg-cream/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-7">
          {miniProgram ? null : <Logo />}
          <nav className="hidden items-center gap-1 md:flex">
            <NavLink href="/" label="首页" />
            {viewer ? (
              <>
                <NavLink href="/discover" label="发现" />
                <NavLink href="/notifications" label="消息" />
                <NavLink href="/messages" label="私信" dot={viewer.unreadMessages > 0} />
                <NavLink href="/me" label="我的" />
              </>
            ) : null}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/search"
            aria-label="搜索"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition hover:bg-cream-sunk"
          >
            <Icon name="search" size={19} />
          </Link>

          {viewer ? (
            <>
              {primary ? (
                <Link
                  href="/me"
                  className="hidden items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-soft ring-1 ring-ink-line transition hover:text-ink sm:inline-flex"
                >
                  <span
                    className="flex h-4 w-4 items-center justify-center rounded-[4px] text-[8px] font-bold text-white"
                    style={{ background: primary.company.color }}
                  >
                    {primary.company.logoText}
                  </span>
                  {primary.company.shortName} · {primary.kind === "ALUMNI" ? "离职" : "在职"}
                </Link>
              ) : (
                <Link
                  href="/verify"
                  className="hidden items-center gap-1 rounded-full bg-[#FFF4D6] px-2.5 py-1 text-[11px] font-semibold text-[#9A6B00] sm:inline-flex"
                >
                  <Icon name="shield" size={12} />
                  身份待认证
                </Link>
              )}

              <Link
                href="/notifications"
                aria-label="消息"
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition hover:bg-cream-sunk"
              >
                <Icon name="bell" size={19} />
                {viewer.unreadCount > 0 ? (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand ring-2 ring-cream" />
                ) : null}
              </Link>

              <Link href="/me" aria-label="我的">
                <Avatar name={viewer.user.nickname} color={viewer.user.avatarColor} size="sm" />
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-quiet btn-sm">
                登录
              </Link>
              <Link href="/register" className="btn-primary btn-sm">
                加入
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, label, dot = false }: { href: string; label: string; dot?: boolean }) {
  return (
    <Link
      href={href}
      className="relative rounded-full px-3 py-1.5 text-[13px] font-semibold text-ink-soft transition hover:bg-white hover:text-ink"
    >
      {label}
      {dot ? (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brand ring-2 ring-cream" />
      ) : null}
    </Link>
  );
}
