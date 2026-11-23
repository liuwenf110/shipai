import Link from "next/link";
import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/Badge";
import { CompanyBadge } from "@/components/CompanyBadge";
import { Icon } from "@/components/Icon";
import { SubmitButton } from "@/components/SubmitButton";
import { FactionShareButton } from "@/components/faction/FactionShareButton";
import { signupActivityAction } from "@/lib/actions/faction";
import { withBasePath } from "@/lib/base-path";
import { richTextToPlainText } from "@/lib/rich-text";
import type { UserIdentity } from "@/lib/identity";
import { capacityLabel, cn, formatActivityTime, splitList } from "@/lib/utils";

// 活动动态卡：派详情「活动」tab 与「动态」tab 共用同一张卡，避免样式分叉。
// 报名/管理表单依赖服务端 action，故此组件保持为 Server Component（勿加 use client）。
export type ActivityFeedRow = {
  id: string;
  title: string;
  description: string;
  location: string;
  images: string | null;
  startAt: Date;
  capacity: number;
  signupCount: number;
  status: string;
  /** 派主/副派主可置顶：置顶活动在本派动态流与活动列表排最前 */
  pinned: boolean;
  creatorId: string;
  creator: { id: string; nickname: string; identity: UserIdentity | null };
  signups: { id: string; user: { id: string; nickname: string; avatarColor: string } }[];
};

