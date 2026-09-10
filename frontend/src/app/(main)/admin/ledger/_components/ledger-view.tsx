"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryStates, parseAsString, parseAsInteger } from "nuqs";
import { Download, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { components } from "@/lib/api-types";
import { LedgerTable } from "./ledger-table";
import { exportLedger } from "../export-actions";

type LedgerProjectListItem = components["schemas"]["LedgerProjectListItem"];

interface LedgerViewProps {
  data: LedgerProjectListItem[];
  total: number;
}

// 项目状态筛选项：value 直接对应后端 project_status 参数值
const PROJECT_STATUS_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "signing", label: "已签约" },
  { value: "renovating", label: "装修中" },
  { value: "selling", label: "在售" },
  { value: "sold", label: "已售" },
] as const;

export function LedgerView({ data, total }: LedgerViewProps) {
  const router = useRouter();
  const [query, setQuery] = useQueryStates(
    {
      search: parseAsString.withDefault(""),
      project_status: parseAsString.withDefault("all"),
      page: parseAsInteger.withDefault(1),
      page_size: parseAsInteger.withDefault(10),
    },
    { shallow: false },
  );

  // 搜索输入本地状态（防抖同步到 URL 触发服务端筛选）
  const [searchInput, setSearchInput] = React.useState(query.search);
  const [exporting, setExporting] = React.useState(false);

  // 用 ref 保存 query.search 与 searchInput 最新值，effect 内通过 ref 读取
  // 避免闭包过期，且无需把对应值加入依赖数组（加入会引发覆盖用户输入或重置定时器）
  const querySearchRef = React.useRef(query.search);
  querySearchRef.current = query.search;
  const searchInputRef = React.useRef(searchInput);
  searchInputRef.current = searchInput;

  // 外部 URL 变化时同步输入框（如分页重置或点击清除）
  // 通过 ref 读取最新 searchInput，避免用户输入过程中被覆盖
  React.useEffect(() => {
    if (query.search !== searchInputRef.current) {
      setSearchInput(query.search);
    }
  }, [query.search]);

  // 防抖 300ms 推送搜索到 URL
  // 通过 ref 读取最新 query.search，避免闭包内读到过期值导致重复 setQuery
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (querySearchRef.current !== searchInput) {
        setQuery({ search: searchInput, page: 1 });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, setQuery]);

  const handleRowClick = (row: LedgerProjectListItem) => {
    router.push(`/admin/ledger/${row.project_id}`);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportLedger({
        search: query.search || undefined,
        project_status: query.project_status,
      });
      if (res.success) {
        const blob = new Blob([res.data], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const today = new Date();
        const ymd =
          `${today.getFullYear()}` +
          `${String(today.getMonth() + 1).padStart(2, "0")}` +
          `${String(today.getDate()).padStart(2, "0")}`;
        a.download = `资金账本_${ymd}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("导出成功");
      } else {
        toast.error(res.message || "导出失败");
      }
    } catch {
      toast.error("导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center lg:w-auto">
          {/* 搜索框 */}
          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-graphite"
              aria-hidden="true"
            />
            <Input
              placeholder="搜索项目编号 / 小区 / 地址"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-11 rounded-inputs border-dove bg-white pr-10 pl-10 text-sm shadow-none placeholder:text-dove focus-visible:border-rust focus-visible:ring-rust/25"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                aria-label="清除搜索"
                className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-graphite transition-colors hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          {/*
            项目状态筛选：胶囊分段控件（对齐 Steep，替代原下拉 Select）。
            语义用 aria-pressed 而非 role="tab"：这里没有 tabpanel、也不做方向键漫游焦点，
            套用 tab 角色会向读屏软件承诺并不存在的交互模型。
          */}
          <div
            className="flex w-fit rounded-cards bg-fog p-1"
            role="group"
            aria-label="项目状态筛选"
          >
            {PROJECT_STATUS_OPTIONS.map((opt) => {
              const active = query.project_status === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setQuery({ project_status: opt.value, page: 1 })}
                  className={`rounded-[10px] px-3.5 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                    active ? "bg-ink text-white" : "text-graphite hover:text-ink"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex w-full gap-3 lg:w-auto">
          <Button
            onClick={handleExport}
            disabled={exporting}
            className="h-11 flex-1 rounded-full bg-ink px-5 text-white hover:bg-ink/90 lg:flex-none"
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            导出 Excel
          </Button>
        </div>
      </div>

      {/* 表格 */}
      <LedgerTable data={data} onRowClick={handleRowClick} />

      {/* 底部计数 */}
      <div className="flex items-center justify-between px-1 text-xs text-graphite">
        <span>
          显示 {data.length} 条记录 (共 {total} 条)
        </span>
      </div>
    </div>
  );
}
