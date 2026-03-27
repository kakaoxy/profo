"use client";

import * as React from "react";
import { useFormContext, Controller } from "react-hook-form";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TagInputField } from "./TagInputField";
import type { FormValues } from "../form-schema";

// 导入拆分的子组件
import {
  CommunitySelect,
  LayoutInputs,
  FloorInput,
  OrientationSelect,
  ConsultantSelect,
  TotalPriceInput,
  UnitPriceDisplay,
} from "./components";

/**
 * 计算单价
 * 单价 = 总价(万元) × 10000 ÷ 面积(㎡)
 * 返回字符串格式用于显示
 */
function calculateUnitPrice(totalPrice: number | undefined, area: number | undefined): string {
  const total = typeof totalPrice === "number" ? totalPrice : 0;
  const areaNum = typeof area === "number" ? area : 0;

  if (total > 0 && areaNum > 0) {
    return String(Math.round((total * 10000) / areaNum));
  }
  return "";
}

/**
 * 营销信息字段组件
 *
 * 负责房源营销相关信息的编辑，包括：
 * - 基础信息：小区、标题、顾问
 * - 户型规格：户型、面积、楼层、朝向
 * - 价格设置：总价、单价（自动计算）
 * - 标签风格：房源标签
 *
 * 单价会根据总价和面积自动计算：单价 = 总价(万元) × 10000 ÷ 面积(㎡)
 */
export function MarketingInfoFields() {
  const { control, watch, setValue } = useFormContext<FormValues>();
  const tags = watch("tags") ?? [];

  // 监听总价和面积，实时计算单价（在渲染时计算，避免 useEffect）
  const totalPrice = watch("total_price");
  const area = watch("area");
  const unitPrice = calculateUnitPrice(totalPrice, area);

  return (
    <div className="space-y-6">
      {/* 基础信息区域 */}
      <BasicInfoSection control={control} setValue={setValue} />

      {/* 户型与规格区域 */}
      <LayoutSpecsSection control={control} />

      {/* 价格设置区域 */}
      <PricingSection
        control={control}
        unitPrice={unitPrice}
      />

      {/* 标签与风格区域 */}
      <TagsSection control={control} tags={tags} />
    </div>
  );
}

/**
 * 基础信息区域组件
 *
 * 包含小区名称选择、房源标题输入、顾问选择
 */
interface BasicInfoSectionProps {
  control: ReturnType<typeof useFormContext<FormValues>>["control"];
  setValue: ReturnType<typeof useFormContext<FormValues>>["setValue"];
}

function BasicInfoSection({ control, setValue }: BasicInfoSectionProps) {
  return (
    <section className="bg-[#eff4ff] rounded-2xl p-8">
      <h3 className="text-lg font-bold text-[#0b1c30] mb-6 flex items-center gap-2">
        <span className="w-1.5 h-6 bg-[#005daa] rounded-full"></span>
        基础信息 (Basic Info)
      </h3>
      <div className="space-y-6">
        {/* 第一行：小区名称和房源标题 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <FormField
            control={control}
            name="community_name"
            render={({ field }) => (
              <FormItem className="space-y-0">
                <FormControl>
                  <CommunitySelect
                    value={field.value || ""}
                    onChange={(name, id) => {
                      field.onChange(name);
                      if (id) setValue("community_id", id);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="title"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
                  房源标题 <span className="text-[#ba1a1a]">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="输入吸引人的房源标题"
                    {...field}
                    value={String(field.value ?? "")}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="w-full h-12 px-4 border border-[#c0c7d6]/50 rounded-xl bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-[#005daa]/20 text-[#0b1c30]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* 第二行：顾问选择 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <FormField
            control={control}
            name="consultant_id"
            render={({ field }) => (
              <FormItem className="space-y-0">
                <FormControl>
                  <ConsultantSelect
                    value={field.value}
                    onChange={(id) => field.onChange(id)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * 户型与规格区域组件
 *
 * 包含户型输入、面积输入、楼层输入、朝向选择
 */
interface LayoutSpecsSectionProps {
  control: ReturnType<typeof useFormContext<FormValues>>["control"];
}

function LayoutSpecsSection({ control }: LayoutSpecsSectionProps) {
  return (
    <section className="bg-[#eff4ff] rounded-2xl p-8">
      <h3 className="text-lg font-bold text-[#0b1c30] mb-6 flex items-center gap-2">
        <span className="w-1.5 h-6 bg-[#005daa] rounded-full"></span>
        户型与规格 (Layout & Specs)
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormField
          control={control}
          name="layout"
          render={({ field }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <LayoutInputs
                  value={field.value || ""}
                  onChange={(val) => field.onChange(val)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="area"
          render={({ field }) => (
            <FormItem className="space-y-2">
              <FormLabel className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
                面积 (㎡) <span className="text-[#ba1a1a]">*</span>
              </FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    inputMode="decimal"
                    placeholder="例如：120.5"
                    value={field.value || ""}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^\d.]/g, "");
                      const numVal = val === "" ? 0 : parseFloat(val);
                      field.onChange(numVal);
                    }}
                    className="w-full h-11 px-4 border border-[#c0c7d6]/50 rounded-xl bg-white text-sm font-bold outline-none focus:ring-2 focus:ring-[#005daa]/20 text-[#0b1c30]"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[#707785]">㎡</span>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="floor_info"
          render={({ field }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <FloorInput
                  value={field.value || ""}
                  onChange={(val) => field.onChange(val)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="orientation"
          render={({ field }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <OrientationSelect
                  value={field.value || ""}
                  onChange={(val) => field.onChange(val)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </section>
  );
}

/**
 * 价格设置区域组件
 *
 * 包含总价输入和单价显示（自动计算）
 */
interface PricingSectionProps {
  control: ReturnType<typeof useFormContext<FormValues>>["control"];
  unitPrice: string;
}

function PricingSection({ control, unitPrice }: PricingSectionProps) {
  return (
    <section className="bg-[#eff4ff] rounded-2xl p-8">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-[#0b1c30] flex items-center gap-2">
          <span className="w-1.5 h-6 bg-[#005daa] rounded-full"></span>
          价格设置 (Pricing)
        </h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Controller
          control={control}
          name="total_price"
          render={({ field }) => (
            <TotalPriceInput
              value={String(field.value ?? "")}
              onChange={(val) => {
                const numVal = val === "" ? 0 : parseFloat(val);
                field.onChange(numVal);
              }}
            />
          )}
        />
        <UnitPriceDisplay value={unitPrice} />
      </div>
    </section>
  );
}

/**
 * 标签与风格区域组件
 *
 * 包含房源标签输入
 */
interface TagsSectionProps {
  control: ReturnType<typeof useFormContext<FormValues>>["control"];
  tags: string[];
}

function TagsSection({ control, tags }: TagsSectionProps) {
  return (
    <section className="bg-[#eff4ff] rounded-2xl p-8">
      <h3 className="text-lg font-bold text-[#0b1c30] mb-6 flex items-center gap-2">
        <span className="w-1.5 h-6 bg-[#005daa] rounded-full"></span>
        标签与风格 (Tags & Styles)
      </h3>
      <FormField
        control={control}
        name="tags"
        render={({ field }) => (
          <FormItem className="space-y-2">
            <FormLabel className="block text-xs font-bold text-[#707785] uppercase tracking-wider">
              房源标签
              <span className="text-xs text-[#707785]/60 ml-2">
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
    </section>
  );
}
