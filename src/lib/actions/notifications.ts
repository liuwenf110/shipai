"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

function safeListPath(page: string | null) {
  const target = Number(page);
  if (Number.isFinite(target) && target > 1) return `/notifications?page=${target}`;
  return "/notifications";
}

export async function markAllReadAction() {
  const user = await requireUser("/notifications");
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
  revalidatePath("/");
  redirect("/notifications");
}

/** 单条标记已读，停留在当前页 */
export async function markReadAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const page = String(formData.get("page") ?? "1");
  const user = await requireUser("/notifications");

  await prisma.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/notifications");
  revalidatePath("/");
  redirect(safeListPath(page));
}

