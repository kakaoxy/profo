"use client";

import { useFormContext } from "react-hook-form";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import type { FormValues } from "../form-schema";
import { MARKETING_PROJECT_STATUS_CONFIG, PUBLISH_STATUS_CONFIG } from "../../types";

export function BasicConfigFields() {
  const { control, watch } = useFormContext<FormValues>();
  const sortOrder = watch("sort_order") ?? 50;

  return (
    <div className="space-y-6">
      {/* Status & Controls Card */}
      <section className="bg-white border border-[#c0c7d6]/20 rounded-2xl p-6 shadow-sm">
        <h3 className="text-xs font-black text-[#707785] uppercase tracking-[0.2em] mb-6">发布设置 (Settings)</h3>
        <div className="space-y-8">
          {/* Toggle: Draft/Publish */}
          <FormField
            control={control}
            name="publish_status"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-[#0b1c30]">发布状态</p>
                    <p className="text-[11px] text-[#707785]">房源是否在前端对外展示</p>
                  </div>
                  <div className="flex bg-[#e5eeff] rounded-full p-1 w-32 relative">
                    <div
                      className={`absolute top-1 w-[60px] h-7 bg-[#005daa] rounded-full transition-all ${
                        field.value === "发布" ? "left-1" : "left-[66px]"
                      }`}
                    ></div>
                    <button
                      type="button"
                      onClick={() => field.onChange("发布")}
                      className={`flex-1 text-[11px] font-bold relative z-10 py-1.5 rounded-full transition-colors ${
                        field.value === "发布" ? "text-white" : "text-[#707785]"
                      }`}
                    >
                      发布
                    </button>
                    <button
                      type="button"
                      onClick={() => field.onChange("草稿")}
                      className={`flex-1 text-[11px] font-bold relative z-10 py-1.5 rounded-full transition-colors ${
                        field.value === "草稿" ? "text-white" : "text-[#707785]"
                      }`}
                    >
                      草稿
                    </button>
                  </div>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Selector: Project Status */}
          <FormField
            control={control}
            name="project_status"
            render={({ field }) => (
              <FormItem className="space-y-4">
                <p className="text-sm font-bold text-[#0b1c30]">项目状态</p>
                <div className="grid grid-cols-3 gap-2">
                  {["在途", "在售", "已售"].map((status) => {
                    const config = MARKETING_PROJECT_STATUS_CONFIG[status as keyof typeof MARKETING_PROJECT_STATUS_CONFIG];
                    const isSelected = field.value === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => field.onChange(status)}
                        className={`flex flex-col items-center py-3 rounded-xl border transition-all group ${
                          isSelected
                            ? "bg-[#9d6a00] text-white border-[#9d6a00]"
                            : "border-[#c0c7d6]/20 hover:border-[#005daa] text-[#0b1c30]"
                        }`}
                      >
                        <span className="text-lg mb-1">
                          {status === "在途" && "🚀"}
                          {status === "在售" && "⭐"}
                          {status === "已售" && "✓"}
                        </span>
                        <span className="text-[10px] font-bold">{status}</span>
                      </button>
                    );
                  })}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Weight & Order */}
          <FormField
            control={control}
            name="sort_order"
            render={({ field }) => (
              <FormItem className="space-y-3 pt-4 border-t border-[#c0c7d6]/10">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-[#707785] uppercase tracking-wider">排序权重</label>
                  <span className="text-[#005daa] font-bold">{field.value ?? 50}</span>
                </div>
                <FormControl>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={field.value ?? 50}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="w-full h-1.5 bg-[#d3e4fe] rounded-lg appearance-none cursor-pointer accent-[#005daa]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </section>

      {/* Tags & Styles Card */}
      <section className="bg-white border border-[#c0c7d6]/20 rounded-2xl p-6 shadow-sm">
        <div className="space-y-6">
          {/* Decoration Style */}
          <FormField
            control={control}
            name="decoration_style"
            render={({ field }) => (
              <FormItem className="space-y-4">
                <FormLabel className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
                  装修风格 (Style)
                </FormLabel>
                <div className="grid grid-cols-2 gap-2">
                  {["现代简约", "法式奢华", "中式典雅", "极简侘寂"].map((style) => {
                    const isSelected = field.value === style;
                    return (
                      <label
                        key={style}
                        className={`relative flex items-center justify-center py-2.5 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? "bg-[#d4e3ff] border-[#005daa]"
                            : "border-[#c0c7d6]/20 hover:border-[#005daa]/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="decoration_style"
                          value={style}
                          checked={isSelected}
                          onChange={() => field.onChange(style)}
                          className="hidden"
                        />
                        <span className={`text-xs font-bold ${isSelected ? "text-[#005daa]" : "text-[#0b1c30]"}`}>
                          {style}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </section>
    </div>
  );
}
