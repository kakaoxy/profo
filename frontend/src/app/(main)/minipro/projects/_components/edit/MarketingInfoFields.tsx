"use client";

import * as React from "react";
import { useFormContext } from "react-hook-form";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { InfoCard } from "../ui/InfoCard";
import { TagInputField } from "./TagInputField";
import type { FormValues } from "../form-schema";

export function MarketingInfoFields() {
  const { control, watch } = useFormContext<FormValues>();
  const tags = watch("tags") ?? [];

  return (
    <InfoCard title="营销信息">
      <div className="space-y-5">
        {/* 标题 */}
        <FormField
          control={control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium text-slate-700">
                标题 <span className="text-red-500">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="例如：徐汇核心区，尊享园林景观生活"
                  {...field}
                  value={String(field.value ?? "")}
                  onChange={(e) => field.onChange(e.target.value)}
                  className="border-slate-200 focus-visible:ring-blue-600"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 小区ID & 户型 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={control}
            name="community_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-slate-700">
                  小区ID <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    placeholder="请输入小区ID"
                    value={String(field.value ?? "")}
                    onChange={(e) => {
                      const val = e.target.value === "" ? 0 : Number(e.target.value);
                      field.onChange(Number.isFinite(val) && val > 0 ? val : 0);
                    }}
                    className="border-slate-200 focus-visible:ring-blue-600"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="layout"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-slate-700">
                  户型 <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="例如：三室两厅"
                    value={String(field.value ?? "")}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="border-slate-200 focus-visible:ring-blue-600"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* 朝向 & 楼层信息 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={control}
            name="orientation"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-slate-700">
                  朝向 <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="例如：南北通透"
                    value={String(field.value ?? "")}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="border-slate-200 focus-visible:ring-blue-600"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="floor_info"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-slate-700">
                  楼层信息 <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="例如：15/28层"
                    value={String(field.value ?? "")}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="border-slate-200 focus-visible:ring-blue-600"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* 面积 & 总价 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={control}
            name="area"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-slate-700">
                  面积 (m²) <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0.01}
                    step={0.01}
                    placeholder="例如：120.5"
                    value={String(field.value ?? "")}
                    onChange={(e) => {
                      const val = e.target.value === "" ? 0 : Number(e.target.value);
                      field.onChange(Number.isFinite(val) && val > 0 ? val : 0);
                    }}
                    className="border-slate-200 focus-visible:ring-blue-600"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="total_price"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-slate-700">
                  总价 (万元) <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0.01}
                    step={0.01}
                    placeholder="例如：500"
                    value={String(field.value ?? "")}
                    onChange={(e) => {
                      const val = e.target.value === "" ? 0 : Number(e.target.value);
                      field.onChange(Number.isFinite(val) && val > 0 ? val : 0);
                    }}
                    className="border-slate-200 focus-visible:ring-blue-600"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* 营销标签 */}
        <FormField
          control={control}
          name="tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium text-slate-700">
                标签
                <span className="text-xs text-slate-400 ml-2">
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
      </div>
    </InfoCard>
  );
}
