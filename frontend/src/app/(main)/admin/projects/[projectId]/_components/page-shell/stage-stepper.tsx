"use client";

import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

import { STAGE_CONFIG, type ViewMode } from "../../../_components/project-detail/constants";

interface StageStepperProps {
  /** 项目实际生命周期阶段下标（STAGE_CONFIG 索引，0-4） */
  currentProjectStageIndex: number;
  /** 切换阶段视图（沿用 useProjectDetail.handleViewModeChange，仅允许 ≤ 当前阶段） */
  onViewModeChange: (mode: ViewMode) => void;
}

interface StepNode {
  key: ViewMode;
  label: string;
  index: number;
}

/**
 * 生命周期进度条：签约 → 装修 → 在售 → 已售/已下架
 * 桌面为圆点 + 连接线（原型 .stepper），<768px 折叠为横向滚动胶囊条（原型 .m-steps）。
 * 当前阶段 Rust 高亮、已完成 Ink 实心圆点、未达成 Dove 空心 + 锁图标不可点。
 */
export function StageStepper({ currentProjectStageIndex, onViewModeChange }: StageStepperProps) {
  const isEnded = currentProjectStageIndex >= 4;
  const nowIndex = Math.min(currentProjectStageIndex, 3);

  const steps: StepNode[] = STAGE_CONFIG.slice(0, 4).map((stage, index) => {
    // 第 4 节点在已下架项目上展示为「已下架」，否则为「已售」
    const endedNode = index === 3 && isEnded;
    return {
      key: (endedNode ? "ended" : stage.key) as ViewMode,
      label: endedNode ? "已下架" : stage.label.replace("阶段", ""),
      index,
    };
  });

  return (
    <>
      {/* 桌面：圆点 + 连接线 */}
      <div className="mb-5 hidden md:flex md:flex-wrap md:items-center">
        {steps.map((step) => {
          const now = step.index === nowIndex;
          const done = !now && step.index < currentProjectStageIndex;
          const locked = step.index > currentProjectStageIndex;
          return (
            <div key={step.key} className="flex items-center">
              <button
                type="button"
                disabled={locked}
                onClick={() => onViewModeChange(step.key)}
                aria-current={now ? "step" : undefined}
                className={cn(
                  "flex items-center rounded-full",
                  locked ? "cursor-not-allowed" : "cursor-pointer",
                )}
              >
                <span
                  className={cn(
                    "grid h-[26px] w-[26px] place-items-center rounded-full border-[1.5px] border-dove bg-pure-white text-xs font-medium text-graphite transition-all",
                    done && "border-ink bg-ink text-pure-white",
                    now &&
                      "border-rust bg-rust text-pure-white shadow-[0_0_0_5px_rgba(93,42,26,0.1)]",
                  )}
                >
                  {done ? (
                    <Check className="h-3 w-3" strokeWidth={2.5} />
                  ) : locked ? (
                    <Lock className="h-[11px] w-[11px]" strokeWidth={2.2} />
                  ) : now && isEnded ? (
                    "!"
                  ) : (
                    step.index + 1
                  )}
                </span>
                <span
                  className={cn(
                    "ml-2 whitespace-nowrap text-[13px] font-[450] text-graphite",
                    now && "font-medium text-rust",
                    done && "text-ink",
                    locked && "text-dove",
                  )}
                >
                  {step.label}
                </span>
              </button>
              {step.index < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "mx-1.5 h-[1.5px] w-14 shrink-0 bg-[#e2e2e5]",
                    step.index + 1 <= currentProjectStageIndex && "bg-ink",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 移动端（<768px）：横向滚动胶囊条 */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1.5 md:hidden">
        {steps.map((step) => {
          const now = step.index === nowIndex;
          const done = !now && step.index < currentProjectStageIndex;
          const locked = step.index > currentProjectStageIndex;
          return (
            <button
              key={step.key}
              type="button"
              disabled={locked}
              onClick={() => onViewModeChange(step.key)}
              aria-current={now ? "step" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#e7e7ea] bg-pure-white px-3 py-1.5 text-[12.5px] font-[450] text-graphite transition-colors disabled:opacity-60",
                done && "text-ink",
                now && "border-rust bg-rust text-pure-white",
              )}
            >
              {now && <span aria-hidden>●</span>}
              {step.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
