"use client";

import useSWR from "swr";
import Link from "next/link";
import { CheckCircle, ArrowRight } from "lucide-react";
import { cLocale } from "@/lib/i18n/c-locale";

interface SoldProject {
  id: number;
  community_name: string | null;
  layout: string;
  area: number;
  total_price: number;
}

interface SoldListResponse {
  items: SoldProject[];
  total: number;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Failed to fetch");
    return r.json();
  });

export function ValuationSidebar() {
  const { data: soldData } = useSWR<SoldListResponse>(
    "/api/v1/public/projects/sold?pageSize=2",
    fetcher
  );

  return (
    <div className="space-y-6">
      {/* 品牌记忆锚点（审批意见补充建议第2条） */}
      <div className="rounded-cards bg-apricot-wash p-6 shadow-steep-sm">
        <p className="text-sm leading-relaxed text-ink tracking-[-0.009em]">
          {cLocale.about.oneLiner}
        </p>
      </div>

      <div className="rounded-cards bg-white p-6 shadow-steep border border-dove/30">
        <h3 className="text-lg font-medium text-ink mb-4">
          {cLocale.valuation.sidebarTitle}
        </h3>
        <ul className="space-y-3">
          {cLocale.valuation.bullets.map((text) => (
            <li key={text} className="flex items-start gap-3">
              <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-rust" />
              <span className="text-sm text-ink tracking-[-0.009em]">{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-cards bg-white p-6 shadow-steep border border-dove/30">
        <h3 className="text-lg font-medium text-ink mb-4">
          {cLocale.valuation.recentSoldTitle}
        </h3>
        {soldData?.items && soldData.items.length > 0 ? (
          <ul className="space-y-3">
            {soldData.items.map((project) => (
              <li
                key={project.id}
                className="flex items-center justify-between py-2 border-b border-dove/30 last:border-b-0"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {project.community_name ?? cLocale.projects.unknownCommunity}
                  </p>
                  <p className="text-xs text-ash">
                    {project.area}㎡ · {project.layout}
                  </p>
                </div>
                <span className="text-sm font-medium text-rust">
                  {project.total_price}万
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ash">{cLocale.valuation.recentSoldEmpty}</p>
        )}
        <Link
          href="/contact"
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-rust hover:underline"
        >
          {cLocale.valuation.recentSoldMore}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
