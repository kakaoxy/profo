"use client";

import { useMemo } from "react";
import type { Project } from "../types";
import {
  PROJECT_STAGE_META,
  getProjectStage,
  toAmountWan,
  type ProjectStageKey,
} from "./project-display";

interface ProjectPortfolioProps {
  projects: Project[];
  activeStage: string;
  onStageChange: (stage: ProjectStageKey | "all") => void;
}

function stageAmount(projects: Project[], stage: ProjectStageKey): number {
  return projects.reduce((sum, project) => {
    const status = getProjectStage(project.status);
    if (status !== stage) return sum;
    if (stage === "selling") return sum + toAmountWan(project.list_price);
    if (stage === "sold") return sum + toAmountWan(project.sold_price);
    return sum + toAmountWan(project.signing_price);
  }, 0);
}

function stageDesc(stage: ProjectStageKey, amount: number): string {
  if (stage === "signing") return amount ? `签约额 ${amount.toFixed(0)} 万` : "合同推进中";
  if (stage === "renovating") return amount ? `投入 ${amount.toFixed(0)} 万` : "施工进行中";
  if (stage === "selling") return amount ? `挂牌 ${amount.toFixed(0)} 万` : "等待上架";
  if (stage === "sold") return amount ? `回款 ${amount.toFixed(0)} 万` : "已完成交易";
  return amount ? `签约 ${amount.toFixed(0)} 万` : "归档留存";
}

