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
import { TagInputField } from "./TagInputField";

export function BasicConfigFields() {
  const { control, watch } = useFormContext<FormValues>();
  const tags = watch("tags") ?? [];

  return (
    <div className="space-y-6">
      {/* Status & Controls Card */}
      <section className="bg-card rounded-3xl shadow-steep-sm p-6">
        <h3 className="flex items-center gap-2 mb-6">
          <span className="w-1 h-4 rounded-full bg-rust"></span>
          <span className="text-[13px] font-medium text-graphite uppercase tracking-[0.08em]">发布设置 <span className="ml-1 font-normal normal-case text-ash">Settings</span></span>
        </h3>
        <div className="space-y-8">
          {/* Toggle: Draft/Publish */}
          <FormField
            control={control}
            name="publish_status"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">发布状态</p>
                    <p className="text-[11px] text-ash">房源是否在前端对外展示</p>
                  </div>
                  <div className="flex bg-fog rounded-full p-1 w-32 relative">
                    <div
                      className={`absolute top-1 w-15 h-7 bg-ink rounded-full transition-all ${
                        field.value === "发布" ? "left-1" : "left-16.5"
                      }`}
                    ></div>
                    <button
                      type="button"
                      onClick={() => field.onChange("发布")}
                      className={`flex-1 text-[11px] font-medium relative z-10 py-1.5 rounded-full transition-colors ${
                        field.value === "发布" ? "text-white" : "text-graphite"
                      }`}
                    >
                      发布
                    </button>
                    <button
                      type="button"
                      onClick={() => field.onChange("草稿")}
                      className={`flex-1 text-[11px] font-medium relative z-10 py-1.5 rounded-full transition-colors ${
                        field.value === "草稿" ? "text-white" : "text-graphite"
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
                <p className="text-sm font-medium text-ink">项目状态</p>
                <div className="grid grid-cols-3 gap-2">
                  {["在途", "在售", "已售"].map((status) => {
                    const isSelected = field.value === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => field.onChange(status)}
                        className={`flex flex-col items-center py-3 rounded-xl border transition-all group ${
                          isSelected
                            ? "bg-ink text-white border-ink"
                            : "border-dove/40 hover:border-rust/60 text-ink"
                        }`}
                      >
                        <span className="text-lg mb-1">
                          {status === "在途" && "🚀"}
                          {status === "在售" && "⭐"}
                          {status === "已售" && "✓"}
                        </span>
                        <span className="text-[10px] font-medium">{status}</span>
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
              <FormItem className="space-y-3 pt-4 border-t border-dove/30">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-graphite uppercase tracking-wider">排序权重</label>
                  <span className="text-ink font-medium">{field.value ?? 50}</span>
                </div>
                <FormControl>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={field.value ?? 50}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="w-full h-1.5 bg-fog rounded-lg appearance-none cursor-pointer accent-ink"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </section>

      {/* Tags & Styles Card - 白色卡片配色风格（与发布设置一致） */}
      <section className="bg-card rounded-3xl shadow-steep-sm p-6">
        <h3 className="flex items-center gap-2 mb-6">
          <span className="w-1 h-4 rounded-full bg-rust"></span>
          <span className="text-[13px] font-medium text-graphite uppercase tracking-[0.08em]">标签与风格 <span className="ml-1 font-normal normal-case text-ash">Tags &amp; Styles</span></span>
        </h3>
        <div className="space-y-6">
          {/* Tags */}
          <FormField
            control={control}
            name="tags"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="block text-xs font-medium text-graphite uppercase tracking-wider">
                  房源标签
                  <span className="text-xs text-ash/70 ml-2">
                    ({tags.length}/20)
                  </span>
                </FormLabel>
                <FormControl>
                  <TagInputField
                    value={field.value ?? []}
                    onChange={(value) => field.onChange(value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Decoration Style */}
          <FormField
            control={control}
            name="decoration_style"
            render={({ field }) => (
              <FormItem className="space-y-4">
                <FormLabel className="block text-xs font-medium text-graphite uppercase tracking-wider">
                  装修风格 <span className="ml-1 font-normal normal-case text-ash">Style</span>
                </FormLabel>
                <div className="grid grid-cols-2 gap-2">
                  {["现代简约", "法式奢华", "中式典雅", "极简侘寂"].map((style) => {
                    const isSelected = field.value === style;
                    return (
                      <label
                        key={style}
                        className={`relative flex items-center justify-center py-2.5 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? "bg-apricot-wash/60 border-rust"
                            : "border-dove/40 hover:border-rust/40"
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
                        <span className={`text-xs font-medium ${isSelected ? "text-rust" : "text-ink"}`}>
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
