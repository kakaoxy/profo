"use client";

import { logger } from "@/lib/logger";
import { useState, useEffect } from "react";
import { useCurrentDate } from "@/hooks/use-current-date";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Project } from "../../../../types";
import { RENOVATION_STAGES } from "../../constants";
import { differenceInDays, addDays, format, parseISO, isValid } from "date-fns";
// 从 client.ts 导入客户端可用的 Server Action
import { getRenovationPhotosAction } from "../../../../actions/client";

/** 装修合同摘要（getRenovationContractAction 提炼，供 KPI 与页面副列共用） */
export interface RenovationContractMeta {
  /** 装修公司（renovation_company） */
  companyName?: string;
  /** 对接负责人（contact_person_id，内部用户 ID） */
  contactPersonId?: string;
  /** 实际开工（actual_start_date） */
  actualStart?: string;
  /** 约定竣工/合同截止（contract_end_date） */
  expectedEnd?: string;
  /** 实际竣工（actual_end_date；在售副列「关键日期·装修完工」行复用） */
  actualEnd?: string;
}

interface RenovationKPIsProps {
  project: Project;
  /** 装修合同摘要：实际开工日期优先于 project.renovation_start_date */
  contractMeta?: RenovationContractMeta;
}

/** 已完成阶段数（总体进度 delta「N / 6 阶段已完成」） */
function countCompletedStages(project: Project): number {
  const stageDates = project.renovationStageDates ?? {};
  return RENOVATION_STAGES.filter((s) => !!stageDates[s.value]).length;
}

