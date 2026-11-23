"use client";

import { useRef, useState } from "react";
import { Disclosure } from "@/components/Disclosure";

const CLAUSES = [
  "上十派仅提供同厂同好之间的信息发布与兴趣社交服务，不组织、不参与、不担保任何用户或派自发发起的线下活动。",
  "注册时须提供真实信息并完成公司身份认证；冒用他人身份、伪造在职或离职材料的，由账号使用者自行承担全部责任。",
  "平台仅收集为提供服务所必需的信息：注册时收集的手机号或邮箱、昵称、密码，身份认证时提交的企业邮箱、工牌或离职材料，以及您发布的内容与互动记录；您应保证所提供信息真实、准确，因提交虚假或侵犯他人权益信息产生的责任由您自行承担。",
  "徒步、跑步、骑行、球类、聚会等线下活动存在人身伤害、财产损失等固有风险，参与者应自行评估身体状况与路线安全，必要时自行购买保险，风险自担。",
  "用户发布的内容应遵守法律法规与公序良俗，不得包含违法、侵权、骚扰、歧视、虚假或泄露他人隐私的信息；平台有权删除违规内容并视情节限制或封禁账号。",
  "身份认证材料仅用于运营审核，不会公开展示；请妥善保管账号与密码，因账号出借、泄露造成的损失由账号使用者承担。",
  "派主与副派主由用户申请并经平台审核产生，其组织活动、收取费用、作出承诺等行为均属个人行为，不代表平台立场。",
  "平台可能包含第三方链接或外部服务，其内容与安全性由第三方负责，平台不承担由此产生的责任。",
  "本协议可能随业务调整更新并在注册与相关页面公示，更新后继续使用即视为接受；因本协议产生的争议适用中华人民共和国法律。",
];

/**
 * 注册页免责协议：勾选后才允许注册（必填项）
 * 全文折叠面板放在勾选框下方，点击勾选文案中的红色协议名即展开并滚动定位到全文，
 * 不再设置上方独立的「查看全文」入口。
 * 勾选框用不受控写法：提交后 React 会 form.reset()，只有 defaultValue / defaultChecked 会被恢复，
 * 写成受控的 checked 会在提交失败后被重置成未勾选。
 */
export function DisclaimerConsent({
  error,
  checked,
  onCheckedChange,
}: {
  error?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // 协议名在 label 内：阻止冒泡，避免点击协议名时顺带切换勾选状态
  function openAgreement(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
    requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  return (
    <div className="space-y-2">
      <p className="label" data-required>
        免责协议
      </p>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-ink-line bg-white p-3 transition has-[:checked]:border-brand has-[:checked]:bg-brand-soft/40">
        <input
          type="checkbox"
          name="terms"
          value="true"
          required
          aria-required="true"
          defaultChecked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-line accent-brand"
        />
        <span className="text-[11.5px] leading-relaxed text-ink-soft">
          我已阅读并同意
          <b
            role="button"
            aria-expanded={open}
            onClick={openAgreement}
            className="mx-0.5 cursor-pointer font-bold text-brand underline-offset-2 active:opacity-70"
          >
            《上十派平台免责协议》
          </b>
          ，理解线下活动风险自担，并对本人发布的内容负责。
          <span className="mt-0.5 block text-[10.5px] text-ink-mute">
            未勾选无法完成注册，此为必填项。点击协议名可查看协议全文。
          </span>
        </span>
      </label>

      <Disclosure
        id="disclaimer-panel"
        open={open}
        onOpenChange={setOpen}
        className="rounded-xl bg-cream px-3 py-2.5"
        summaryClassName="text-[11.5px] font-semibold text-ink-soft"
        summary="《上十派平台免责协议》全文"
      >
        <div ref={panelRef} className="mt-2 max-h-52 overflow-y-auto pr-1">
          <ol className="list-decimal space-y-1.5 pl-4 text-[10.5px] leading-relaxed text-ink-mute">
            {CLAUSES.map((clause) => (
              <li key={clause}>{clause}</li>
            ))}
          </ol>
        </div>
      </Disclosure>
      {error ? <p className="text-[11px] font-medium text-[#B42318]">{error}</p> : null}
    </div>
  );
}
