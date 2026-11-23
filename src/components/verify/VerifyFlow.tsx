"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Company } from "@prisma/client";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { confirmWorkEmailCode, sendWorkEmailCode, submitAlumniProof } from "@/lib/actions/verify";
import { INITIAL_ACTION_STATE } from "@/lib/types";
import { cn } from "@/lib/utils";

type Step = "company" | "method" | "active" | "alumni";

export function VerifyFlow({ companies }: { companies: Company[] }) {
  const [step, setStep] = useState<Step>("company");
  const [company, setCompany] = useState<Company | null>(null);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-line/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-[11px] font-black text-white">
            {step === "company" ? "1" : step === "method" ? "2" : "3"}
          </span>
          <div>
            <p className="text-[13px] font-bold text-ink">
              {step === "company"
                ? "选择你要认证的公司"
                : step === "method"
                  ? `${company?.shortName} · 选择认证方式`
                  : step === "active"
                    ? `${company?.shortName} · 企业邮箱验证`
                    : `${company?.shortName} · 提交离职材料`}
            </p>
            <p className="text-[10.5px] text-ink-mute">
              {step === "company"
                ? "加入某公司的派，需要对该公司完成一次身份认证"
                : step === "method"
                  ? "在职走邮箱，离职走材料审核，通过后权益一致"
                  : "身份材料仅用于审核，不会公开展示"}
            </p>
          </div>
        </div>
        {step !== "company" ? (
          <button
            type="button"
            onClick={() => {
              setStep(step === "method" ? "company" : "method");
            }}
            className="flex items-center gap-0.5 text-[11px] font-semibold text-ink-mute hover:text-ink"
          >
            <Icon name="back" size={13} />
            上一步
          </button>
        ) : null}
      </div>

      <div className="p-4">
        {step === "company" ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {companies.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setCompany(item);
                  setStep("method");
                }}
                className="flex items-center gap-2 rounded-xl border border-ink-line bg-white p-2.5 text-left transition hover:border-brand/60 hover:bg-brand-soft/30"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-black text-white"
                  style={{ background: item.color }}
                >
                  {item.logoText}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-bold text-ink">{item.shortName}</span>
                  <span className="block truncate text-[9.5px] text-ink-mute">
                    {item.domains.split(",")[0]}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {step === "method" && company ? (
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => setStep("active")}
              className="flex w-full items-start gap-3 rounded-2xl border border-ink-line bg-white p-3.5 text-left transition hover:border-brand/60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-dark">
                <Icon name="mail" size={17} />
              </span>
              <span className="flex-1">
                <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                  在职员工 · 企业邮箱验证
                  <span className="rounded bg-[#E9F6EF] px-1 py-0.5 text-[9px] font-bold text-moss">
                    秒过
                  </span>
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-mute">
                  用工牌邮箱收 6 位验证码，域名命中 {company.shortName} 企业邮箱库即自动通过。
                </span>
              </span>
              <Icon name="right" size={15} className="mt-2 text-ink-mute" />
            </button>

            <button
              type="button"
              onClick={() => setStep("alumni")}
              className="flex w-full items-start gap-3 rounded-2xl border border-ink-line bg-white p-3.5 text-left transition hover:border-brand/60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F1EAFE] text-plum">
                <Icon name="shield" size={17} />
              </span>
              <span className="flex-1">
                <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                  已离职校友 · 材料审核
                  <span className="rounded bg-[#FFF4D6] px-1 py-0.5 text-[9px] font-bold text-[#9A6B00]">
                    1 个工作日
                  </span>
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-mute">
                  企业邮箱已回收？上传离职证明 / 工牌 / 社保截图，由运营人工审核。
                </span>
              </span>
              <Icon name="right" size={15} className="mt-2 text-ink-mute" />
            </button>

            <p className="hint px-1 pt-1">
              提示：同一家公司只能认证一种身份；更换公司可继续认证，形成你的「厂牌墙」。
            </p>
          </div>
        ) : null}

        {step === "active" && company ? <ActiveVerifyForm company={company} /> : null}
        {step === "alumni" && company ? <AlumniVerifyForm company={company} /> : null}
      </div>
    </div>
  );
}

