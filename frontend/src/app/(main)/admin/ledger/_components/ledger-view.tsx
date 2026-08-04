"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryStates, parseAsString, parseAsInteger } from "nuqs";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { components } from "@/lib/api-types";
import { LedgerTable } from "./ledger-table";
import { exportLedger } from "../export-actions";

type LedgerProjectListItem = components["schemas"]["LedgerProjectListItem"];

interface LedgerViewProps {
  data: LedgerProjectListItem[];
  total: number;
}

const PROJECT_STATUS_OPTIONS = [
  { value: "all", label: "全部项目状态" },
  { value: "signing", label: "签约" },
  { value: "renovating", label: "改造" },
  { value: "selling", label: "在售" },
  { value: "sold", label: "已售" },
];

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
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row w-full lg:w-auto gap-3 items-center">
          {/* 搜索框 */}
          <div className="relative w-full sm:w-72">
            <Input
              placeholder="搜索项目编号/小区/地址..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="bg-card border-border focus-visible:ring-primary"
            />
          </div>

          {/* 项目状态筛选 */}
          <Select
            value={query.project_status}
            onValueChange={(val) =>
              setQuery({ project_status: val, page: 1 })
            }
          >
            <SelectTrigger className="h-10 w-[140px] bg-card border-border rounded-lg">
              <SelectValue placeholder="项目状态" />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex w-full lg:w-auto gap-3">
          <Button
            variant="outline"
            className="flex-1 lg:flex-none bg-card border-border text-foreground hover:bg-muted"
            onClick={handleExport}
            disabled={exporting}
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
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          显示 {data.length} 条记录 (共 {total} 条)
        </span>
      </div>
    </div>
  );
}
