"use client";

import type { ReactNode } from "react";
import { MapPin, Pencil } from "lucide-react";
import { differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useCurrentDate } from "@/hooks/use-current-date";

import { Project } from "../../../types";
import {
  RENOVATION_STAGES,
  STAGE_CONFIG,
  type ViewMode,
} from "../../../_components/project-detail/constants";
import { getBusinessFormLabel } from "./config";
import { StageStepper } from "./stage-stepper";

interface HeroSectionProps {
  project: Project;
  /** 项目实际生命周期阶段下标（STAGE_CONFIG 索引） */
  currentProjectStageIndex: number;
  /** 切换阶段视图（沿用 useProjectDetail.handleViewModeChange） */
  onViewModeChange: (mode: ViewMode) => void;
  /** 已售态「修改销售信息」textlink（联动 SoldView 的 EditSalesInfoDialog） */
  onEditSalesInfo?: () => void;
}

interface MetaPart {
  key: string;
  node: ReactNode;
}

/**
 * 状态 pill 浅底深字配色（V4.1 局部映射，勿动共享 status-colors.ts 全局语义）：
 * 签约 apricot/rust · 装修 sky/#2c4d7f · 在售 #e5efe7/#3e6b4f · 已售 ink/白 · 已下架 #ececee/ash
 * （本项目 Tailwind token 中 apricot=#fbe1d1 对应 bg-apricot-wash，sky=#d3e3fc 对应 bg-sky-wash）
 */
const STATUS_PILL_CLASS: Record<string, string> = {
  signing: "bg-apricot-wash text-rust",
  renovation: "bg-sky-wash text-[#2c4d7f]",
  selling: "bg-[#e5efe7] text-[#3e6b4f]",
  sold: "bg-ink text-pure-white",
  ended: "bg-[#ececee] text-ash",
};

/** 状态 pill 文案：「装修阶段 · {子阶段}」等（renovation_stage 兼容中文值/key 两种存储） */
function getStatusPillLabel(project: Project, stageKey: string): string {
  switch (stageKey) {
    case "renovation": {
      const subStage = RENOVATION_STAGES.find(
        (s) => s.value === project.renovation_stage || s.key === project.renovation_stage,
      );
      return subStage ? `装修阶段 · ${subStage.value}` : "装修阶段";
    }
    case "selling":
      return "在售中";
    case "sold":
      return "已售出";
    case "ended":
      return "已下架";
    default:
      return "签约阶段";
  }
}

/** ISO 日期字符串 → Date（非法值返回 null） */
function toDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Meta 行首段：小区（MapPin 承载）· 行政区/商圈，空值跳过 */
function pushBasePart(parts: MetaPart[], project: Project) {
  if (project.community_name) {
    parts.push({
      key: "community",
      node: (
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-graphite" />
          {project.community_name}
        </span>
      ),
    });
  }
  const region = [project.district, project.business_circle].filter(Boolean).join(" ");
  if (region) {
    parts.push({ key: "region", node: <span>{region}</span> });
  }
}

/**
 * Hero Meta 行按阶段分支（V4.1）：
 * - 签约：小区·区/商圈·地址·面积·户型·合同编号
 * - 装修：小区·区/商圈·面积·「第 N 天」（⚠️ 计划工期字段在装修合同上，项目响应未携带，暂不显示）
 * - 在售：小区·区/商圈·面积·户型·「上架 N 天」·「委托剩余 N 天」
 * - 已售：小区·区/商圈·面积·「成交周期 N 天」（优先 days_on_market，否则成交-上架日期差）
 * - 已下架：小区·区/商圈·面积
 */
