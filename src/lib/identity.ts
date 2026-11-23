/**
 * 用户的认证身份展示快照：公司短名 + 在职/离职。
 * 一个账号可认证多家公司（Employment @@unique([userId, companyId, kind])），
 * 展示时必须先按场景挑选一条，避免同一用户在不同派显示不同公司却无规则。
 */
export type UserIdentity = {
  companyId: string;
  companyShortName: string;
  kind: "ACTIVE" | "ALUMNI";
};

/** Prisma 查询侧需要带上的最小字段集（不含邮箱等敏感信息） */
export type IdentityEmployment = {
  companyId: string;
  kind: string;
  company: { shortName: string };
};

/**
 * 从用户已认证的公司中挑选展示用身份：
 * 1. 优先本派所属公司（评论/活动发生在派内，同公司身份最有解释力）
 * 2. 其次在职（ACTIVE），离职校友排在后面
 * 3. 最后取第一条
 */
export function pickUserIdentity(
  employments: IdentityEmployment[],
  factionCompanyId?: string | null,
): UserIdentity | null {
  if (!employments.length) return null;

  const local = factionCompanyId
    ? employments.find((item) => item.companyId === factionCompanyId)
    : undefined;
  const chosen =
    local ?? employments.find((item) => item.kind === "ACTIVE") ?? employments[0];

  return {
    companyId: chosen.companyId,
    companyShortName: chosen.company.shortName,
    kind: chosen.kind === "ALUMNI" ? "ALUMNI" : "ACTIVE",
  };
}
