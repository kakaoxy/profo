"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, Download, Plus, Lock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { safeFormatDate, formatCNY } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RecordDialog } from "@/components/finance/record-dialog";
import { SettlementDialog } from "./settlement-dialog";
import { deleteRecord, exportProjectLedger } from "../../actions";
import type { components } from "@/lib/api-types";

type CashFlowRecordResponse = components["schemas"]["CashFlowRecordResponse"];
type SettlementStatus = components["schemas"]["SettlementStatus"];

interface LedgerDetailTableProps {
  projectId: string;
  data: CashFlowRecordResponse[];
  businessForm?: "agent" | "wholesale" | null;
  settlementStatus?: SettlementStatus | null;
}

type FilterTab = "all" | "income" | "expense";

export function LedgerDetailTable({
  projectId,
  data,
  businessForm,
  settlementStatus,
}: LedgerDetailTableProps) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<FilterTab>("all");
  const [searchInput, setSearchInput] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all");
  const [deleteTarget, setDeleteTarget] =
    React.useState<CashFlowRecordResponse | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [showSettlementDialog, setShowSettlementDialog] =
    React.useState(false);

  const isSettled = settlementStatus === "settled";

  // 交易方搜索 300ms 防抖
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 分类选项来自 data 去重
  const categoryOptions = React.useMemo(() => {
    const set = new Set<string>();
    data.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set);
  }, [data]);

  const filteredData = React.useMemo(() => {
    const keyword = debouncedSearch.trim().toLowerCase();
    return data.filter((item) => {
      // 1. Tabs（all/income/expense）
      if (filter !== "all" && item.type !== filter) return false;
      // 2. 交易方模糊搜索（大小写不敏感）
      if (keyword) {
        const cp = (item.counterparty ?? "").toLowerCase();
        if (!cp.includes(keyword)) return false;
      }
      // 3. 分类精确匹配
      if (categoryFilter !== "all" && item.category !== categoryFilter)
        return false;
      return true;
    });
  }, [data, filter, debouncedSearch, categoryFilter]);

  // 筛选汇总：笔数与代数和（收入为正、支出为负）
  const summary = React.useMemo(() => {
    const total = filteredData.reduce((sum, item) => {
      const amt = Number(item.amount) || 0;
      return sum + (item.type === "income" ? amt : -amt);
    }, 0);
    return { count: filteredData.length, total };
  }, [filteredData]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await deleteRecord(deleteTarget.id, projectId);
      if (res.success) {
        toast.success("已删除");
        setDeleteTarget(null);
      } else {
        toast.error(res.message || "删除失败");
      }
    } catch {
      toast.error("删除失败，请稍后重试");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await exportProjectLedger(projectId);
      if (!res.success) {
        toast.error(res.message || "导出失败");
        return;
      }
      const blob = new Blob([res.data], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      a.download = `资金账本_${projectId.slice(0, 8)}_${today}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("导出成功");
    } catch {
      toast.error("导出失败，请稍后重试");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tabs 筛选 + 搜索 + 分类筛选 + 操作按钮 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v as FilterTab)}
          className="w-full sm:w-auto"
        >
          <TabsList className="bg-muted p-1 h-9">
            <TabsTrigger value="all" className="text-xs h-7">
              全部
            </TabsTrigger>
            <TabsTrigger
              value="income"
              className="text-xs h-7 text-error data-[state=active]:text-error"
            >
              收入
            </TabsTrigger>
            <TabsTrigger
              value="expense"
              className="text-xs h-7 text-success data-[state=active]:text-success"
            >
              支出
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex w-full sm:w-auto items-center gap-2 flex-wrap">
          <Input
            placeholder="搜索交易方…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 w-full sm:w-56 bg-card border-border"
            aria-label="搜索交易方"
            name="counterparty-search"
            autoComplete="off"
          />
          <Select
            value={categoryFilter}
            onValueChange={setCategoryFilter}
          >
            <SelectTrigger
              className="h-9 w-[140px] bg-card border-border"
              aria-label="筛选分类"
            >
              <SelectValue placeholder="全部分类" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分类</SelectItem>
              {categoryOptions.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 rounded-full text-ink hover:text-rust hover:bg-transparent"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            导出
          </Button>
          <Button
            size="sm"
            className="h-9 gap-1.5 rounded-full bg-ink text-pure-white hover:bg-ink/90"
            onClick={() => setIsDialogOpen(true)}
            disabled={isSettled}
            title={isSettled ? "已结算，不可记账" : undefined}
          >
            <Plus className="h-4 w-4" />
            记一笔
          </Button>
          {settlementStatus && (
            <Badge
              variant="secondary"
              className={cn(
                "gap-1.5 border-transparent px-3 py-1",
                isSettled
                  ? "bg-apricot-wash text-rust"
                  : "bg-fog text-graphite",
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  isSettled ? "bg-rust" : "bg-graphite animate-pulse",
                )}
              />
              {isSettled ? "已结算" : "未结算"}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-9 gap-1.5 rounded-full",
              isSettled
                ? "text-rust hover:text-rust hover:bg-apricot-wash/50"
                : "bg-ink text-pure-white hover:bg-ink/90",
            )}
            onClick={() => setShowSettlementDialog(true)}
          >
            {isSettled ? "反结算" : "结算"}
          </Button>
        </div>
      </div>

      {/* 筛选汇总条 */}
      <div
        className="bg-muted/30 rounded-lg px-3 py-2 text-xs text-muted-foreground tabular-nums"
        aria-live="polite"
      >
        共 {summary.count} 笔 · 合计 {formatCNY(summary.total)}
      </div>

      {/* 已结算编辑锁警示条 */}
      {isSettled && (
        <div className="flex items-center gap-2 rounded-lg bg-apricot-wash border border-rust/30 px-4 py-2.5 text-sm text-rust">
          <Lock className="h-4 w-4 shrink-0" />
          <span>该资金账本已结算，不可编辑。如需修改请先反结算。</span>
        </div>
      )}

      {/* 表格 */}
      <div className="rounded-3xl border border-border bg-card overflow-x-auto shadow-sm">
        <Table className="table-fixed w-full">
          <colgroup>
            <col className="w-[10%]" />
            <col className="w-[8%]" />
            <col className="w-[13%]" />
            <col className="w-[13%]" />
            <col className="w-[13%]" />
            <col className="w-[11%]" />
            <col className="w-[26%]" />
            <col className="w-[6%]" />
          </colgroup>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="px-4 py-3 text-xs">日期</TableHead>
              <TableHead className="px-4 py-3 text-center text-xs">交易形式</TableHead>
              <TableHead className="px-4 py-3 text-xs">交易方</TableHead>
              <TableHead className="px-4 py-3 text-xs">分类</TableHead>
              <TableHead className="px-4 py-3 text-right text-xs">金额</TableHead>
              <TableHead className="px-4 py-3 text-center text-xs">票据</TableHead>
              <TableHead className="px-4 py-3 text-xs">备注</TableHead>
              <TableHead className="px-4 py-3 text-center text-xs">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-xs text-muted-foreground"
                >
                  暂无记录
                </TableCell>
              </TableRow>
            ) : (
              filteredData.map((record) => (
                <TableRow
                  key={record.id}
                  className="group text-xs hover:bg-muted"
                >
                  <TableCell className="px-4 py-3">
                    <span className="font-medium text-foreground">
                      {record.date
                        ? safeFormatDate(record.date, "yyyy-MM-dd")
                        : "-"}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-normal",
                        record.type === "income"
                          ? "border-error/30 text-red-700 bg-error-container/30"
                          : "border-emerald-200 text-emerald-700 bg-success-container/30",
                      )}
                    >
                      {record.type === "income" ? "收入" : "支出"}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <span
                      className="text-muted-foreground truncate block"
                      title={record.counterparty ?? ""}
                    >
                      {record.counterparty || "-"}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <span
                      className="text-foreground truncate block"
                      title={record.category ?? ""}
                    >
                      {record.category || "-"}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <span
                      className={cn(
                        "font-mono font-medium text-sm tabular-nums",
                        record.type === "income"
                          ? "text-error"
                          : "text-success",
                      )}
                    >
                      {record.type === "income" ? "+" : "-"}
                      {Number(record.amount).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {record.receipt_urls && record.receipt_urls.length > 0 ? (
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {record.receipt_urls.map((url, idx) => (
                          <HoverCard key={url + idx}>
                            <HoverCardTrigger asChild>
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`查看票据 ${idx + 1}`}
                                aria-label={`查看票据 ${idx + 1}`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={url}
                                  alt={`票据 ${idx + 1}`}
                                  width={28}
                                  height={28}
                                  loading="lazy"
                                  className="size-7 rounded object-cover border border-border"
                                />
                              </a>
                            </HoverCardTrigger>
                            <HoverCardContent className="p-1 w-auto">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt={`票据 ${idx + 1}`}
                                className="rounded-lg border max-w-[320px] h-auto"
                              />
                            </HoverCardContent>
                          </HoverCard>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div
                      className="truncate text-muted-foreground"
                      title={record.description ?? ""}
                    >
                      {record.description || "-"}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-7 w-7 p-0 text-muted-foreground hover:text-destructive transition-opacity",
                        isSettled
                          ? "opacity-0 pointer-events-none"
                          : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                      )}
                      onClick={() => setDeleteTarget(record)}
                      disabled={isSettled}
                      aria-label={`删除 ${record.category} 记录`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 删除确认弹窗 */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这条记录吗？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将软删除该流水记录，删除后不可恢复。
              {deleteTarget ? (
                <span className="block mt-2 text-xs">
                  分类：{deleteTarget.category} · 金额：¥
                  {Number(deleteTarget.amount).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  删除中…
                </>
              ) : (
                "确认删除"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RecordDialog
        projectId={projectId}
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSuccess={() => router.refresh()}
        businessForm={businessForm}
      />

      <SettlementDialog
        open={showSettlementDialog}
        onOpenChange={setShowSettlementDialog}
        projectId={projectId}
        mode={isSettled ? "unsettle" : "settle"}
      />
    </div>
  );
}
