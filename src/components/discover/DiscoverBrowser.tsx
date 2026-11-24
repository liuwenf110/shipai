"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FactionCard } from "@/components/FactionCard";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/Section";
import { withBasePath } from "@/lib/base-path";
import { apiGet, buildQuery } from "@/lib/client";
import { CATEGORY_LIST, categoryOf } from "@/lib/constants";
import { reviveFaction, type FactionJson } from "@/lib/revive";
import { cn } from "@/lib/utils";

type CompanyBrief = {
  id: string;
  shortName: string;
  color: string;
  logoText: string;
};

/** 发现页：筛选与列表均通过 /api/v1/factions 读取真实数据 */
const VISIBLE_COUNT = 10; // 首屏只展示 10 个派，其余折叠在“更多”后
export function DiscoverBrowser({
  initialFactions,
  initialTotal,
  companies,
  verifiedCompanyIds,
  initial,
  isVerified,
  pageSize = 24,
}: {
  initialFactions: FactionJson[];
  initialTotal: number;
  companies: CompanyBrief[];
  verifiedCompanyIds: string[];
  initial: { category?: string; company?: string; q?: string };
  isVerified: boolean;
  pageSize?: number;
}) {
  const [category, setCategory] = useState(initial.category);
  const [company, setCompany] = useState(initial.company);
  const [keyword, setKeyword] = useState(initial.q ?? "");
  const [input, setInput] = useState(initial.q ?? "");
  const [factions, setFactions] = useState<FactionJson[]>(initialFactions);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const requestId = useRef(0);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    const current = ++requestId.current;
    setLoading(true);
    setError("");
    setExpanded(false); // 筛选/搜索变化后回到只展示 10 个

    apiGet<unknown[]>(
      `/api/v1/factions${buildQuery({
        category,
        company,
        q: keyword || undefined,
        page: 1,
        pageSize,
      })}`,
    )
      .then((response) => {
        if (current !== requestId.current) return;
        setFactions(response.data.map(reviveFaction));
        setTotal(response.meta?.total ?? response.data.length);
      })
      .catch((caught: unknown) => {
        if (current !== requestId.current) return;
        setError(caught instanceof Error ? caught.message : "加载失败，请重试");
      })
      .finally(() => {
        if (current !== requestId.current) return;
        setLoading(false);
      });
  }, [category, company, keyword, pageSize]);

  /** 同步筛选条件到地址栏，刷新后仍可还原 */
  const syncUrl = useCallback(
    (next: { category?: string; company?: string; q?: string }) => {
      const search = buildQuery({
        category: next.category,
        company: next.company,
        q: next.q,
      });
      window.history.replaceState(null, "", withBasePath(`/discover${search}`));
    },
    [],
  );

  const changeCategory = (key?: string) => {
    setCategory(key);
    syncUrl({ category: key, company, q: keyword || undefined });
  };

  const changeCompany = (id?: string) => {
    setCompany(id);
    syncUrl({ category, company: id, q: keyword || undefined });
  };

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = input.trim();
    setKeyword(next);
    syncUrl({ category, company, q: next || undefined });
  };

  return (
    <div id="faction-browser" className="mx-auto max-w-5xl px-4 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.22em] text-brand">DISCOVER</p>
          <h1 className="mt-1 text-[24px] font-black tracking-tight">发现兴趣派</h1>
          <p className="mt-1 text-[12.5px] text-ink-mute">
            {isVerified
              ? "可加入已认证公司的派，也可申请加入开放跨公司的兴趣派（需派主审批）"
              : "先完成公司身份认证，加入后即可在派内发帖、报名活动"}
          </p>
        </div>
        <Link href="/factions/new" className="btn-primary btn-sm">
          <Icon name="plus" size={14} />
          组建新派
        </Link>
      </div>

      <form onSubmit={submitSearch} className="mt-4 flex items-center gap-2">
        {category ? <input type="hidden" name="category" value={category} /> : null}
        {company ? <input type="hidden" name="company" value={company} /> : null}
        <div className="relative flex-1">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-mute"
          />
          <input
            name="q"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="搜派名、关键词，比如：徒步、露营、狼人杀"
            className="input pl-9"
          />
        </div>
        <button type="submit" className="btn-ghost px-3.5">
          搜索
        </button>
      </form>

      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <button
          type="button"
          onClick={() => changeCategory(undefined)}
          className={cn(
            "tab-pill ring-1",
            !category ? "bg-ink text-white ring-ink" : "bg-white ring-ink-line",
          )}
        >
          全部
        </button>
        {CATEGORY_LIST.map((meta) => (
          <button
            type="button"
            key={meta.key}
            onClick={() => changeCategory(meta.key)}
            className={cn(
              "tab-pill ring-1",
              category === meta.key
                ? "bg-ink text-white ring-ink"
                : "bg-white ring-ink-line",
            )}
          >
            <span className="mr-1">{meta.emoji}</span>
            {meta.label}
          </button>
        ))}
      </div>

      <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1">
        <button
          type="button"
          onClick={() => changeCompany(undefined)}
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            !company ? "bg-ink text-white" : "bg-cream-sunk text-ink-soft",
          )}
        >
          全部公司
        </button>
        {companies.map((item) => {
          const verified = verifiedCompanyIds.includes(item.id);
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => changeCompany(item.id)}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                company === item.id
                  ? "bg-ink text-white"
                  : verified
                    ? "bg-brand-soft text-brand-dark"
                    : "bg-cream-sunk text-ink-soft",
              )}
            >
              <span
                className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] text-[6px] font-black text-white"
                style={{ background: item.color }}
              >
                {item.logoText}
              </span>
              {item.shortName}
              {verified ? <span className="text-[9px]">✓</span> : null}
            </button>
          );
        })}
      </div>

      {category ? (
        <div className="mt-4 rounded-2xl bg-white p-3.5 ring-1 ring-ink-line/70">
          <div className="flex items-center gap-2">
            <span className="text-[22px]">{categoryOf(category).emoji}</span>
            <div>
              <p className="text-[13px] font-bold text-ink">{categoryOf(category).label}</p>
              <p className="text-[11px] text-ink-mute">{categoryOf(category).desc}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between">
        <p className="text-[12px] text-ink-mute">
          {loading ? (
            "正在通过接口加载…"
          ) : (
            <>
              共 <span className="font-bold text-ink">{total}</span> 个派
              {keyword ? ` · 关键词「${keyword}」` : ""}
            </>
          )}
        </p>
        {error ? <span className="text-[11px] font-medium text-[#B42318]">{error}</span> : null}
      </div>

      {loading && !factions.length ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="card h-[168px] animate-pulse bg-white/60" />
          ))}
        </div>
      ) : factions.length ? (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(expanded ? factions : factions.slice(0, VISIBLE_COUNT)).map((faction) => (
              <FactionCard
                key={faction.id}
                faction={faction}
                joined={faction.membershipStatus === "ACTIVE"}
                showStats={false}
              />
            ))}
          </div>
          {factions.length > VISIBLE_COUNT ? (
            <div className="mt-4 flex justify-center">
              <button type="button" onClick={() => setExpanded((v) => !v)} className="btn-ghost px-4">
                {expanded ? (
                  "收起"
                ) : (
                  <>
                    查看更多
                    <span className="ml-1 text-ink-mute">（还有 {factions.length - VISIBLE_COUNT} 个）</span>
                  </>
                )}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="card mt-3">
          <EmptyState
            icon="compass"
            title="没有找到匹配的派"
            desc="换个关键词，或者自己开一个派，把同好聚起来"
            actionLabel="组建新派"
            actionHref="/factions/new"
          />
        </div>
      )}
    </div>
  );
}
