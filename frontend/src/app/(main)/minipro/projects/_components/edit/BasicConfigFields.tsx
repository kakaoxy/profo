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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { InfoCard } from "../ui/InfoCard";
import type { FormValues } from "../form-schema";
import { MARKETING_PROJECT_STATUS_CONFIG, PUBLISH_STATUS_CONFIG } from "../../types";

export function BasicConfigFields() {
  const { control } = useFormContext<FormValues>();

  return (
    <InfoCard title="基础配置">
      <div className="space-y-5">
        {/* 排序权重 */}
        <FormField
          control={control}
          name="sort_order"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium text-slate-700">
                排序权重
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  placeholder="数值越大排序越靠前"
                  value={String(field.value ?? 0)}
                  onChange={(e) => {
                    const next = e.target.value === "" ? 0 : Number(e.target.value);
                    field.onChange(Number.isFinite(next) ? next : 0);
                  }}
                  className="border-slate-200 focus-visible:ring-blue-600"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 项目状态 */}
        <FormField
          control={control}
          name="project_status"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium text-slate-700">
                项目状态
              </FormLabel>
              <FormControl>
                <Select
                  value={field.value ?? "在途"}
                  onValueChange={(val) =>
                    field.onChange(val as "在途" | "在售" | "已售")
                  }
                >
                  <SelectTrigger className="w-full border-slate-200 focus:ring-blue-600">
                    <SelectValue placeholder="选择状态" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MARKETING_PROJECT_STATUS_CONFIG).map(
                      ([value, config]) => (
                        <SelectItem key={value} value={value}>
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: config.color }}
                            />
                            {config.label}
                          </div>
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 发布状态 */}
        <FormField
          control={control}
          name="publish_status"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium text-slate-700">
                发布状态
              </FormLabel>
              <FormControl>
                <Select
                  value={field.value ?? "草稿"}
                  onValueChange={(val) =>
                    field.onChange(val as "草稿" | "发布")
                  }
                >
                  <SelectTrigger className="w-full border-slate-200 focus:ring-blue-600">
                    <SelectValue placeholder="选择发布状态" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PUBLISH_STATUS_CONFIG).map(
                      ([value, config]) => (
                        <SelectItem key={value} value={value}>
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: config.color }}
                            />
                            {config.label}
                          </div>
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 装修风格 */}
        <FormField
          control={control}
          name="decoration_style"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium text-slate-700">
                装修风格
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="例如：现代简约、欧式古典"
                  value={String(field.value ?? "")}
                  onChange={(e) =>
                    field.onChange(e.target.value ? e.target.value : null)
                  }
                  className="border-slate-200 focus-visible:ring-blue-600"
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
