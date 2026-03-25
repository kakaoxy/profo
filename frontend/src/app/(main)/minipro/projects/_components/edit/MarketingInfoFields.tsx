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
import { Textarea } from "@/components/ui/textarea";
import { InfoCard } from "../ui/InfoCard";
import { TagInputField } from "./TagInputField";
import { ImageInputField } from "./ImageInputField";
import type { CreateValues, UpdateValues } from "../form-schema";

export function MarketingInfoFields() {
  const { control, setValue, watch } = useFormContext<CreateValues | UpdateValues>();
  const marketingTags = watch("marketing_tags") ?? [];

  return (
    <InfoCard title="营销信息">
      <div className="space-y-5">
        <FormField
          control={control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium text-slate-700">
                营销标题
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={control}
            name="style"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-slate-700">
                  物业风格
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="例如：现代简约"
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
        </div>

        <FormField
          control={control}
          name="marketing_tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium text-slate-700">
                营销标签
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

        <FormField
          control={control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium text-slate-700">
                项目描述
              </FormLabel>
              <FormControl>
                <Textarea
                  rows={4}
                  placeholder="描述项目特色..."
                  value={String(field.value ?? "")}
                  onChange={(e) =>
                    field.onChange(e.target.value ? e.target.value : null)
                  }
                  className="border-slate-200 focus-visible:ring-blue-600 resize-none"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="pt-5 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">分享配置</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={control}
              name="share_title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-slate-700">
                    分享标题
                  </FormLabel>
                  <FormControl>
                    <Input
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
            <FormField
              control={control}
              name="share_image"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-slate-700">
                    分享图
                  </FormLabel>
                  <FormControl>
                    <ImageInputField
                      value={field.value ?? null}
                      onChange={(value) => field.onChange(value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      </div>
    </InfoCard>
  );
}
