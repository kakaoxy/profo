// src/app/(main)/projects/[projectId]/cashflow/_components/ledger-table.tsx
"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Download, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { deleteCashFlowRecordAction } from "../actions";
import { toast } from "sonner";

import { CashFlowRecord } from "../types";
import { AddRecordDialog } from "./add-record-dialog";

interface LedgerTableProps {
  projectId: string;
  data: CashFlowRecord[];
  onRefresh?: () => void;
}

export function LedgerTable({ projectId, data, onRefresh }: LedgerTableProps) {
  const [filter, setFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredData = data.filter((item) => {
    if (filter === "all") return true;
    if (filter === "income") return item.type === "income";
    if (filter === "expense") return item.type === "expense";
    if (filter === "renovation") return item.category.includes("装修");
    if (filter === "operation") return item.category.includes("运营");
    return true;
  });

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这条记录吗？")) return;
    const res = await deleteCashFlowRecordAction(projectId, id);
    if (res.success) {
      toast.success("已删除");
      if (onRefresh) onRefresh();
    } else {
      toast.error("删除失败");
    }
  };

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Tabs
          defaultValue="all"
          value={filter}
          onValueChange={setFilter}
          className="w-full sm:w-auto"
        >
          <TabsList className="bg-slate-100 p-1 h-9">
            <TabsTrigger value="all" className="text-xs h-7">
              全部
            </TabsTrigger>
            {/* 收入 Tab：红色 */}
            <TabsTrigger
              value="income"
              className="text-xs h-7 text-red-700 data-[state=active]:text-red-700"
            >
              收入
            </TabsTrigger>
            {/* 支出 Tab：绿色 */}
            <TabsTrigger
              value="expense"
              className="text-xs h-7 text-emerald-700 data-[state=active]:text-emerald-700"
            >
              支出
            </TabsTrigger>
            <TabsTrigger value="renovation" className="text-xs h-7">
              仅看装修
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" className="h-9 text-xs">
            <Download className="h-3.5 w-3.5 mr-2" />
            导出 Excel
          </Button>
          <Button
            size="sm"
            className="h-9 bg-slate-900 hover:bg-slate-800 text-xs"
            onClick={() => setIsDialogOpen(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            记一笔
          </Button>
        </div>
      </div>

      {/* 表格内容 */}
      <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
              <TableHead className="w-[120px] text-xs">日期</TableHead>
              <TableHead className="w-[100px] text-xs">分类</TableHead>
              <TableHead className="text-xs">说明</TableHead>
              <TableHead className="text-right text-xs">金额</TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-xs text-muted-foreground"
                >
                  暂无记录
                </TableCell>
              </TableRow>
            ) : (
              filteredData.map((record) => (
                <TableRow
                  key={record.id}
                  className="group text-xs hover:bg-slate-50"
                >
                  <TableCell className="py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-700">
                        {format(parseISO(record.date), "yyyy-MM-dd")}
                      </span>
                      <span className="text-[10px] text-slate-400 mt-0.5">
                        {format(parseISO(record.date), "EEEE", {
                          locale: zhCN,
                        })}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-normal",
                        record.type === "income"
                          ? "border-red-200 text-red-700 bg-red-50/30"
                          : "border-emerald-200 text-emerald-700 bg-emerald-50/30"
                      )}
                    >
                      {record.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div
                      className="max-w-[200px] truncate text-slate-600"
                      title={record.notes}
                    >
                      {record.notes || "-"}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        "font-mono font-medium text-sm",
                        record.type === "income"
                          ? "text-red-600"
                          : "text-emerald-600"
                      )}
                    >
                      {record.type === "income" ? "+" : "-"}
                      {record.amount.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="w-[40px]">
                    <button
                      onClick={() => handleDelete(record.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AddRecordDialog
        projectId={projectId}
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        // [修复] 传递 onSuccess 回调
        onSuccess={() => {
          if (onRefresh) onRefresh();
        }}
      />
    </div>
  );
}
