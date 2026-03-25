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
import { Switch } from "@/components/ui/switch";
import { InfoCard } from "../ui/InfoCard";
import { ImageInputField } from "./ImageInputField";
import type { L4Consultant } from "../../types";
import type { CreateValues, UpdateValues } from "../form-schema";

interface BasicConfigFieldsProps {
  consultants: L4Consultant[];
}

export function BasicConfigFields({ consultants }: BasicConfigFieldsProps) {
  const { control } = useFormContext<CreateValues | UpdateValues>();

  return (
    <InfoCard title="基础配置">
      <div className="space-y-5">
        <FormField
          control={control}
          name="cover_image"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium text-slate-700">
                封面图
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

        <FormField
          control={control}
          name="consultant_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium text-slate-700">
                顾问
              </FormLabel>
              <FormControl>
                <Select
                  value={field.value ? String(field.value) : "none"}
                  onValueChange={(val) =>
                    field.onChange(val === "none" ? null : val)
                  }
                >
                  <SelectTrigger className="w-full border-slate-200 focus:ring-blue-600">
                    <SelectValue placeholder="选择顾问" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不指定</SelectItem>
                    {consultants.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="is_published"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-slate-50/50 px-3 py-3">
              <div className="grid gap-0.5">
                <div className="text-sm font-medium text-slate-800">发布</div>
                <div className="text-xs text-slate-500">关闭则为草稿状态</div>
              </div>
              <FormControl>
                <Switch
                  aria-label="发布"
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                  className="data-[state=checked]:bg-emerald-500"
                />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    </InfoCard>
  );
}
