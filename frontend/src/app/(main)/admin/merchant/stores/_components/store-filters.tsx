"use client";

import { ChevronDown, ChevronUp, Search, SlidersHorizontal, X } from "lucide-react";

import { Field } from "@/app/(main)/admin/_components/field";
import { SteepButton, SteepInput, SteepSelectTrigger } from "@/components/custom/steep-controls";
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import type { components } from "@/lib/api-types";
import { REVIEW_LABELS, SOURCE_LABELS, STORE_STATUS_LABELS } from "./store-status";

export type StoreFilterValues = {
  keyword: string;
  status: string;
  reviewStatus: string;
  district: string;
  businessCircle: string;
  source: string;
  brokerCountMin: string;
  brokerCountMax: string;
  createdFrom: string;
  createdTo: string;
  ownerId: string;
};

export const EMPTY_STORE_FILTERS: StoreFilterValues = {
  keyword: "",
  status: "all",
  reviewStatus: "all",
  district: "",
  businessCircle: "",
  source: "all",
  brokerCountMin: "",
  brokerCountMax: "",
  createdFrom: "",
  createdTo: "",
  ownerId: "all",
};

type Employee = components["schemas"]["UserSimpleResponse"];

export function StoreFilters({
  values,
  onChange,
  onApply,
  onClear,
  employees,
  expanded,
  onExpandedChange,
  loading,
}: {
  values: StoreFilterValues;
  onChange: (next: StoreFilterValues) => void;
  onApply: () => void;
  onClear: () => void;
  employees: Employee[];
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  loading: boolean;
}) {
  const setValue = <K extends keyof StoreFilterValues>(key: K, value: StoreFilterValues[K]) => {
    onChange({ ...values, [key]: value });
  };

  const activeChips: { key: string; label: string; remove: () => void }[] = [];
  if (values.status !== "all") {
    activeChips.push({
      key: "status",
      label: `门店状态：${STORE_STATUS_LABELS[values.status] ?? values.status}`,
      remove: () => onChange({ ...values, status: "all" }),
    });
  }
  if (values.reviewStatus !== "all") {
    activeChips.push({
      key: "review",
      label: `审核状态：${REVIEW_LABELS[values.reviewStatus] ?? values.reviewStatus}`,
      remove: () => onChange({ ...values, reviewStatus: "all" }),
    });
  }
  if (values.district.trim()) {
    activeChips.push({
      key: "district",
      label: `区县：${values.district.trim()}`,
      remove: () => onChange({ ...values, district: "" }),
    });
  }
  if (values.businessCircle.trim()) {
    activeChips.push({
      key: "circle",
      label: `商圈：${values.businessCircle.trim()}`,
      remove: () => onChange({ ...values, businessCircle: "" }),
    });
  }
  if (values.brokerCountMin || values.brokerCountMax) {
    activeChips.push({
      key: "broker",
      label: `经纪人：${values.brokerCountMin || "不限"}–${values.brokerCountMax || "不限"}`,
      remove: () => onChange({ ...values, brokerCountMin: "", brokerCountMax: "" }),
    });
  }
  if (values.createdFrom || values.createdTo) {
    activeChips.push({
      key: "created",
      label: `创建日期：${values.createdFrom || "不限"} 至 ${values.createdTo || "不限"}`,
      remove: () => onChange({ ...values, createdFrom: "", createdTo: "" }),
    });
  }
  if (values.source !== "all") {
    activeChips.push({
      key: "source",
      label: `来源：${SOURCE_LABELS[values.source] ?? values.source}`,
      remove: () => onChange({ ...values, source: "all" }),
    });
  }
  if (values.ownerId !== "all") {
    const owner = employees.find((employee) => employee.id === values.ownerId);
    activeChips.push({
      key: "owner",
      label: `负责人：${owner?.nickname || owner?.username || values.ownerId}`,
      remove: () => onChange({ ...values, ownerId: "all" }),
    });
  }

  const hasActiveFilters = activeChips.length > 0 || Boolean(values.keyword.trim());

  const advancedCount = [
    Boolean(values.district.trim()),
    Boolean(values.businessCircle.trim()),
    Boolean(values.brokerCountMin || values.brokerCountMax),
    Boolean(values.createdFrom || values.createdTo),
    values.source !== "all",
    values.ownerId !== "all",
  ].filter(Boolean).length;

  return (
    <section aria-label="门店筛选" className="rounded-cards bg-pure-white p-5 shadow-steep">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_160px_160px_auto] xl:items-end">
        <div className="min-w-0">
          <FilterLabel>搜索</FilterLabel>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-graphite" />
            <SteepInput
              className="pl-11"
              placeholder="搜索门店 / 地址 / 公司 / 电话"
              aria-label="搜索门店"
              value={values.keyword}
              onChange={(event) => setValue("keyword", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onApply();
              }}
            />
          </div>
        </div>

        <div>
          <FilterLabel>门店状态</FilterLabel>
          <Select value={values.status} onValueChange={(value) => setValue("status", value)}>
            <SteepSelectTrigger aria-label="按门店状态筛选">
              <SelectValue placeholder="全部状态" />
            </SteepSelectTrigger>
            <SelectContent className="rounded-[16px] border-dove/40 shadow-steep">
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="normal">正常</SelectItem>
              <SelectItem value="disabled">停用</SelectItem>
              <SelectItem value="merged">已合并</SelectItem>
              <SelectItem value="relocated">已搬迁</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <FilterLabel>审核状态</FilterLabel>
          <Select
            value={values.reviewStatus}
            onValueChange={(value) => setValue("reviewStatus", value)}
          >
            <SteepSelectTrigger aria-label="按审核状态筛选">
              <SelectValue placeholder="全部审核" />
            </SteepSelectTrigger>
            <SelectContent className="rounded-[16px] border-dove/40 shadow-steep">
              <SelectItem value="all">全部审核</SelectItem>
              <SelectItem value="pending">待审核</SelectItem>
              <SelectItem value="approved">已转正</SelectItem>
              <SelectItem value="merged">已合并</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 xl:justify-end">
          <SteepButton
            variant="muted"
            aria-expanded={expanded}
            aria-controls="store-advanced-filters"
            onClick={() => onExpandedChange(!expanded)}
          >
            <SlidersHorizontal />
            高级筛选{advancedCount > 0 ? `（${advancedCount}）` : ""}
            {expanded ? <ChevronUp /> : <ChevronDown />}
          </SteepButton>
          {hasActiveFilters ? (
            <SteepButton variant="muted" onClick={onClear}>
              清空
            </SteepButton>
          ) : null}
          <SteepButton variant="text" onClick={onApply} disabled={loading}>
            <Search />
            查询
          </SteepButton>
        </div>
      </div>

      {expanded ? (
        <div
          id="store-advanced-filters"
          className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-dove/40 pt-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Field label="区县">
            <SteepInput
              placeholder="如：浦东新区"
              aria-label="按区县筛选"
              value={values.district}
              onChange={(event) => setValue("district", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onApply();
              }}
            />
          </Field>
          <Field label="商圈">
            <SteepInput
              placeholder="如：陆家嘴商圈"
              aria-label="按商圈筛选"
              value={values.businessCircle}
              onChange={(event) => setValue("businessCircle", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onApply();
              }}
            />
          </Field>
          <Field label="经纪人数量">
            <div className="flex items-center gap-2">
              <SteepInput
                type="number"
                min={0}
                placeholder="下限"
                aria-label="经纪人数量下限"
                value={values.brokerCountMin}
                onChange={(event) => setValue("brokerCountMin", event.target.value)}
              />
              <span className="shrink-0 text-[14px] text-graphite">至</span>
              <SteepInput
                type="number"
                min={0}
                placeholder="上限"
                aria-label="经纪人数量上限"
                value={values.brokerCountMax}
                onChange={(event) => setValue("brokerCountMax", event.target.value)}
              />
            </div>
          </Field>
          <Field label="创建日期" hint="格式 YYYY-MM-DD">
            <div className="flex items-center gap-2">
              <SteepInput
                type="text"
                inputMode="numeric"
                placeholder="开始日期"
                aria-label="创建日期起"
                value={values.createdFrom}
                onChange={(event) => setValue("createdFrom", event.target.value)}
              />
              <span className="shrink-0 text-[14px] text-graphite">至</span>
              <SteepInput
                type="text"
                inputMode="numeric"
                placeholder="结束日期"
                aria-label="创建日期止"
                value={values.createdTo}
                onChange={(event) => setValue("createdTo", event.target.value)}
              />
            </div>
          </Field>
          <Field label="来源">
            <Select value={values.source} onValueChange={(value) => setValue("source", value)}>
              <SteepSelectTrigger aria-label="按来源筛选">
                <SelectValue placeholder="全部来源" />
              </SteepSelectTrigger>
              <SelectContent className="rounded-[16px] border-dove/40 shadow-steep">
                <SelectItem value="all">全部来源</SelectItem>
                <SelectItem value="employee">员工建档</SelectItem>
                <SelectItem value="backoffice">后台新增</SelectItem>
                <SelectItem value="import">批量导入</SelectItem>
                <SelectItem value="broker">经纪人创建</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="负责人">
            <Select value={values.ownerId} onValueChange={(value) => setValue("ownerId", value)}>
              <SteepSelectTrigger aria-label="按负责人筛选">
                <SelectValue placeholder="全部负责人" />
              </SteepSelectTrigger>
              <SelectContent className="rounded-[16px] border-dove/40 shadow-steep">
                <SelectItem value="all">全部负责人</SelectItem>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.nickname || employee.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      ) : null}

      {activeChips.length > 0 ? (
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-dove/40 pt-4">
          <span className="text-[14px] text-graphite">已选</span>
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex h-7 items-center gap-2 rounded-full bg-fog px-3 text-[14px] leading-none text-ink"
            >
              {chip.label}
              <button
                type="button"
                aria-label={`移除${chip.label}`}
                onClick={chip.remove}
                className="inline-flex size-4 items-center justify-center rounded-full text-graphite transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:outline-none"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          <SteepButton variant="muted" onClick={onClear}>
            清空全部
          </SteepButton>
        </div>
      ) : null}
    </section>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 block text-[14px] leading-[1.4] tracking-[-0.009em] text-graphite">
      {children}
    </span>
  );
}
