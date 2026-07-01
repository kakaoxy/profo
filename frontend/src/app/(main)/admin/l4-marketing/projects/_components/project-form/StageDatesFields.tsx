"use client";

import { Controller, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { RENOVATION_STAGES } from "../../types";
import type { FormValues } from "../form-schema";

/**
 * 改造阶段完成时间字段组件
 *
 * 遍历 RenovationStage 枚举（与后端对齐），为每个阶段提供一个日期输入。
 * 值存储在 stage_completed_dates 字典 {stage: "YYYY-MM-DD"}，与 L3 同构。
 * 字段可选，允许清空（清空后从字典中移除该 key）。
 */
export function StageDatesFields() {
  const { control } = useFormContext<FormValues>();

  return (
    <section className="bg-primary/5 rounded-2xl p-8">
      <h3 className="text-lg font-bold text-foreground mb-2 flex items-center gap-2">
        <span className="w-1.5 h-6 bg-primary rounded-full"></span>
        改造阶段完成时间 (Stage Dates)
      </h3>
      <p className="text-xs text-muted-foreground mb-6">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {RENOVATION_STAGES.map((stage) => (
                <div key={stage.value} className="space-y-2">
                  <label
                    htmlFor={`stage-date-${stage.value}`}
                    className="block text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-wider"
                  >
                    {stage.label}
                  </label>
                  <Input
                    id={`stage-date-${stage.value}`}
                    type="date"
                    value={dates[stage.value] ?? ""}
                    onChange={(e) => handleChange(stage.value, e.target.value)}
                    className="w-full h-12 px-4 border border-[var(--border)]/50 rounded-xl bg-card text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
                  />
                </div>
              ))}
            </div>
          );
        }}
      />
    </section>
  );
}
