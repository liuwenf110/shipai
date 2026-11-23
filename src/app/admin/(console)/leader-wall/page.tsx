import { prisma } from "@/lib/db";
import { PUBLIC_USER } from "@/lib/api";
import { loadFactionActivity, rankFactions } from "@/lib/activity";
import { SITE_FLAGS, getHiddenLeaderWallFactionIds, getSiteFlag } from "@/lib/settings";
import { saveLeaderWallEntryAction, setSiteFlagAction } from "@/lib/actions/admin";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/Section";
import { QueryNotice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "派主墙管理" };

/**
 * 派主墙后台：整栏开关 + 逐条编辑上墙内容（照片、昵称、简介、宣传语、展示位置）。
 * 这里改的昵称/简介写回 User，因此用户资料页、个人主页会同步变化——两处同源，不做第二套展示字段。
 */
export default async function AdminLeaderWallPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const query = await searchParams;

  const [candidates, activity, leaderWallOn, hiddenIds] = await Promise.all([
    prisma.faction.findMany({
      where: { status: "ACTIVE", leaderId: { not: null } },
      include: { leader: { select: PUBLIC_USER }, company: { select: { shortName: true } } },
    }),
    loadFactionActivity(),
    getSiteFlag(SITE_FLAGS.LEADER_WALL),
    getHiddenLeaderWallFactionIds(),
  ]);

  // 与发现页同一排序口径（展示位置权重 → 成员数 → 动态数…），运营看到的序号就是前台的序号
  const ordered = rankFactions(candidates, activity);
  const wallIndex = new Map(
    ordered.filter((faction) => !hiddenIds.has(faction.id)).map((faction, i) => [faction.id, i + 1]),
  );

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-bold tracking-[0.22em] text-brand">LEADER WALL</p>
        <h1 className="mt-1 text-[22px] font-black tracking-tight">派主墙</h1>
        <p className="mt-1 text-[12px] text-ink-mute">
          发现页「热门活动」与派列表之间那一栏：每个在营且有派主的派出一张卡，展示派主照片、昵称、简介与派宣传语
        </p>
        <p className="mt-1 text-[11.5px] text-ink-mute">
          在此改的昵称与简介会同步写入该派主的个人资料（与用户自己改资料同一份数据），保存前同样过内容安全检测
        </p>
      </div>

      <QueryNotice ok={query.ok} error={query.error} />

      <section className="card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold text-ink">整栏开关</h2>
          <Badge tone={leaderWallOn ? "ok" : "mute"}>{leaderWallOn ? "展示中" : "已隐藏"}</Badge>
        </div>
        <form action={setSiteFlagAction} className="mt-2.5 flex flex-wrap items-center gap-2">
          <input type="hidden" name="key" value={SITE_FLAGS.LEADER_WALL} />
          <input type="hidden" name="returnTo" value="wall" />
          <input type="hidden" name="value" value={leaderWallOn ? "0" : "1"} />
          <span className="mr-auto text-[11.5px] text-ink-mute">
            关掉后发现页整栏不显示；只想藏某几个派，用下面每条的「暂不上墙」
          </span>
          <SubmitButton
            className={leaderWallOn ? "btn-quiet btn-sm" : "btn-primary btn-sm"}
            pendingText="提交中…"
          >
            {leaderWallOn ? "关闭整栏" : "开启整栏"}
          </SubmitButton>
        </form>
      </section>

      {ordered.length ? (
        ordered.map((faction) => {
          const leader = faction.leader!;
          const hidden = hiddenIds.has(faction.id);
          const place = wallIndex.get(faction.id);

          return (
            <section key={faction.id} className="card p-4">
              <div className="flex items-center gap-3">
                <Avatar
                  name={leader.nickname}
                  color={leader.avatarColor}
                  src={leader.avatarImage}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-black text-ink">
                    {faction.emoji} {faction.name}
                    <span className="ml-1 font-medium text-[10.5px] text-ink-mute">
                      /{faction.slug}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate text-[10.5px] text-ink-mute">
                    {faction.company.shortName} · {faction.memberCount} 人 ·{" "}
                    {place ? `前台第 ${place} 位` : "未上墙"}
                  </p>
                </div>
                <Badge tone={hidden ? "mute" : "ok"}>{hidden ? "暂不上墙" : "上墙中"}</Badge>
              </div>

              <form
                action={saveLeaderWallEntryAction}
                className="mt-3 grid gap-2.5 border-t border-ink-line/60 pt-3 md:grid-cols-2"
              >
                <input type="hidden" name="factionId" value={faction.id} />

                <label className="block md:col-span-2">
                  <span className="text-[10.5px] font-bold text-ink-mute">
                    派主照片（JPG / PNG / WEBP，3MB 内；不选文件则保留当前照片）
                  </span>
                  <input
                    type="file"
                    name="image"
                    accept="image/jpeg,image/png,image/webp"
                    className="input mt-1 py-1.5 text-[12px]"
                  />
                </label>

                <label className="block">
                  <span className="text-[10.5px] font-bold text-ink-mute">派主昵称</span>
                  <input
                    name="nickname"
                    defaultValue={leader.nickname}
                    maxLength={32}
                    className="input mt-1 py-2 text-[12px]"
                  />
                </label>

                <label className="block">
                  <span className="text-[10.5px] font-bold text-ink-mute">
                    派主简介（卡片中间那行，建议 15~25 字口语）
                  </span>
                  <input
                    name="bio"
                    defaultValue={leader.bio ?? ""}
                    maxLength={60}
                    placeholder="还没写简介"
                    className="input mt-1 py-2 text-[12px]"
                  />
                </label>

                <label className="block">
                  <span className="text-[10.5px] font-bold text-ink-mute">
                    派宣传语（卡片底部那行，最多 40 字）
                  </span>
                  <input
                    name="tagline"
                    defaultValue={faction.tagline}
                    maxLength={40}
                    className="input mt-1 py-2 text-[12px]"
                  />
                </label>

                <label className="block">
                  <span className="text-[10.5px] font-bold text-ink-mute">
                    展示位置（0 表示不干预，按成员数与动态数自动排）
                  </span>
                  <input
                    type="number"
                    name="sortOrder"
                    defaultValue={faction.sortOrder}
                    min={0}
                    max={9999}
                    step={1}
                    className="input mt-1 py-2 text-[12px] md:max-w-[220px]"
                  />
                </label>

                <label className="flex items-center gap-2 text-[11.5px] font-semibold text-ink-soft md:col-span-2">
                  <input
                    type="checkbox"
                    name="hidden"
                    value="1"
                    defaultChecked={hidden}
                    className="h-4 w-4 rounded border-ink-line"
                  />
                  本派暂不上派主墙（照片与简介仍照常保存）
                </label>

                <div className="md:col-span-2">
                  <SubmitButton className="btn-primary btn-sm" pendingText="保存中…">
                    保存这一条
                  </SubmitButton>
                </div>
              </form>

              {/* 移除照片单独一张表单：不连带提交上面的文本字段，避免误改昵称简介 */}
              {leader.avatarImage ? (
                <form action={saveLeaderWallEntryAction} className="mt-2">
                  <input type="hidden" name="factionId" value={faction.id} />
                  <input type="hidden" name="action" value="removePhoto" />
                  <SubmitButton className="btn-quiet btn-sm" pendingText="提交中…">
                    移除派主照片
                  </SubmitButton>
                </form>
              ) : null}
            </section>
          );
        })
      ) : (
        <EmptyState title="暂无可编辑的派主条目" desc="只有已指派派主的运营中派才会出现在这里" />
      )}
    </div>
  );
}
