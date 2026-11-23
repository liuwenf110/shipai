import Link from "next/link";
import { prisma } from "@/lib/db";
import { ADMIN_USER } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Icon } from "@/components/Icon";
import { QueryNotice } from "@/components/Notice";
import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { EmptyState } from "@/components/Section";
import { reviewEmploymentAction } from "@/lib/actions/admin";
import { withBasePath } from "@/lib/base-path";
import { EMPLOYMENT_KIND } from "@/lib/constants";
import { cn, formatDateTime, splitList } from "@/lib/utils";

const TABS = [
  { key: "PENDING", label: "待审核" },
  { key: "VERIFIED", label: "已通过" },
  { key: "REJECTED", label: "已驳回" },
];

const METHODS = [
  { key: "ALL", label: "全部方式" },
  { key: "EMAIL", label: "邮箱验证" },
  { key: "MANUAL", label: "材料审核" },
];

export default async function AdminVerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    company?: string;
    method?: string;
    q?: string;
    ok?: string;
    error?: string;
  }>;
}) {
  const query = await searchParams;
  const status = TABS.some((item) => item.key === query.status) ? query.status! : "PENDING";
  const companyId = query.company ?? "";
  const method = METHODS.some((item) => item.key === query.method) ? query.method! : "ALL";
  const q = query.q?.trim() ?? "";

  const filtered = Boolean(companyId || q || method !== "ALL");

  const paramsOf = (next: { status?: string; company?: string; method?: string; q?: string }) => {
    const params = new URLSearchParams();
    params.set("status", next.status ?? status);
    const nextCompany = next.company ?? companyId;
    const nextMethod = next.method ?? method;
    const nextQ = (next.q ?? q).trim();
    if (nextCompany) params.set("company", nextCompany);
    if (nextMethod && nextMethod !== "ALL") params.set("method", nextMethod);
    if (nextQ) params.set("q", nextQ);
    return `/admin/verifications?${params.toString()}`;
  };

  const [records, counts, companies] = await Promise.all([
    prisma.employment.findMany({
      where: {
        status,
        ...(companyId ? { companyId } : {}),
        ...(method !== "ALL" ? { method } : {}),
        ...(q
          ? {
              OR: [
                { user: { nickname: { contains: q } } },
                { user: { email: { contains: q } } },
                { user: { phone: { contains: q } } },
                { workEmail: { contains: q } },
              ],
            }
          : {}),
      },
      include: { user: { select: ADMIN_USER }, company: true, reviewer: { select: ADMIN_USER } },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
    prisma.employment.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.company.findMany({ orderBy: { verifiedCount: "desc" }, select: { id: true, shortName: true } }),
  ]);

  const countMap = new Map(counts.map((item) => [item.status, item._count._all]));

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-bold tracking-[0.22em] text-brand">VERIFICATION</p>
        <h1 className="mt-1 text-[22px] font-black tracking-tight">身份审核</h1>
        <p className="mt-1 text-[12px] text-ink-mute">
          在职邮箱验证会自动通过；离职材料需要人工核对证明文件后放行
        </p>
      </div>

      <QueryNotice ok={query.ok} error={query.error} />

      <div className="flex items-center gap-1.5">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={paramsOf({ status: item.key })}
            className={cn("tab-pill", status === item.key && "tab-pill-active")}
          >
            {item.label}
            <span className="ml-1 text-[10px] opacity-70">{countMap.get(item.key) ?? 0}</span>
          </Link>
        ))}
      </div>

      <form action={withBasePath("/admin/verifications")} className="card flex flex-wrap items-center gap-2 p-2.5">
        <input type="hidden" name="status" value={status} />
        <select name="company" defaultValue={companyId} className="input py-2 text-[12px] md:w-44">
          <option value="">全部公司</option>
          {companies.map((item) => (
            <option key={item.id} value={item.id}>
              {item.shortName}
            </option>
          ))}
        </select>
        <select name="method" defaultValue={method} className="input py-2 text-[12px] md:w-36">
          {METHODS.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
        <input
          name="q"
          defaultValue={q}
          placeholder="搜索昵称 / 邮箱 / 工作邮箱"
          className="input min-w-0 flex-1 py-2 text-[12px]"
        />
        <button type="submit" className="btn-ghost btn-sm">
          筛选
        </button>
        {filtered ? (
          <Link href={`/admin/verifications?status=${status}`} className="btn-quiet btn-sm">
            清除
          </Link>
        ) : null}
      </form>

      {records.length ? (
        <div className="space-y-2.5">
          {records.map((record) => {
            const files = splitList(record.proofFiles).map(withBasePath);
            return (
              <div key={record.id} className="card p-4">
                <div className="flex flex-wrap items-start gap-2.5">
                  <Avatar name={record.user.nickname} color={record.user.avatarColor} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-[13px] font-bold text-ink">{record.user.nickname}</p>
                      <Badge tone={record.kind === "ALUMNI" ? "mute" : "ok"}>
                        {EMPLOYMENT_KIND[record.kind as keyof typeof EMPLOYMENT_KIND]?.label}
                      </Badge>
                      <Badge tone="ocean">
                        {record.method === "EMAIL" ? "邮箱验证" : "材料审核"}
                      </Badge>
                      <span className="text-[10.5px] text-ink-mute">
                        提交于 {formatDateTime(record.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11.5px] text-ink-soft">
                      {record.company.name}
                      {record.workEmail ? ` · ${record.workEmail}` : ""}
                      {record.title ? ` · ${record.title}` : ""}
                    </p>
                    {record.startedYear || record.leftYear ? (
                      <p className="text-[10.5px] text-ink-mute">
                        在职时间：{record.startedYear ?? "?"} - {record.leftYear ?? "至今"}
                      </p>
                    ) : null}
                    <p className="text-[10.5px] text-ink-mute">
                      登录账号：{record.user.email ?? record.user.phone ?? "未绑定"}
                    </p>
                  </div>
                </div>

                {record.proofNote ? (
                  <div className="mt-2.5 rounded-xl bg-cream px-3 py-2">
                    <p className="text-[10px] font-bold text-ink-mute">申请人说明</p>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-soft">
                      {record.proofNote}
                    </p>
                  </div>
                ) : null}

                {files.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {files.map((file) => (
                      <a
                        key={file}
                        href={file}
                        target="_blank"
                        rel="noreferrer"
                        className="group relative block overflow-hidden rounded-xl ring-1 ring-ink-line"
                      >
                        {file.endsWith(".pdf") ? (
                          <span className="flex h-24 w-32 flex-col items-center justify-center gap-1 bg-cream text-[10px] font-semibold text-ink-mute">
                            <Icon name="flag" size={18} />
                            查看 PDF 材料
                          </span>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={file} alt="证明材料" className="h-24 w-32 object-cover" />
                        )}
                        <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-0.5 text-center text-[9px] font-bold text-white">
                          点击查看原图
                        </span>
                      </a>
                    ))}
                  </div>
                ) : null}

                {record.status === "PENDING" ? (
                  <AdminActionForm
                    className="mt-3"
                    action={reviewEmploymentAction}
                    hidden={{ employmentId: record.id }}
                    field={{
                      name: "note",
                      placeholder: "审核备注（驳回时请写明原因，会展示给用户）",
                    }}
                    buttons={[
                      {
                        value: "approve",
                        label: "通过认证",
                        className: "btn-primary btn-sm",
                        pendingText: "处理中…",
                      },
                      {
                        value: "reject",
                        label: "驳回",
                        className: "btn-quiet btn-sm",
                        pendingText: "处理中…",
                      },
                    ]}
                    hint="也会通知用户注册邮箱"
                  />
                ) : (
                  <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-cream px-3 py-2">
                    <Icon name="check" size={13} className="text-moss" />
                    <p className="text-[11px] text-ink-soft">
                      {record.reviewer?.nickname ?? "运营"} ·{" "}
                      {record.reviewedAt ? formatDateTime(record.reviewedAt) : ""}
                      {record.reviewerNote ? `：${record.reviewerNote}` : ""}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon="shield"
            title={status === "PENDING" ? "没有待审核的身份认证" : "这里还没有记录"}
            desc="用户提交在职邮箱验证或离职材料后会出现在这里"
          />
        </div>
      )}
    </div>
  );
}