function ActiveVerifyForm({ company }: { company: Company }) {
  const router = useRouter();
  const [sendState, sendAction] = useActionState(sendWorkEmailCode, INITIAL_ACTION_STATE);
  const [confirmState, confirmAction] = useActionState(
    confirmWorkEmailCode,
    INITIAL_ACTION_STATE,
  );
  const [codeSent, setCodeSent] = useState(false);
  // 字段受控：提交失败后 React 会重置 DOM，受控值能保留邮箱与验证码便于直接修改
  const [workEmail, setWorkEmail] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (sendState.ok) setCodeSent(true);
  }, [sendState.ok]);

  useEffect(() => {
    if (confirmState.ok) router.refresh();
  }, [confirmState.ok, router]);

  if (confirmState.ok) {
    return (
      <div className="rounded-2xl bg-[#E9F6EF] p-4 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-moss">
          <Icon name="check" size={20} />
        </span>
        <p className="mt-2 text-[13px] font-bold text-moss">在职身份认证通过</p>
        <p className="mt-0.5 text-[11px] text-[#3D6B58]">
          {company.shortName} 旗下兴趣派已对你开放
        </p>
        <Link href="/discover" className="btn-primary btn-sm mt-3">
          去挑选兴趣派
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <form action={sendAction} className="space-y-3">
        <input type="hidden" name="companyId" value={company.id} />
        <p className="text-[11px] text-ink-mute">
          带 <span className="text-brand">*</span> 的为必填项
        </p>
        <div>
          <label className="label" data-required>企业邮箱</label>
          <input
            name="workEmail"
            type="email"
            required
            value={workEmail}
            onChange={(event) => {
              setWorkEmail(event.target.value);
              setCodeSent(false);
            }}
            placeholder={`yourname@${company.domains.split(",")[0]}`}
            className="input"
          />
          <p className="hint mt-1">
            支持域名：{company.domains.split(",").join(" / ")}
          </p>
        </div>
        <Notice message={sendState.error} tone="error" />
        <Notice message={sendState.message} tone="ok" />
        {sendState.devCode ? (
          <div className="rounded-xl border border-dashed border-brand/40 bg-brand-soft/60 px-3 py-2.5">
            <p className="text-[11px] font-bold text-brand-dark">开发模式 · 验证码已直出</p>
            <p className="mt-0.5 text-[13px] font-black tracking-[0.3em] text-ink">
              {sendState.devCode}
            </p>
            <p className="mt-0.5 text-[10px] text-ink-mute">
              未配置 SMTP，邮件内容可在站内
              <Link href="/inbox" className="mx-0.5 font-semibold text-brand underline">
                发件记录
              </Link>
              查看
            </p>
          </div>
        ) : null}
        <SubmitButton className="btn-ghost w-full" pendingText="发送中…">
          <Icon name="mail" size={15} />
          {codeSent ? "重新发送验证码" : "发送验证码"}
        </SubmitButton>
      </form>

      <form
        action={confirmAction}
        className={cn(
          "space-y-3 rounded-2xl p-3",
          codeSent ? "bg-cream" : "border border-dashed border-ink-line/80",
        )}
      >
        <input type="hidden" name="companyId" value={company.id} />
        <div>
          <label className="label" data-required>6 位验证码</label>
          <input
            name="code"
            inputMode="numeric"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="请输入邮件中的验证码"
            className="input text-center text-[18px] font-bold tracking-[0.45em]"
          />
        </div>
        {!codeSent ? (
          <p className="text-[10.5px] leading-relaxed text-ink-mute">
            已收到验证码？直接输入即可校验；未收到请先点上方「发送验证码」。
          </p>
        ) : null}
        <Notice message={confirmState.error} tone="error" />
        <SubmitButton className="btn-primary w-full" pendingText="校验中…">
          校验并完成认证
        </SubmitButton>
      </form>
    </div>
  );
}

