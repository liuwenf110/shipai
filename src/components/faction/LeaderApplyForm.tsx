"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { applyLeaderAction } from "@/lib/actions/faction";
import { INITIAL_ACTION_STATE } from "@/lib/types";
import { useFormValues } from "@/lib/use-form-values";

export function LeaderApplyForm({
  factionId,
  factionName,
  requestedRole,
}: {
  factionId: string;
  factionName: string;
  requestedRole: "LEADER" | "ADMIN";
}) {
  const [state, formAction] = useActionState(applyLeaderAction, INITIAL_ACTION_STATE);
  // 申请理由与计划受控：提交失败时保留内容，避免重新手写
  const form = useFormValues({ reason: "", plan: "", experience: "" });
  const [proofName, setProofName] = useState("");

  // 浏览器不允许回填文件输入，提交失败后只能提示重新选择截图
  useEffect(() => {
    if (state.error) setProofName("");
  }, [state]);

  if (state.ok) {
    return (
      <div className="card p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#E9F6EF] text-moss">
          <span className="text-xl">✓</span>
        </div>
        <p className="mt-3 text-[14px] font-bold text-ink">申请已提交</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-mute">
          运营会在 1-3 个工作日内完成审核，结果通过站内消息通知你。
        </p>
        <Link href={`/factions`} className="btn-ghost btn-sm mt-4">
          返回兴趣派
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="card space-y-3.5 p-4">
      <input type="hidden" name="factionId" value={factionId} />
      <input type="hidden" name="requestedRole" value={requestedRole} />

      <div className="rounded-xl bg-cream px-3 py-2.5">
        <p className="text-[11px] text-ink-mute">你正在申请</p>
        <p className="mt-0.5 text-[13px] font-bold text-ink">
          「{factionName}」{requestedRole === "LEADER" ? "派主" : "副派主"}认证
        </p>
      </div>

      <Notice message={state.error} tone="error" />
      <p className="text-[11px] text-ink-mute">
        带 <span className="text-brand">*</span> 的为必填项
      </p>

      <div>
        <label className="label" data-required>为什么由你来带这个派</label>
        <textarea
          {...form.field("reason")}
          rows={3}
          required
          placeholder="例如：我在阿里做了 3 年瑜伽社团，固定每周三下班后组织，累计带过 200+ 人次。"
          className="input resize-none"
        />
      </div>

      <div>
        <label className="label" data-required>运营计划</label>
        <textarea
          {...form.field("plan")}
          rows={4}
          required
          placeholder="未来 3 个月打算怎么运营：活动频率、场地、招新方式、内容栏目等。"
          className="input resize-none"
        />
      </div>

      <div>
        <label className="label">过往组织经验（选填）</label>
        <input
          {...form.field("experience")}
          placeholder="如：前 XX 公司桌游社社长 / 组织过 12 场徒步"
          className="input"
        />
      </div>

      <div>
        <label className="label">过往带队截图（选填）</label>
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-ink-line bg-cream px-3 py-4 text-center transition hover:border-brand/60 hover:bg-brand-soft/30",
            proofName && "border-brand/60 bg-brand-soft/30",
          )}
        >
          <Icon name="upload" size={18} className="text-ink-mute" />
          <span className="text-[11px] font-semibold text-ink-soft">
            {proofName || (state.error ? "提交未通过，需要重新选择截图" : "点击上传过往带队截图")}
          </span>
          <span className="text-[10px] text-ink-mute">支持 JPG / PNG / WEBP，不超过 6MB</span>
          <input
            type="file"
            name="proofImage"
            accept="image/*"
            className="hidden"
            onChange={(event) => setProofName(event.target.files?.[0]?.name ?? "")}
          />
        </label>
      </div>

      <SubmitButton className="btn-primary w-full" pendingText="提交中…">
        提交{requestedRole === "LEADER" ? "派主" : "副派主"}申请
      </SubmitButton>
      <p className="hint text-center">
        审核通过后你将担任本派{requestedRole === "LEADER" ? "派主" : "副派主"}，可审批成员、发起活动并进入管理台；
        若被驳回，你仍保留本派普通成员身份
      </p>
    </form>
  );
}
