import "server-only";

import crypto from "node:crypto";

/** 邀请码有效期：30 天 */
export const INVITE_VALID_DAYS = 30;

/** 去掉容易混淆的 I / O / 0 / 1，方便口头与手抄 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode() {
  const bytes = crypto.randomBytes(8);
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += ALPHABET[bytes[index] % ALPHABET.length];
  }
  return code;
}

/** 规范化用户输入的邀请码（去空格、转大写） */
export function normalizeInviteCode(value: string) {
  return value.trim().toUpperCase();
}

/** 邀请码是否仍可使用：已通过、未被使用、未过期 */
export function isInviteUsable(invite: {
  status: string;
  usedById: string | null;
  expiresAt: Date | null;
}) {
  return (
    invite.status === "APPROVED" &&
    !invite.usedById &&
    Boolean(invite.expiresAt && invite.expiresAt.getTime() > Date.now())
  );
}

export type InviteState = "PENDING" | "READY" | "USED" | "EXPIRED" | "REJECTED";

/** 把邀请码记录折算成展示态 */
export function inviteStateOf(invite: {
  status: string;
  usedById: string | null;
  expiresAt: Date | null;
}): InviteState {
  if (invite.status === "PENDING") return "PENDING";
  if (invite.status === "REJECTED") return "REJECTED";
  if (invite.usedById) return "USED";
  if (!invite.expiresAt || invite.expiresAt.getTime() <= Date.now()) return "EXPIRED";
  return "READY";
}