export function ProjectPortfolio({ projects, activeStage, onStageChange }: ProjectPortfolioProps) {
  const metrics = useMemo(() => {
    const total = projects.length;
    const active = projects.filter(
      (project) => ["signing", "renovating", "selling"].includes(project.status) && !project.is_archived,
    ).length;
    const totalSigning = projects.reduce((sum, project) => sum + toAmountWan(project.signing_price), 0);
    const districts = new Set(projects.map((project) => project.district).filter(Boolean)).size;
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
    const lastMonthSold = projects.filter((project) => project.sold_date?.startsWith(lastMonthKey));
    const lastMonthAmount = lastMonthSold.reduce((sum, project) => sum + toAmountWan(project.sold_price), 0);
    const selling = projects.filter((project) => project.status === "selling" && !project.is_archived);
    const sellingAmount = selling.reduce((sum, project) => sum + toAmountWan(project.list_price), 0);
    const average = total ? totalSigning / total : 0;
    return {
      active,
      total,
      totalSigning,
      districts,
      monthLabel: `${lastMonth.getMonth() + 1} 月`,
      lastMonthCount: lastMonthSold.length,
      lastMonthAmount,
      sellingCount: selling.length,
      sellingAmount,
      average,
    };
  }, [projects]);

  const counts = useMemo(() => {
    return PROJECT_STAGE_META.reduce<Record<string, number>>((acc, stage) => {
      acc[stage.key] = projects.filter((project) => getProjectStage(project.status) === stage.key).length;
      return acc;
    }, {});
  }, [projects]);

  return (
    <section className="rounded-cards bg-white shadow-steep" aria-label="资产组合总览">
      {/* 移动端：三格 KPI（对齐设计稿 Mobile 画板） */}
      <div className="grid grid-cols-3 gap-2 px-4 pb-4 pt-5 md:hidden">
        <div className="rounded-[14px] bg-fog/70 p-3">
          <p className="text-[9.5px] font-[480] text-graphite">在管</p>
          <p className="mt-1 font-signifier text-[24px] leading-none text-ink">{metrics.active}<span className="ml-0.5 font-sans text-[9px] font-[430] text-graphite">套</span></p>
        </div>
        <div className="rounded-[14px] bg-apricot-wash p-3">
          <p className="text-[9.5px] font-[480] text-rust">累计签约</p>
          <p className="mt-1 font-signifier text-[20px] leading-none text-rust">¥{metrics.totalSigning.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}</p>
          <p className="mt-1 text-[9px] text-rust/70">万元</p>
        </div>
        <div className="rounded-[14px] bg-sky-wash p-3">
          <p className="text-[9.5px] font-[480] text-ink">{metrics.monthLabel}回款</p>
          <p className="mt-1 font-signifier text-[20px] leading-none text-ink">¥{metrics.lastMonthAmount.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}</p>
          <p className="mt-1 text-[9px] text-ink/60">万元</p>
        </div>
      </div>
      <div className="hidden gap-8 px-6 pb-6 pt-7 md:grid lg:grid-cols-[minmax(300px,1.05fr)_minmax(480px,1fr)] lg:gap-12 lg:px-8 lg:pb-7 lg:pt-8">
        <div>
          <p className="text-[10px] font-[480] uppercase tracking-[0.16em] text-graphite">
            在管资产 <span className="ml-2 text-rust">· Portfolio</span>
          </p>
          <div className="mt-3 flex items-end gap-3">
            <span className="font-signifier text-[58px] font-[420] leading-[0.9] tracking-[-0.03em] text-ink">
              {metrics.active}
            </span>
            <span className="pb-1 text-[13px] text-graphite">套在管</span>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-graphite">
            累计 {metrics.total} 套项目 · 签约总额 ¥{metrics.totalSigning.toLocaleString("zh-CN", { maximumFractionDigits: 0 })} 万
            {metrics.districts ? ` · 覆盖 ${metrics.districts} 个行政区` : ""}
          </p>
        </div>

        <div className="grid grid-cols-1 divide-y divide-dove/20 border-t border-dove/20 pt-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:border-t-0 sm:pt-0 lg:pl-8">
          <div className="pb-4 sm:pb-0 sm:pr-6">
            <p className="text-[11px] text-graphite">{metrics.monthLabel}成交</p>
            <p className="mt-1.5 font-signifier text-[24px] font-[450] leading-none text-ink">
              {metrics.lastMonthCount} <span className="font-sans text-[11px] text-graphite">套</span>
            </p>
            <p className="mt-1.5 text-[10.5px] text-dove">
              回款 ¥{metrics.lastMonthAmount.toLocaleString("zh-CN", { maximumFractionDigits: 0 })} 万
            </p>
          </div>
          <div className="py-4 sm:px-6 sm:py-0">
            <p className="text-[11px] text-graphite">在售挂牌</p>
            <p className="mt-1.5 font-signifier text-[24px] font-[450] leading-none text-ink">
              ¥{metrics.sellingAmount.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
              <span className="ml-1 font-sans text-[11px] text-graphite">万</span>
            </p>
            <p className="mt-1.5 text-[10.5px] text-dove">{metrics.sellingCount} 套正在销售</p>
          </div>
          <div className="pt-4 sm:pl-6 sm:pt-0">
            <p className="text-[11px] text-graphite">平均单套签约</p>
            <p className="mt-1.5 font-signifier text-[24px] font-[450] leading-none text-ink">
              ¥{metrics.average.toFixed(0)}
              <span className="ml-1 font-sans text-[11px] text-graphite">万</span>
            </p>
            <p className="mt-1.5 text-[10.5px] text-dove">按累计项目计算</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto border-t border-dove/20 px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => onStageChange("all")}
          aria-pressed={activeStage === "all"}
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-[480] transition-colors ${activeStage === "all" ? "border-rust/20 bg-apricot-wash text-rust" : "border-dove/20 bg-pure-white text-graphite"}`}
        >
          全部
          <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${activeStage === "all" ? "bg-pure-white/70 text-rust" : "bg-fog text-dove"}`}>{metrics.total}</span>
        </button>
        {PROJECT_STAGE_META.map((stage) => {
          const selected = activeStage === stage.key;
          const count = counts[stage.key] ?? 0;
          return (
            <button
              key={stage.key}
              type="button"
              onClick={() => onStageChange(selected ? "all" : stage.key)}
              aria-pressed={selected}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-[480] transition-colors ${selected ? "border-rust/20 bg-apricot-wash text-rust" : "border-dove/20 bg-pure-white text-graphite"}`}
            >
              {stage.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${selected ? "bg-pure-white/70 text-rust" : "bg-fog text-dove"}`}>{count}</span>
            </button>
          );
        })}
      </div>
      <div className="hidden grid-cols-2 gap-2 border-t border-dove/20 px-4 pb-4 pt-4 sm:grid-cols-3 md:grid lg:grid-cols-5 lg:px-6">
        {PROJECT_STAGE_META.map((stage) => {
          const selected = activeStage === stage.key;
          const count = counts[stage.key] ?? 0;
          const amount = stageAmount(projects, stage.key);
          return (
            <button
              key={stage.key}
              type="button"
              onClick={() => onStageChange(selected ? "all" : stage.key)}
              aria-pressed={selected}
              className={`relative flex min-h-[104px] flex-col items-start rounded-[16px] px-4 pb-4 pt-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30 ${
                selected ? "bg-apricot-wash" : "bg-fog/70 hover:bg-fog"
              }`}
            >
              <span className={`absolute inset-x-4 top-0 h-[2px] rounded-full ${stage.bar}`} />
              <span className={`mt-1 text-[11px] font-[480] ${selected ? "text-rust" : "text-graphite"}`}>
                {String(PROJECT_STAGE_META.findIndex((item) => item.key === stage.key) + 1).padStart(2, "0")} · {stage.label}
              </span>
              <span className="mt-2 font-signifier text-[27px] font-[450] leading-none text-ink">{count}</span>
              <span className="mt-2 text-[10px] text-graphite">{stageDesc(stage.key, amount)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
