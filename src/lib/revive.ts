import type {
  Activity,
  Comment,
  Company,
  Faction,
  Notification,
  Post,
  User,
} from "@prisma/client";
import { pickUserIdentity, type IdentityEmployment, type UserIdentity } from "@/lib/identity";

/** 接口返回的 JSON 会把 Date 序列化成字符串，这里统一还原成 Date 供组件复用 */

/** 接口只返回公开用户字段（见 lib/api.ts 的 PUBLIC_USER），不含邮箱与密码 */
export type PublicUser = Pick<
  User,
  "id" | "nickname" | "avatarColor" | "avatarImage" | "bio" | "role"
>;

/** 评论/活动作者附带展示用认证身份（公司 + 在职/离职），由服务端挑选后注入 */
export type IdentifiedAuthor = PublicUser & { identity?: UserIdentity | null };

export type FactionJson = Faction & {
  company: Company;
  leader: PublicUser | null;
  membershipStatus?: string | null;
};

export type PostJson = Post & {
  author: IdentifiedAuthor;
  faction: Faction & { company: Company };
  liked?: boolean;
};

export type CommentJson = Comment & {
  author: IdentifiedAuthor;
  mentions: { userId: string; nickname?: string }[];
};

/** Prisma 关联读出来是 { userId, user: { nickname } }，拉平成客户端直接可用的 { userId, nickname } */
function normalizeMentions(
  mentions?: { userId: string; nickname?: string; user?: { nickname: string } | null }[],
): { userId: string; nickname?: string }[] {
  return (mentions ?? []).map((item) => ({
    userId: item.userId,
    nickname: item.nickname ?? item.user?.nickname,
  }));
}

export type ActivityJson = Activity;

export type NotificationJson = Notification;

function reviveDates<T extends Record<string, unknown>>(raw: unknown, keys: string[]): T {
  const source = { ...(raw as T) };
  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key];
    if (typeof value === "string") {
      (source as Record<string, unknown>)[key] = new Date(value);
    }
  }
  return source;
}

export function reviveFaction(raw: unknown): FactionJson {
  const faction = reviveDates<FactionJson>(raw, ["createdAt"]);
  return faction;
}

export function revivePost(raw: unknown): PostJson {
  return reviveDates<PostJson>(raw, ["createdAt", "updatedAt"]);
}

export function reviveComment(raw: unknown): CommentJson {
  return reviveDates<CommentJson>(raw, ["createdAt"]);
}

/**
 * 把带 employments 的评论转成对外形状：
 * 按派所属公司挑选一条认证身份，并剔除 employments 原数组避免传给客户端。
 */
export function withCommentIdentity(
  comment: Comment &
    { author: PublicUser & { employments: IdentityEmployment[] } } & {
      mentions?: { userId: string; nickname?: string; user?: { nickname: string } | null }[];
    },
  factionCompanyId?: string | null,
  /** 刚写入的 @ 关系（create 的 include 拿不到随后 createMany 的行），由调用方补齐 */
  mentions?: { userId: string; nickname?: string }[],
): CommentJson {
  const { employments, ...author } = comment.author;
  return {
    ...comment,
    mentions: mentions ?? normalizeMentions(comment.mentions),
    author: { ...author, identity: pickUserIdentity(employments, factionCompanyId) },
  };
}

/**
 * 把带 employments 的帖子转成对外形状：
 * 按帖子所属派的公司挑选一条认证身份，并剔除 employments 原数组避免传给客户端。
 */
export function withPostIdentity<
  P extends { author: PublicUser & { employments: IdentityEmployment[] } },
>(post: P, factionCompanyId?: string | null): Omit<P, "author"> & { author: IdentifiedAuthor } {
  const { employments, ...author } = post.author;
  return {
    ...post,
    author: { ...author, identity: pickUserIdentity(employments, factionCompanyId) },
  };
}

export function reviveActivity(raw: unknown): ActivityJson {
  return reviveDates<ActivityJson>(raw, ["startAt", "createdAt"]);
}

export function reviveNotification(raw: unknown): NotificationJson {
  return reviveDates<NotificationJson>(raw, ["createdAt", "readAt"]);
}
