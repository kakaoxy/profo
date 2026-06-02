"use client";

import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";
import { SoldProjectCard } from "@/components/c/project/SoldProjectCard";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/c/shared/EmptyState";
import { ErrorState } from "@/components/c/shared/ErrorState";
import { publicFetcher } from "@/lib/swr";
import type { components } from "@/lib/api-types";

type SoldListResponse = components["schemas"]["PublicSoldProjectListResponse"];
type PlatformStats = components["schemas"]["PublicPlatformStats"];

export default function ContactPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const handleSearchChange = useDebouncedCallback((value: string) => {
    setDebouncedSearch(value);
  }, 300);

  const soldUrl = debouncedSearch
    ? `/api/v1/public/projects/sold?community_name=${encodeURIComponent(debouncedSearch)}`
    : "/api/v1/public/projects/sold";

  const { data: soldData, isLoading: soldLoading, error: soldError, mutate: mutateSold } = useSWR<SoldListResponse>(
    soldUrl,
    publicFetcher
  );

  const { data: statsData, isLoading: statsLoading } = useSWR<PlatformStats>(
    "/api/v1/public/stats/platform",
    publicFetcher
  );

  return (
    <div>
      <section className="relative overflow-hidden bg-c-trust-blue px-6 py-12">
        <svg
          className="pointer-events-none absolute -right-10 -top-10 opacity-10"
          width="200"
          height="200"
          viewBox="0 0 200 200"
        >
          <circle cx="100" cy="100" r="100" fill="#D4AF37" />
        </svg>
        <svg
          className="pointer-events-none absolute -bottom-16 -left-16 opacity-10"
          width="250"
          height="250"
          viewBox="0 0 250 250"
        >
          <circle cx="125" cy="125" r="125" fill="#D4AF37" />
        </svg>

        <div className="relative z-10">
          <span className="inline-block rounded-full bg-c-action-gold px-3 py-1 text-xs font-bold text-c-trust-blue">
            真实数据
          </span>
          <h2 className="mt-4 whitespace-pre-line text-3xl font-bold leading-snug text-white">
            {"看看房子\n值多少钱"}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            真实成交案例，数据会说话。看看同小区、同户型的市场动态数据充分定价。
          </p>
        </div>
      </section>

      <section className="bg-c-surface px-4 py-8">
        <div className="mb-5 flex items-center gap-2">
          <div className="h-5 w-1 rounded-full bg-c-action-gold" />
          <span className="text-sm font-bold text-c-text-primary">近期成交</span>
        </div>

        <div className="relative mb-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-c-text-secondary" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              handleSearchChange(e.target.value);
            }}
            placeholder="搜索小区名..."
            className="h-10 w-full rounded-lg border border-c-border-subtle bg-white pl-9 pr-3 text-sm text-c-text-primary placeholder:text-c-text-secondary"
          />
        </div>

        {soldLoading ? (
          <div className="grid grid-cols-1 gap-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-c-border-subtle bg-white p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-5 w-10 rounded-full" />
                    <Skeleton className="h-6 w-32" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
                <Skeleton className="mt-2 h-4 w-48" />
                <div className="mt-4 border-t border-c-border-subtle pt-4">
                  <Skeleton className="h-5 w-28" />
                </div>
              </div>
            ))}
          </div>
        ) : soldError ? (
          <ErrorState onRetry={() => mutateSold()} />
        ) : !soldData?.items.length ? (
          <EmptyState
            title="暂无成交案例"
            description="近期暂无成交记录"
          />
        ) : (
          <div className="grid grid-cols-1 gap-5">
            {soldData.items.map((project) => (
              <SoldProjectCard
                key={project.id}
                id={project.id}
                communityName={project.community_name ?? null}
                layout={project.layout}
                area={project.area}
                totalPrice={project.total_price}
                unitPrice={project.unit_price}
                title={project.title}
                coverImage={project.cover_image ?? null}
                soldDays={project.sold_days ?? null}
                decorationStyle={project.decoration_style ?? null}
              />
            ))}
          </div>
        )}
      </section>

      <section className="border-t border-c-border-subtle bg-white px-4 py-10">
        <div className="mb-6 text-center">
          <span className="inline-block rounded-full bg-c-action-gold/10 px-3 py-1 text-xs font-bold text-c-action-gold">
            平台实力
          </span>
          <h3 className="mt-3 text-2xl font-bold text-c-text-primary">
            用数据说话
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col items-center justify-center rounded-2xl bg-linear-to-br from-c-trust-blue to-slate-800 px-4 py-6">
            <span className="text-3xl font-bold text-white">400+</span>
            <span className="mt-1 text-xs font-bold uppercase tracking-wider text-white/70">
              业主共同选择
            </span>
          </div>
          <div className="flex flex-col items-center justify-center rounded-2xl bg-linear-to-br from-c-status-onsale to-sky-600 px-4 py-6">
            {statsLoading ? (
              <Skeleton className="h-9 w-14" />
            ) : (
              <span className="text-3xl font-bold text-white">
                {statsData?.on_sale_count ?? 0}
              </span>
            )}
            <span className="mt-1 text-xs font-bold uppercase tracking-wider text-white/70">
              在售套数
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-c-action-gold/30 bg-c-action-gold/20 px-4 py-6">
          {statsLoading ? (
            <Skeleton className="h-9 w-14" />
          ) : (
            <span className="text-3xl font-bold text-c-trust-blue">
              {statsData?.current_month_sold ?? 0}
            </span>
          )}
          <span className="mt-1 text-xs font-bold uppercase tracking-wider text-c-text-secondary">
            本月已成交
          </span>
        </div>
      </section>

      <section className="relative overflow-hidden bg-c-trust-blue px-6 py-12">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, rgba(212,175,55,0.15) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 text-center">
          <span className="inline-block rounded-full bg-c-action-gold px-3 py-1 text-xs font-bold text-c-trust-blue">
            立即行动
          </span>
          <h3 className="mt-4 text-2xl font-bold text-white">你家能卖多少？</h3>
          <p className="mt-2 text-sm text-white/70">
            输入房源信息，获取同户型成交参考
          </p>
          <Link
            href="/c/about"
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            了解服务详情
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <div className="fixed bottom-20 inset-x-0 z-40 border-t border-c-border-subtle bg-white/95 px-4 py-3 backdrop-blur md:bottom-0">
        <Link
          href="/c/valuation"
          className="flex w-full items-center justify-center rounded-xl py-4 text-base font-bold text-c-trust-blue shadow-[0_12px_40px_rgba(212,175,55,0.3)] transition-all active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #D4AF37, #F4D03F, #D4AF37)" }}
        >
          免费获取估价
        </Link>
      </div>
    </div>
  );
}
