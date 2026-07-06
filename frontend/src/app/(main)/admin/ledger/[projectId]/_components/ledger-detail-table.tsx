"use client";

import * as React from "react";
import { Trash2, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { safeFormatDate } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [deleteTarget, setDeleteTarget] =
    React.useState<CashFlowRecordResponse | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const filteredData = React.useMemo(() => {
    if (filter === "all") return data;
    return data.filter((item) => item.type === filter);
  }, [data, filter]);

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
      {/* Tabs 筛选 */}
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

      {/* 表格 */}
      <div className="rounded-md border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[120px] text-xs">日期</TableHead>
              <TableHead className="w-[120px] text-xs">分类</TableHead>
              <TableHead className="w-[120px] text-xs">交易方</TableHead>
              <TableHead className="text-right text-xs">金额</TableHead>
              <TableHead className="w-[60px] text-center text-xs">票据</TableHead>
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
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-normal",
                        record.type === "income"
                          ? "border-error/30 text-red-700 bg-error-container/30"
                          : "border-emerald-200 text-emerald-700 bg-success-container/30",
                      )}
                    >
                      {record.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span
                      className="text-muted-foreground truncate block max-w-[120px]"
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
                    {record.receipt_url ? (
                      <a
                        href={record.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                        title="查看票据"
                      >
                        <FileText className="h-4 w-4" />
                      </a>
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
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setDeleteTarget(record)}
                      title="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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
                  删除中...
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