function AlumniVerifyForm({ company }: { company: Company }) {
  const router = useRouter();
  const [state, formAction] = useActionState(submitAlumniProof, INITIAL_ACTION_STATE);
  const [fileName, setFileName] = useState("");
  const currentYear = new Date().getFullYear();
  // 文本字段受控：提交被驳回时保留原填写内容，用户只需补充修改
  const [values, setValues] = useState({
    startedYear: "",
    leftYear: String(currentYear),
    title: "",
    proofNote: "",
  });

  function update(key: keyof typeof values, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  // 浏览器禁止脚本回填 <input type="file">，提交后只能清掉文件名提示，请用户重新选择
  useEffect(() => {
    if (state.error) setFileName("");
  }, [state]);

  if (state.ok) {
    return (
      <div className="rounded-2xl bg-[#FFF8EC] p-4 text-center ring-1 ring-[#F5E3BF]">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#9A6B00]">
          <Icon name="shield" size={20} />
        </span>
        <p className="mt-2 text-[13px] font-bold text-[#8A5A00]">材料已提交</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[#A0782E]">
          运营会在 1 个工作日内完成审核，结果通过站内消息通知你。
        </p>
        <Link href="/notifications" className="btn-ghost btn-sm mt-3">
          查看审核进度
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="companyId" value={company.id} />
      <p className="text-[11px] text-ink-mute">
        带 <span className="text-brand">*</span> 的为必填项
      </p>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="label">入职工厂</label>
          <input
            name="startedYear"
            type="number"
            min={2000}
            max={currentYear}
            value={values.startedYear}
            onChange={(event) => update("startedYear", event.target.value)}
            placeholder="2019"
            className="input"
          />
        </div>
        <div>
          <label className="label">离职年份</label>
          <input
            name="leftYear"
            type="number"
            min={2000}
            max={currentYear}
            value={values.leftYear}
            onChange={(event) => update("leftYear", event.target.value)}
            className="input"
          />
        </div>
      </div>

      <div>
        <label className="label">当时部门 / 职位（选填）</label>
        <input
          name="title"
          value={values.title}
          onChange={(event) => update("title", event.target.value)}
          placeholder="如：淘天集团 · 前端工程师"
          className="input"
        />
      </div>

      <div>
        <label className="label" data-required>上传证明材料</label>
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-ink-line bg-cream px-3 py-5 text-center transition hover:border-brand/60 hover:bg-brand-soft/30",
            fileName && "border-brand/60 bg-brand-soft/30",
          )}
        >
          <Icon name="upload" size={18} className="text-ink-mute" />
          <span className="text-[11px] font-semibold text-ink-soft">
            {fileName || "点击上传离职证明 / 工牌 / 社保记录"}
          </span>
          <span className="text-[10px] text-ink-mute">
            {state.error ? "提交未通过，需要重新选择证明材料" : "支持 JPG / PNG / PDF，不超过 6MB"}
          </span>
          <input
            type="file"
            name="proof"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
          />
        </label>
      </div>

      <div>
        <label className="label" data-required>补充说明</label>
        <textarea
          name="proofNote"
          rows={2}
          required
          value={values.proofNote}
          onChange={(event) => update("proofNote", event.target.value)}
          placeholder="简单说明材料能证明的信息，如：离职证明上的工号与在职时间"
          className="input resize-none"
        />
      </div>

      <Notice message={state.error} tone="error" />
      <SubmitButton className="btn-primary w-full" pendingText="提交中…">
        提交审核
      </SubmitButton>
      <p className="hint text-center">
        材料仅运营可见，审核完成后立即从待审队列移除
      </p>
    </form>
  );
}