function buildMetaParts(project: Project, stageKey: string, today: Date | null): MetaPart[] {
  const parts: MetaPart[] = [];

  switch (stageKey) {
    case "renovation": {
      pushBasePart(parts, project);
      if (project.area) parts.push({ key: "area", node: <span>{project.area} ㎡</span> });
      const startDate = toDate(project.renovation_start_date);
      if (startDate && today) {
        const elapsed = differenceInDays(today, startDate) + 1;
        parts.push({ key: "day-n", node: <span>第 {elapsed} 天</span> });
      }
      break;
    }
    case "selling": {
      pushBasePart(parts, project);
      if (project.area) parts.push({ key: "area", node: <span>{project.area} ㎡</span> });
      const listingDate = toDate(project.listing_date);
      if (listingDate && today) {
        const listed = differenceInDays(today, listingDate) + 1;
        parts.push({ key: "listed-n", node: <span>上架 {listed} 天</span> });
      }
      const commissionEnd = toDate(project.commission_end_date);
      if (commissionEnd && today) {
        const left = differenceInDays(commissionEnd, today);
        if (left >= 0) {
          parts.push({ key: "commission-left", node: <span>委托剩余 {left} 天</span> });
        }
      }
      break;
    }
    case "sold": {
      pushBasePart(parts, project);
      if (project.area) parts.push({ key: "area", node: <span>{project.area} ㎡</span> });
      if (project.days_on_market != null) {
        parts.push({
          key: "deal-cycle",
          node: <span>成交周期 {project.days_on_market} 天</span>,
        });
      } else {
        const soldDate = toDate(project.sold_at || project.sold_date);
        const listingDate = toDate(project.listing_date);
        if (soldDate && listingDate) {
          parts.push({
            key: "deal-cycle",
            node: <span>成交周期 {differenceInDays(soldDate, listingDate)} 天</span>,
          });
        }
      }
      break;
    }
    case "ended": {
      pushBasePart(parts, project);
      if (project.area) parts.push({ key: "area", node: <span>{project.area} ㎡</span> });
      break;
    }
    default: {
      // 签约：小区·区/商圈·地址·面积·户型·合同编号（现状）
      pushBasePart(parts, project);
      if (project.address) {
        parts.push({ key: "address", node: <span>{project.address}</span> });
      }
      if (project.area) parts.push({ key: "area", node: <span>{project.area} ㎡</span> });
      if (project.layout) parts.push({ key: "layout", node: <span>{project.layout}</span> });
      if (project.contract_no) {
        parts.push({ key: "contract", node: <span>合同编号 {project.contract_no}</span> });
      }
    }
  }

  return parts;
}

/**
 * Hero 区（V4.1）：Apricot 暖光晕 + 生命周期进度条 + Signifier 项目名（44px / <768px 27px）
 * + 阶段状态 pill + 业务形式 tag + 按阶段 Meta 行。
 * 单屏唯一实心 CTA 收口于底部阶段操作条，Hero 右侧仅已售态渲染「修改销售信息」textlink。
 */
export function HeroSection({
  project,
  currentProjectStageIndex,
  onViewModeChange,
  onEditSalesInfo,
}: HeroSectionProps) {
  const today = useCurrentDate();
  const statusStage =
    STAGE_CONFIG.find((s) => (s.aliases as readonly string[]).includes(project.status)) ??
    STAGE_CONFIG[0];
  const pillClass = STATUS_PILL_CLASS[statusStage.key] ?? STATUS_PILL_CLASS.signing;
  const pillLabel = getStatusPillLabel(project, statusStage.key);
  const businessFormLabel = getBusinessFormLabel(project.business_form);
  const metaParts = buildMetaParts(project, statusStage.key, today);

  return (
    <section className="relative pb-[22px] pt-2">
      {/* Apricot 暖光晕（原型 .hero::before radial 渐变，V4.1） */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-8 -left-20 -right-20 -top-10 z-0 bg-[radial-gradient(42%_62%_at_22%_18%,rgba(251,225,209,0.55)_0%,rgba(251,225,209,0)_68%)]"
      />

      <div className="relative z-[1]">
        <StageStepper
          currentProjectStageIndex={currentProjectStageIndex}
          onViewModeChange={onViewModeChange}
        />

        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3.5">
              {/* 页面唯一衬线标题（Signifier 44px，<768px 降为 27px） */}
              <h1 className="font-signifier text-[27px] font-normal leading-[1.1] tracking-[-0.015em] text-ink md:text-[44px]">
                {project.name}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-[13px] py-[5px] text-[13px] font-[450]",
                  pillClass,
                )}
              >
                {pillLabel}
              </span>
              {businessFormLabel && (
                <span className="inline-flex items-center rounded-full border border-[#e2e2e5] bg-pure-white px-[13px] py-[5px] text-[13px] font-[450] text-graphite">
                  {businessFormLabel}
                </span>
              )}
            </div>

            {metaParts.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-x-[7px] gap-y-1 text-sm font-[430] text-ash">
                {metaParts.map((part, index) => (
                  <span key={part.key} className="inline-flex items-center gap-[7px]">
                    {index > 0 && <span className="text-dove">·</span>}
                    {part.node}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 已售态「修改销售信息」textlink（原型 .textlink，联动 EditSalesInfoDialog） */}
          {onEditSalesInfo && (
            <div className="pb-1.5">
              <button
                type="button"
                onClick={onEditSalesInfo}
                className="inline-flex items-center gap-1.5 bg-none text-[15px] font-[450] text-ink hover:underline hover:underline-offset-4"
              >
                <Pencil className="h-[15px] w-[15px]" />
                修改销售信息
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
