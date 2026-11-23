import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/auth/AdminLoginForm";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "管理端登录" };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  // 只允许回到 /admin 下的页面
  const next = params.next && params.next.startsWith("/admin") ? params.next : "/admin";

  const user = await getCurrentUser();
  if (user?.role === "ADMIN") redirect(next);

  const forbidden = params.error === "forbidden" || Boolean(user);

  return (
    <div className="flex min-h-dvh flex-col bg-cream px-5 py-10">
      <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Logo />
          <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold text-white">
            管理端
          </span>
        </div>

        <div className="card p-5">
          <h1 className="text-[20px] font-black tracking-tight text-ink">运营管理端</h1>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-mute">
            审核、用户与内容治理统一在这里处理。当前账号若为普通用户，请从
            <Link href="/login" className="mx-1 font-semibold text-brand">
              用户端登录
            </Link>
            进入。
          </p>

          {forbidden ? (
            <Notice
              message="该账号不是运营账号，无法进入管理端；如需开通请联系平台负责人。"
              tone="error"
              className="mt-3"
            />
          ) : null}

          <div className="mt-4">
            <AdminLoginForm next={next} />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-4 text-[11px] text-ink-mute">
          <Link href="/" className="inline-flex items-center gap-1 hover:text-ink">
            <Icon name="home" size={13} />
            返回上十派首页
          </Link>
          <Link href="/login" className="hover:text-ink">
            用户端登录
          </Link>
        </div>
      </div>
    </div>
  );
}