export function RenovationKPIs({ project, contractMeta }: RenovationKPIsProps) {
  // [新增] 用于存储照片总数的状态
  const [photoCount, setPhotoCount] = useState(0);
  const today = useCurrentDate();

  // 1. 计算倒计时逻辑
  const handoverDate = project.planned_handover_date
    ? new Date(project.planned_handover_date)
    : new Date();

  const deadlineDate = addDays(handoverDate, 65);
  const daysLeft = today ? differenceInDays(deadlineDate, today) : 0;

  let daysColor = "text-success";
  if (daysLeft < 10) daysColor = "text-error animate-pulse";
  else if (daysLeft <= 30) daysColor = "text-status-renovating";

  // 2. 计算索引用于传参 (与 RenovationTimeline 同步逻辑)
  const currentIndex = (() => {
    // 如果阶段是 "已完成"，或者项目已经进入在售/已售状态，说明装修已全部结束
    if (project.renovation_stage === "已完成" || ["selling", "sold"].includes(project.status)) {
      return RENOVATION_STAGES.length;
    }
    const idx = RENOVATION_STAGES.findIndex(
      (s) => s.value === project.renovation_stage || s.key === project.renovation_stage,
    );
    return idx === -1 ? 0 : idx;
  })();

  const currentStageLabel =
    currentIndex < RENOVATION_STAGES.length ? RENOVATION_STAGES[currentIndex].label : "已完成";

  // 当前阶段进度计数（设计稿「水电 3 / 6」；全完成后不展示计数）
  const stageIndexText =
    currentIndex < RENOVATION_STAGES.length
      ? `${currentIndex + 1} / ${RENOVATION_STAGES.length}`
      : undefined;

  // 2.5 当前阶段卡 delta：开工日期 + 已开工天数（合同实际开工优先，均缺失则省略）
  const renovationStartDelta = (() => {
    const startDate = contractMeta?.actualStart ?? project.renovation_start_date;
    if (!startDate) return null;
    try {
      const start = parseISO(startDate);
      if (!isValid(start)) return null;
      const days = today ? Math.max(0, differenceInDays(today, start)) : null;
      return `开工 ${format(start, "yyyy.MM.dd")}${days !== null ? ` · 已 ${days} 天` : ""}`;
    } catch {
      return null;
    }
  })();

  // 3. 计算总体进度（按已完成阶段数计算，支持无序完成）
  const completedCount = countCompletedStages(project);
  const progressValue = Math.round((completedCount / RENOVATION_STAGES.length) * 100);

  // 4. [关键修改] 异步获取照片总数
  useEffect(() => {
    const fetchTotalPhotos = async () => {
      try {
        // 调用接口获取该项目下 *所有* 照片 (不传 stage 参数即为获取全部)
        const res = await getRenovationPhotosAction(project.id);
        if (res.success && Array.isArray(res.data)) {
          // 直接取数组长度作为总数
          setPhotoCount(res.data.length);
        }
      } catch (error) {
        logger.error("获取照片统计失败", error);
      }
    };

    if (project.id) {
      fetchTotalPhotos();
    }
  }, [project.id]);

  // 设计稿 .kpi：label 13px/450，value 30px（当前阶段 26px）/480/字距-0.02em，
  // delta 12px/450；数值统一正文无衬线字体（Sohne，非 Signifier）
  const valueClass = "text-[30px] font-[480] leading-[1.15] tracking-[-0.02em]";
  const deltaClass = "mt-2 text-[12px] font-[450]";

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      {/* 卡片 1: 交付倒计时 — 天数类 · 冷底（<10 天红色脉冲 · ≤30 天橙色） */}
      <div className="flex h-full flex-col justify-between rounded-cards bg-sky-wash p-5 shadow-steep">
        <span className="text-[13px] font-[450] text-ink/55">交付倒计时</span>
        <div>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className={cn(valueClass, daysColor)}>{daysLeft}</span>
            <span className="text-sm font-[430] text-graphite">天</span>
          </div>
          <div className={cn(deltaClass, "text-ink/55")}>≤30 天橙色 · &lt;10 天红色脉冲</div>
        </div>
      </div>

      {/* 卡片 2: 当前阶段 — 白卡 · 「水电 3 / 6」 */}
      <div className="flex h-full flex-col justify-between rounded-cards bg-pure-white p-5 shadow-steep">
        <span className="text-[13px] font-[450] text-graphite">当前阶段</span>
        <div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-[26px] font-[480] leading-[1.15] tracking-[-0.02em] text-ink">
              {currentStageLabel}
            </span>
            {stageIndexText && (
              <span className="text-sm font-[430] text-graphite">{stageIndexText}</span>
            )}
          </div>
          {renovationStartDelta && (
            <div className={cn(deltaClass, "text-graphite")}>{renovationStartDelta}</div>
          )}
        </div>
      </div>

      {/* 卡片 3: 总体进度 — 白卡 · 进度条同步（设计稿 delta 注释「进度条同步」） */}
      <div className="flex h-full flex-col justify-between rounded-cards bg-pure-white p-5 shadow-steep">
        <span className="text-[13px] font-[450] text-graphite">总体进度</span>
        <div>
          <div className="mt-1.5 flex items-baseline gap-0.5">
            <span className={cn(valueClass, "text-ink")}>{progressValue}</span>
            <span className="text-sm font-[430] text-graphite">%</span>
          </div>
          <Progress
            value={progressValue}
            className="mt-2 h-2 bg-muted"
            indicatorClassName="bg-status-renovating"
          />
          <div className={cn(deltaClass, "text-graphite")}>
            {completedCount} / {RENOVATION_STAGES.length} 阶段已完成
          </div>
        </div>
      </div>

      {/* 卡片 4: 现场相册 — 白卡 */}
      <div className="flex h-full flex-col justify-between rounded-cards bg-pure-white p-5 shadow-steep">
        <span className="text-[13px] font-[450] text-graphite">现场相册</span>
        <div>
          <div className="mt-1.5 flex items-baseline gap-1">
            {/* 显示计算出来的 photoCount */}
            <span className={cn(valueClass, "text-ink")}>{photoCount}</span>
            <span className="text-sm font-[430] text-graphite">张</span>
          </div>
          <div className={cn(deltaClass, "text-graphite")}>按 6 阶段分组归档</div>
        </div>
      </div>
    </div>
  );
}
