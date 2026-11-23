import "server-only";

import { prisma } from "@/lib/db";

type NotifyInput = {
  userId: string;
  type: "VERIFY" | "LEADER" | "POST" | "COMMENT" | "MENTION" | "ACTIVITY" | "MESSAGE" | "FOLLOW" | "SYSTEM";
  title: string;
  body?: string;
  link?: string;
};

export async function notify(input: NotifyInput) {
  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
    },
  });
}

export async function notifyAdmins(input: Omit<NotifyInput, "userId">) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  if (!admins.length) return;
  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
    })),
  });
}
