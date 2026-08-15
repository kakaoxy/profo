"use client";

import { Controller, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { RENOVATION_STAGES } from "../../types";
import type { FormValues } from "../form-schema";

/**
 * 改造阶段完成时间字段组件
 *
 * 以横向时间轴形式展示各改造阶段，为每个阶段提供一个日期输入。
 * 值存储在 stage_completed_dates 字典 {stage: "YYYY-MM-DD"}，与 L3 同构。
 * 字段可选，允许清空（清空后从字典中移除该 key）。
 * "已完成"阶段为冗余元阶段，不在时间轴中展示。
 */
export function StageDatesFields() {
  const { control } = useFormContext<FormValues>();

  // 移除"已完成"冗余阶段，仅保留实际改造阶段
  const STAGES = RENOVATION_STAGES.filter((s) => s.value !== "已完成");

  return (
    <section className="bg-card rounded-3xl shadow-steep-sm p-6">
      <h3 className="flex items-center gap-2 mb-2">
        <span className="w-1 h-4 rounded-full bg-rust"></span>
        <span className="text-[13px] font-medium text-graphite uppercase tracking-[0.08em]">
          改造阶段完成时间{" "}
          <span className="ml-1 font-normal normal-case text-ash">Stage Dates</span>
        </span>
      </h3>
      <p className="text-xs text-ash mb-6">
        各改造阶段的完成日期，将展示在 C 端改造时间线。可留空。
      </p>
      <Controller
        control={control}
        name="stage_completed_dates"
        render={({ field }) => {
          const dates: Record<string, string> = field.value ?? {};
          const handleChange = (stage: string, value: string) => {
            const next = { ...dates };
            if (value) {
              next[stage] = value;
            } else {
              delete next[stage];
            }
            field.onChange(next);
          };
          return (
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
              {STAGES.map((stage, index) => {
                const hasDate = !!dates[stage.value];
                return (
                  <div key={stage.value} className="relative flex-1 min-w-35">
                    {/* 节点圆点 + 连接线 */}
                    <div className="flex items-center">
                      <span
                        aria-hidden="true"
                        className={`shrink-0 h-3 w-3 rounded-full border-2 border-white ${
                          hasDate ? "bg-rust" : "bg-dove"
                        }`}
                      />
                      {index < STAGES.length - 1 && (
                        <span aria-hidden="true" className="h-0.5 w-full bg-dove/40" />
                      )}
                    </div>
                    <div className="mt-3 space-y-2">
                      <label
                        htmlFor={`stage-date-${stage.value}`}
                        className="block text-xs font-medium text-graphite uppercase tracking-wider"
                      >
                        {stage.label}
                      </label>
                      <Input
                        id={`stage-date-${stage.value}`}
                        type="date"
                        value={dates[stage.value] ?? ""}
                        onChange={(e) => handleChange(stage.value, e.target.value)}
                        className="w-full h-12 px-4 border border-dove/60 rounded-inputs bg-white text-sm font-medium text-ink outline-none focus:ring-2 focus:ring-rust/20 focus:border-rust/60"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }}
      />
    </section>
  );
}
