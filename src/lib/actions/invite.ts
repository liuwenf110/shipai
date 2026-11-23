"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { notify, notifyAdmins } from "@/lib/notify";
import { generateInviteCode, INVITE_VALID_DAYS } from "@/lib/invite";
import type { ActionState } from "@/lib/types";

function back(path: string, key: "ok" | "error", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${key}=${encodeURIComponent(message)}`);
}

/** 派主 / 副派主发起邀请码申请 */
export async function requestInviteCodeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const factionId = String(formData.get("factionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const path = `/factions/${slug}/manage?tab=settings`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`);

  const membership = await prisma.factionMember.findUnique({
    where: { factionId_userId: { factionId, userId: user.id } },
  });
  if (!membership || membership.status !== "ACTIVE" || membership.role === "MEMBER") {
    return { error: "只有派主 / 副派主可以申请邀请码" };
  }

  const faction = await prisma.faction.findUnique({
    where: { id: factionId },
    select: { id: true, name: true, status: true },
  });
  if (!faction) return { error: "该派不存在" };
  if (faction.status !== "ACTIVE") return { error: "该派尚未上线，暂时不能申请邀请码" };
  if (note.length < 2) return { error: "请填写邀请用途，至少 2 个字" };
  if (note.length > 120) return { error: "邀请用途最多 120 个字" };

  const pending = await prisma.inviteCode.count({
    where: { factionId, status: "PENDING" },
  });
  if (pending) return { error: "已有一条邀请码申请在审核中，请耐心等待" };

  await prisma.inviteCode.create({
    data: { factionId, leaderId: user.id, note },
  });

  await notifyAdmins({
    type: "SYSTEM",
    title: `「${faction.name}」申请注册邀请码`,
    body: `${user.nickname}：${note}`,
    link: "/admin/invites",
  });

  revalidatePath(path);
  back(path, "ok", "邀请码申请已提交，运营审核通过后即可分享");
}

/** 运营审核邀请码申请：通过后生成一次性邀请码，30 天有效 */
export async function reviewInviteCodeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const inviteId = String(formData.get("inviteId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const path = "/admin/invites";

  const invite = await prisma.inviteCode.findUnique({
    where: { id: inviteId },
    include: { faction: true, leader: true },
  });
  if (!invite) return { error: "邀请码申请不存在" };
  if (invite.status !== "PENDING") return { error: "该申请已被处理" };
  if (decision !== "approve" && decision !== "reject") return { error: "未知的审批操作" };

  if (decision === "approve") {
    let code = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateInviteCode();
      const exists = await prisma.inviteCode.findUnique({
        where: { code: candidate },
        select: { id: true },
      });
      if (!exists) {
        code = candidate;
        break;
      }
    }
    if (!code) return { error: "邀请码生成失败，请重试" };

    const expiresAt = new Date(Date.now() + INVITE_VALID_DAYS * 24 * 60 * 60 * 1000);
    const updated = await prisma.inviteCode.updateMany({
      where: { id: inviteId, status: "PENDING" },
      data: {
        status: "APPROVED",
        code,
        expiresAt,
        reviewerId: admin.id,
        reviewerNote: note || null,
        reviewedAt: new Date(),
      },
    });
    if (updated.count !== 1) return { error: "该申请已被处理" };

    await notify({
      userId: invite.leaderId,
      type: "SYSTEM",
      title: `邀请码已下发：「${invite.faction.name}」`,
      body: `邀请码 ${code}，${INVITE_VALID_DAYS} 天内有效。新朋友用邀请链接注册后会自动加入本派。`,
      link: `/factions/${invite.faction.slug}/manage?tab=settings`,
    });
    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "APPROVE_INVITE",
        targetType: "InviteCode",
        targetId: inviteId,
        note: `${invite.faction.name} · ${code}`,
      },
    });

    revalidatePath(path);
    revalidatePath(`/factions/${invite.faction.slug}/manage`);
    back(path, "ok", `已为「${invite.faction.name}」生成邀请码 ${code}`);
  }

  const updated = await prisma.inviteCode.updateMany({
    where: { id: inviteId, status: "PENDING" },
    data: {
      status: "REJECTED",
      reviewerId: admin.id,
      reviewerNote: note || "暂不发放，如仍有需要可再次申请",
      reviewedAt: new Date(),
    },
  });
  if (updated.count !== 1) back(path, "error", "该申请已被处理");

  await notify({
    userId: invite.leaderId,
    type: "SYSTEM",
    title: `邀请码申请未通过：「${invite.faction.name}」`,
    body: note || "暂不发放邀请码，如仍有需要可再次申请。",
    link: `/factions/${invite.faction.slug}/manage?tab=settings`,
  });
  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "REJECT_INVITE",
      targetType: "InviteCode",
      targetId: inviteId,
      note,
    },
  });

  revalidatePath(path);
  revalidatePath(`/factions/${invite.faction.slug}/manage`);
  back(path, "ok", "已驳回该邀请码申请");
}
