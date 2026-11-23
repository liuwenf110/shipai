import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge } from "@/components/Badge";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/Section";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "发件记录" };

export default async function InboxPage() {
  const user = await requireUser("/inbox");
  // 普通用户只能查看发给自己的邮件，避免他人邮箱与验证码被读取；运营可查看全平台投递记录用于排查
  const isAdmin = user.role === "ADMIN";
  const mails = await prisma.mailMessage.findMany({
    where: isAdmin ? {} : { to: user.email ?? "\u0000" },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold tracking-[0.22em] text-brand">MAIL LOG</p>
          <h1 className="mt-1 text-[24px] font-black tracking-tight">发件记录</h1>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-mute">
            {isAdmin
              ? "平台发出的每一封邮件都会在这里留痕（含真实投递状态），方便排查是否送达；请以收件邮箱里的邮件为准。"
              : "发给你的邮件会在这里留痕（含真实投递状态），方便排查是否送达；请以收件邮箱里的邮件为准。"}
          </p>
        </div>
        <Link href="/verify" className="btn-ghost btn-sm shrink-0">
          去认证
        </Link>
      </div>

      {mails.length ? (
        <div className="mt-4 space-y-2.5">
          {mails.map((mail) => (
            <div key={mail.id} className="card p-3.5">
              <div className="flex items-center gap-1.5">
                <Icon name="mail" size={14} className="text-ink-mute" />
                <p className="min-w-0 flex-1 truncate text-[12px] font-bold text-ink">
                  {mail.subject}
                </p>
                {mail.code ? <Badge tone="brand">含验证码</Badge> : null}
              </div>
              <p className="mt-1 text-[10.5px] text-ink-mute">
                收件人 {mail.to} · {formatDateTime(mail.createdAt)}
              </p>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-cream px-2.5 py-2 font-sans text-[11px] leading-relaxed text-ink-soft">
                {mail.body}
              </pre>
            </div>
          ))}
        </div>
      ) : (
        <div className="card mt-4">
          <EmptyState
            icon="mail"
            title="暂无邮件"
            desc="在身份认证页发送一次企业邮箱验证码，这里就会出现对应邮件"
            actionLabel="去认证"
            actionHref="/verify"
          />
        </div>
      )}
    </div>
  );
}
