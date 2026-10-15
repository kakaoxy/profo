"use client";

import * as React from "react";
import { useState } from "react";
import { useFormContext, Controller, useWatch } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { DictAddressPicker, type DictAddressValue } from "@/components/dict-address-picker";
import type { FormValues } from "../form-schema";

// 导入拆分的子组件
import {
  LayoutInputs,
  FloorInput,
  OrientationSelect,
  ConsultantSelect,
  TotalPriceInput,
  UnitPriceDisplay,
  AreaInput,
} from "./components";

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
  const { control, setValue } = useFormContext<FormValues>();

  return (
    <div className="space-y-6">
      {/* 基础信息区域 */}
      <BasicInfoSection control={control} setValue={setValue} />

      {/* 户型与规格区域 */}
      <LayoutSpecsSection control={control} />

      {/* 价格设置区域 */}
      <PricingSection control={control} />
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
  // 楼盘字典四级地址（M4）
  const { getValues } = useFormContext<FormValues>();
  // 编辑态从已落库项目回显选择器初值（surface-dict-binding-info）；
  // getValues 惰性取当前表单值（projectToFormValues 已补 dict 字段）
  const [dictValue, setDictValue] = useState<DictAddressValue | null>(() => {
    const v = getValues();
    if (!v.community_id && !v.building_id && !v.room_id && !v.new_building) return null;
    // rejected 在选择器语义里等同未选中态（picker 不接受 rejected），置 null
    const pickerStatus = (s: string | null | undefined): DictAddressValue["dictStatus"] =>
      s === "linked" || s === "pending" || s === "manual" ? s : null;
    const nc = v.new_community;
    const nb = v.new_building;
    const nr = v.new_room;
    return {
      communityId: v.community_id || null,
      communityName: v.community_name || "",
      buildingId: v.building_id ?? null,
      buildingNo: (v as { building_no?: string | null }).building_no ?? "",
      roomId: v.room_id ?? null,
      roomNo: (v as { room_no?: string | null }).room_no ?? "",
      address: v.community_name || "",
      dictStatus: pickerStatus(v.dict_status),
      newCommunity:
        nc && typeof nc === "object" && typeof (nc as { name?: unknown }).name === "string"
          ? (nc as { name: string })
          : null,
      newBuilding:
        nb && typeof nb === "object" && typeof (nb as { name?: unknown }).name === "string"
          ? (nb as { name: string })
          : null,
      newRoom:
        nr && typeof nr === "object" && typeof (nr as { name?: unknown }).name === "string"
          ? (nr as { name: string })
          : null,
    };
  });
  return (
    <section className="bg-card rounded-3xl shadow-steep-sm p-6">
      <h3 className="flex items-center gap-2 mb-6">
        <span className="w-1 h-4 rounded-full bg-rust"></span>
        <span className="text-[13px] font-medium text-graphite uppercase tracking-[0.08em]">
          基础信息 <span className="ml-1 font-normal normal-case text-ash">Basic Info</span>
        </span>
      </h3>
      <div className="space-y-6">
        {/* 第一行：楼盘字典四级地址（M4：楼栋/户室选填落库；H3：透传 new_* 进审核池），唯一小区入口。
            独占一行：选择器含楼栋/楼层/户室三栏级联，压缩在半宽列内会溢出破碎（房源标题移到第二行） */}
        <FormField
          control={control}
          name="community_name"
          render={({ field }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <DictAddressPicker
                  value={dictValue}
                  onChange={(next) => {
                    setDictValue(next);
                    field.onChange(next.communityName || "");
                    // shouldDirty: true —— RHF setValue 默认不标 dirty，漏传会导致
                    // 仅改楼栋/户室时 dirtyFields 为空，提交提示「没有需要保存的变更」
                    const opts = { shouldDirty: true } as const;
                    if (next.communityId) setValue("community_id", next.communityId, opts);
                    setValue("building_id", next.buildingId ?? null, opts);
                    setValue("room_id", next.roomId ?? null, opts);
                    setValue("dict_status", next.dictStatus ?? null, opts);
                    setValue("new_community", next.newCommunity ?? null, opts);
                    setValue("new_building", next.newBuilding ?? null, opts);
                    setValue("new_room", next.newRoom ?? null, opts);
                  }}
                  sourceBizType="marketing"
                  // 营销表单统一走楼盘字典选择器，不提供手动填写地址入口；
                  // 历史手动录入记录在编辑态仍可经「返回字典选择」迁移到字典模式
                  allowManual={false}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* 第二行：房源标题 + 顾问选择 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <FormField
            control={control}
            name="title"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="block text-xs font-medium text-graphite uppercase tracking-wider">
                  房源标题 <span className="text-error">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="输入吸引人的房源标题"
                    {...field}
                    value={String(field.value ?? "")}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="w-full h-12 px-4 border border-dove/60 rounded-inputs bg-white text-sm font-medium text-ink outline-none focus:ring-2 focus:ring-rust/20 focus:border-rust/60"
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
              <FormItem className="space-y-0">
                <FormControl>
                  <ConsultantSelect value={field.value} onChange={(id) => field.onChange(id)} />
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
    <section className="bg-card rounded-3xl shadow-steep-sm p-6">
      <h3 className="flex items-center gap-2 mb-6">
        <span className="w-1 h-4 rounded-full bg-rust"></span>
        <span className="text-[13px] font-medium text-graphite uppercase tracking-[0.08em]">
          户型与规格{" "}
          <span className="ml-1 font-normal normal-case text-ash">Layout &amp; Specs</span>
        </span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormField
          control={control}
          name="layout"
          render={({ field }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <LayoutInputs value={field.value || ""} onChange={(val) => field.onChange(val)} />
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
              <FormLabel className="block text-xs font-medium text-graphite uppercase tracking-wider">
                面积 (㎡) <span className="text-error">*</span>
              </FormLabel>
              <FormControl>
                <AreaInput value={field.value} onChange={field.onChange} />
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
                <FloorInput value={field.value || ""} onChange={(val) => field.onChange(val)} />
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
 * 参考 leads/add-lead-modal.tsx 的实现方式
 */
interface PricingSectionProps {
  control: ReturnType<typeof useFormContext<FormValues>>["control"];
}

function PricingSection({ control }: PricingSectionProps) {
  // 使用 useWatch 实时监听表单值变化（类似 leads 表单的 useState + useMemo 模式）
  const totalPrice = useWatch({ control, name: "total_price" });
  const area = useWatch({ control, name: "area" });

  // 实时计算单价（参考 leads 表单的 calculatedUnitPrice）
  // 计算逻辑：总价(万元) / 面积(㎡) = 单价(万元/㎡)
  // 与后端计算逻辑保持一致
  const calculatedUnitPrice = React.useMemo(() => {
    const total = typeof totalPrice === "number" ? totalPrice : 0;
    const areaNum = typeof area === "number" ? area : 0;
    if (total > 0 && areaNum > 0) {
      const wanPerSqm = total / areaNum; // 万元/㎡
      return wanPerSqm.toFixed(2);
    }
    return "";
  }, [totalPrice, area]);

  return (
    <section className="bg-card rounded-3xl shadow-steep-sm p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="flex items-center gap-2">
          <span className="w-1 h-4 rounded-full bg-rust"></span>
          <span className="text-[13px] font-medium text-graphite uppercase tracking-[0.08em]">
            价格设置 <span className="ml-1 font-normal normal-case text-ash">Pricing</span>
          </span>
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
        <UnitPriceDisplay value={calculatedUnitPrice} />
      </div>
    </section>
  );
}
