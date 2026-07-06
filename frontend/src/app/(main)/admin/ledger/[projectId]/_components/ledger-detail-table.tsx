"use client";

import * as React from "react";
import { Trash2, Loader2 } from "lucide-react";
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
import { deleteRecord } from "../../actions";
import type { components } from "@/lib/api-types";

type CashFlowRecordResponse = components["schemas"]["CashFlowRecordResponse"];

interface LedgerDetailTableProps {
  projectId: string;
  data: CashFlowRecordResponse[];
}

type FilterTab = "all" | "income" | "expense";

export function LedgerDetailTable({
  projectId,
  data,
}: LedgerDetailTableProps) {
  const [filter, setFilter] = React.useState<FilterTab>("all");
  const [searchInput, setSearchInput] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all");
  const [deleteTarget, setDeleteTarget] =
    React.useState<CashFlowRecordResponse | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

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

  return (
    <div className="space-y-4">
      {/* Tabs 筛选 + 搜索 + 分类筛选 */}
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
        <div className="flex w-full sm:w-auto items-center gap-2">
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
        </div>
      </div>

      {/* 筛选汇总条 */}
      <div
        className="bg-muted/30 rounded-lg px-3 py-2 text-xs text-muted-foreground tabular-nums"
        aria-live="polite"
      >
        共 {summary.count} 笔 · 合计 {formatCNY(summary.total)}
      </div>

      {/* 表格 */}
      <div className="rounded-3xl border border-border bg-card overflow-x-auto shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[110px] text-xs">日期</TableHead>
              <TableHead className="w-[90px] text-center text-xs">交易形式</TableHead>
              <TableHead className="w-[140px] text-xs">交易方</TableHead>
              <TableHead className="w-[140px] text-right text-xs">金额</TableHead>
              <TableHead className="w-[120px] text-center text-xs">票据</TableHead>
              <TableHead className="text-xs">备注</TableHead>
              <TableHead className="w-[60px] text-center text-xs">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
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
                  <TableCell className="py-3">
                    <span className="font-medium text-foreground">
                      {record.date
                        ? safeFormatDate(record.date, "yyyy-MM-dd")
                        : "-"}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
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
                  <TableCell>
                    <span
                      className="text-muted-foreground truncate block max-w-[140px]"
                      title={record.counterparty ?? ""}
                    >
                      {record.counterparty || "-"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        "font-mono font-medium text-sm",
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
                  <TableCell className="text-center">
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
                                  width={32}
                                  height={32}
                                  loading="lazy"
                                  className="size-8 rounded object-cover border border-border"
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
                  <TableCell>
                    <div
                      className="max-w-[200px] truncate text-muted-foreground"
                      title={record.description ?? ""}
                    >
                      {record.description || "-"}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                      onClick={() => setDeleteTarget(record)}
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
    </div>
  );
}
