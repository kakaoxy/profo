"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useQueryStates, parseAsString, parseAsInteger } from "nuqs";
import { Plus, Download, Loader2 } from "lucide-react";
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
import { InvestmentsTable } from "./investments-table";
import { exportInvestments } from "../actions";

// 动态导入弹窗组件（ssr: false，仅在客户端加载）
const CreateInvestmentDialog = dynamic(
  () =>
    import("./create-investment-dialog").then((m) => m.CreateInvestmentDialog),
  { ssr: false },
);

type InvestmentListItem = components["schemas"]["InvestmentListItemResponse"];

interface InvestmentsViewProps {
  data: InvestmentListItem[];
  total: number;
}

const PROJECT_STATUS_OPTIONS = [
  { value: "all", label: "全部项目状态" },
  { value: "signing", label: "签约" },
  { value: "renovating", label: "改造" },
  { value: "selling", label: "在售" },
  { value: "sold", label: "已售" },
];

const SETTLEMENT_STATUS_OPTIONS = [
  { value: "all", label: "全部跟投状态" },
  { value: "unsettled", label: "未结算" },
  { value: "settled", label: "已结算" },
];

export function InvestmentsView({ data, total }: InvestmentsViewProps) {
  const router = useRouter();
  const [query, setQuery] = useQueryStates(
    {
      search: parseAsString.withDefault(""),
      project_status: parseAsString.withDefault("all"),
      settlement_status: parseAsString.withDefault("all"),
      page: parseAsInteger.withDefault(1),
      page_size: parseAsInteger.withDefault(10),
      create: parseAsString.withDefault(""),
      project_id: parseAsString.withDefault(""),
    },
    { shallow: false },
  );

  // 搜索输入本地状态（防抖同步到 URL 触发服务端筛选）
  const [searchInput, setSearchInput] = React.useState(query.search);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  // URL create=1 → 自动打开新增弹框并清除参数（避免刷新重复打开）
  React.useEffect(() => {
    if (query.create === "1") {
      setCreateOpen(true);
      setQuery({ create: "" });
    }
  }, [query.create, setQuery]);

  // 弹框关闭时清除 project_id 参数
  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open && query.project_id) {
      setQuery({ project_id: "" });
    }
  };

  // 外部 URL 变化时同步输入框（如分页重置）
  React.useEffect(() => {
    if (query.search !== searchInput) {
      setSearchInput(query.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.search]);

  // 防抖 300ms 推送搜索到 URL
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (query.search !== searchInput) {
        setQuery({ search: searchInput, page: 1 });
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const handleRowClick = (row: InvestmentListItem) => {
    router.push(`/admin/investments/${row.project_id}`);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportInvestments({
        search: query.search || undefined,
        project_status: query.project_status,
        settlement_status: query.settlement_status,
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
        a.download = `跟投列表_${ymd}.xlsx`;
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
    <>
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

            {/* 跟投状态筛选 */}
            <Select
              value={query.settlement_status}
              onValueChange={(val) =>
                setQuery({ settlement_status: val, page: 1 })
              }
            >
              <SelectTrigger className="h-10 w-[140px] bg-card border-border rounded-lg">
                <SelectValue placeholder="跟投状态" />
              </SelectTrigger>
              <SelectContent>
                {SETTLEMENT_STATUS_OPTIONS.map((opt) => (
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
            <Button
              className="flex-1 lg:flex-none bg-primary hover:bg-primary/90"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              新增跟投
            </Button>
          </div>
        </div>

        {/* 表格 */}
        <InvestmentsTable data={data} onRowClick={handleRowClick} />

        {/* 底部计数 */}
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>
            显示 {data.length} 条记录 (共 {total} 条)
          </span>
        </div>
      </div>

      {createOpen && (
        <CreateInvestmentDialog
          open={createOpen}
          onOpenChange={handleCreateOpenChange}
          prefillProjectId={query.project_id || undefined}
        />
      )}
    </>
  );
}