export function ActivityFeedCard({
  activity,
  slug,
  isMember,
  isManager,
  currentUserId,
  going,
  path,
  signedIn = false,
  isVerified = false,
  redirectTo,
  factionTag,
  compact = false,
  share,
}: {
  activity: ActivityFeedRow;
  slug: string;
  isMember: boolean;
  isManager: boolean;
  currentUserId?: string | null;
  going: boolean;
  path: string;
  /** 当前用户是否已登录（游客/已登录决定按钮文案与 href）；默认 false 保持游客逻辑 */
  signedIn?: boolean;
  /** 当前用户是否已完成公司身份认证：已认证即可参加（无需入派）；未认证引导先去认证 */
  isVerified?: boolean;
  /** 列表内一键报名后的回跳路径（如 /discover）；不传则服务端默认回本派活动 tab */
  redirectTo?: string;
  /** 跨派展示场景（如发现页热门活动）附加所属派标签，from/to 为派别渐变，用于无封面时的图块占位 */
  factionTag?: { emoji: string; name: string; from?: string; to?: string };
  /** 精简模式：只留标题/时间地点/人数与操作，简介、封面、报名头像全部收起 */
  compact?: boolean;
  /** 传入则在卡底渲染分享按钮（由调用方按权限控制是否传） */
  share?: { slogan: string; path: string } | null;
}) {
  const cancelled = activity.status === "CANCELLED";
  const ended = new Date(activity.startAt).getTime() < Date.now();
  const closed = activity.status !== "OPEN" || ended;
  const canManage = isManager || Boolean(currentUserId && activity.creatorId === currentUserId);
  const isCreator = Boolean(currentUserId && activity.creatorId === currentUserId);
  const detailHref = `/factions/${slug}/activities/${activity.id}`;
  const cover = withBasePath(splitList(activity.images)[0] ?? "");

  return (
    <div
      className={cn(
        // 精简卡整卡可点（下面有覆盖层链接），所以卡片本身要是定位容器
        "card",
        compact ? "relative p-3.5 transition-shadow hover:shadow-float" : "p-4",
      )}
    >
      {compact ? (
        // 整卡即入口：空白处、标题、图块都点得进详情；派标签与底部按钮各自抬到 z-10 保持可点
        <Link
          href={detailHref}
          aria-label={`查看「${activity.title}」详情`}
          className="absolute inset-0 z-0 rounded-2xl"
        />
      ) : null}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex shrink-0 flex-col items-center justify-center rounded-xl bg-brand-soft text-brand-dark",
            compact ? "h-10 w-10" : "h-12 w-12",
          )}
        >
          <span className="text-[15px] font-black leading-none">
            {new Date(activity.startAt).getDate()}
          </span>
          <span className="mt-0.5 text-[9px] font-bold">
            {new Date(activity.startAt).getMonth() + 1}月
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={detailHref}
              className="text-[14px] font-bold tracking-tight text-ink hover:text-brand"
            >
              {activity.title}
            </Link>
            {activity.pinned ? <Badge tone="brand">置顶</Badge> : null}
            {factionTag ? (
              <Link
                href={`/factions/${slug}`}
                className="relative z-10 flex items-center gap-0.5 rounded bg-cream-sunk px-1.5 py-0.5 text-[10px] font-bold text-ink-soft hover:text-brand"
              >
                {factionTag.emoji} {factionTag.name}
              </Link>
            ) : null}
            {cancelled ? (
              <Badge tone="mute">已取消</Badge>
            ) : ended ? (
              <Badge tone="mute">已结束</Badge>
            ) : closed ? (
              <Badge tone="mute">已停止报名</Badge>
            ) : null}
            {going ? <Badge tone="ok">已报名</Badge> : null}
            {isCreator ? <Badge tone="ocean">我发起</Badge> : null}
            {compact ? (
              // 向右箭头把「整卡可点」这件事说清楚，不再只靠标题那一行字
              <Icon name="right" size={13} className="ml-auto shrink-0 text-ink-mute" />
            ) : null}
          </div>
          {compact ? (
            // 精简卡：时间与地点固定一行，过长截断，保证五张卡等高不参差
            <p className="mt-1 flex items-center gap-1 text-[11.5px] font-medium text-ink-soft">
              <span className="shrink-0">{formatActivityTime(activity.startAt)}</span>
              <span className="shrink-0 text-ink-line">·</span>
              <Icon name="map" size={12} className="shrink-0" />
              <span className="min-w-0 truncate">{activity.location}</span>
            </p>
          ) : (
            <>
              <p className="mt-0.5 text-[11.5px] font-medium text-ink-soft">
                {formatActivityTime(activity.startAt)}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-ink-mute">
                <Icon name="map" size={12} /> {activity.location}
                <span className="text-ink-line">·</span>
                发起人 {activity.creator.nickname}
                <CompanyBadge
                  identity={activity.creator.identity}
                  showKind={false}
                  showUnverified
                />
              </p>
            </>
          )}
          {!compact && activity.description ? (
            <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-ink-soft">
              {richTextToPlainText(activity.description)}
            </p>
          ) : null}
          {compact && activity.description ? (
            // 精简卡也留一句简介作钩子，只占一行，多了不如让人点进去看
            <p className="mt-1 truncate text-[11.5px] leading-relaxed text-ink-mute">
              {richTextToPlainText(activity.description)}
            </p>
          ) : null}
          {!compact && cover ? (
            // 列表缩略图：取首图，点击进入详情看大图；渲染前补部署前缀，否则生产子路径下破图
            <Link href={detailHref} className="mt-2 block overflow-hidden rounded-xl">
              <img
                src={cover}
                alt={activity.title}
                className="h-36 w-full object-cover"
              />
            </Link>
          ) : null}
        </div>
        {compact ? (
          // 精简卡的视觉锚点：有首图用首图，没图用派别渐变 + 派 emoji，避免整排白底太平
          cover ? (
            <img
              src={cover}
              alt={activity.title}
              className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-ink-line/70"
            />
          ) : factionTag ? (
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-[22px] leading-none ring-1 ring-white/60"
              style={{
                backgroundImage: `linear-gradient(135deg, ${factionTag.from ?? "#FFEDE4"}, ${factionTag.to ?? "#FF5A1F"})`,
              }}
            >
              {factionTag.emoji}
            </span>
          ) : null
        ) : null}
      </div>

      <div
        className={cn(
          // 允许换行：窄屏下「人数 + 分享 + 报名按钮」不致于撑破卡片；z-10 保证按钮不被整卡链接盖住
          "relative z-10 flex flex-wrap items-center justify-between gap-y-1.5 border-t border-ink-line/60",
          compact ? "mt-2.5 pt-2" : "mt-3 pt-2.5",
        )}
      >
        <div className="flex items-center gap-1.5">
          {/* 精简卡也保留头像堆叠：老同事已经在报名了，比任何文案都拉点击 */}
          <div className="flex -space-x-1.5">
            {activity.signups.slice(0, compact ? 3 : 4).map((signup) => (
              <UserAvatar
                key={signup.id}
                id={signup.user.id}
                name={signup.user.nickname}
                color={signup.user.avatarColor}
                size="xs"
                ring
              />
            ))}
          </div>
          <span className="text-[10.5px] text-ink-mute">
            {capacityLabel(activity.signupCount, activity.capacity)} 人已报名
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {share ? (
            <FactionShareButton
              slogan={share.slogan}
              scope="activity"
              path={share.path}
              image={cover || undefined}
            />
          ) : null}
          {/* 详情/管理入口：管理者给「管理」，其余非精简卡给「详情」（精简卡整卡已链到详情） */}
          {canManage ? (
            <Link href={detailHref} className="btn-quiet btn-sm">
              管理
            </Link>
          ) : !compact ? (
            <Link href={detailHref} className="btn-ghost btn-sm">
              详情
            </Link>
          ) : null}
          {cancelled ? null : signedIn && isVerified ? (
            // 已认证用户（含未入派）可直接一键参加
            <form action={signupActivityAction}>
              <input type="hidden" name="activityId" value={activity.id} />
              <input type="hidden" name="slug" value={slug} />
              {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
              <SubmitButton
                className={cn("btn-sm", going ? "btn-ghost" : "btn-primary")}
                disabled={closed}
                pendingText="处理中…"
              >
                {ended
                  ? "已结束"
                  : closed
                    ? "报名已截止"
                    : going
                      ? compact
                        ? "已参加"
                        : "取消报名"
                      : compact
                        ? "参加"
                        : "我要报名"}
              </SubmitButton>
            </form>
          ) : signedIn ? (
            // 已登录但未认证：先去完成公司身份认证
            <Link href="/verify" className="btn-ghost btn-sm">
              {compact ? "认证后参加" : "完成认证后可参加"}
            </Link>
          ) : (
            // 游客登录后回到这场活动本身，而不是列表页
            <Link
              href={`/login?next=${encodeURIComponent(detailHref)}`}
              className="btn-ghost btn-sm"
            >
              登录后参加
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
