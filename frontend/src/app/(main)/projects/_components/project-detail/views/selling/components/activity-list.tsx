"use client";

import { format, parseISO } from "date-fns";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SalesRecord } from "../../../../../types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ActivityListProps {
  type: "viewing" | "offer" | "negotiation";
  data: SalesRecord[];
  onDelete: (id: string) => void;
}

export function ActivityList({ type, data, onDelete }: ActivityListProps) {
  // 按时间倒序排列
  const sortedData = [...data].sort(
    (a, b) =>
      new Date(b.record_date).getTime() - new Date(a.record_date).getTime()
  );

  if (data.length === 0) {
    return (
      <div className="text-center text-xs text-muted-foreground py-8 border border-dashed border-slate-200 rounded-md bg-slate-50/50">
        暂无{type === "viewing" ? "带看" : type === "offer" ? "出价" : "面谈"}
        记录
      </div>
    );
  }

  // 1. 带看记录 (表格视图)
  if (type === "viewing") {
    return (
      <div className="rounded-md border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
              <TableHead className="w-[120px] text-xs">时间</TableHead>
              <TableHead className="text-xs">带看人/机构</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item) => (
              <TableRow key={item.id} className="text-xs hover:bg-slate-50">
                <TableCell className="text-muted-foreground font-mono">
                  {format(parseISO(item.record_date), "MM-dd HH:mm")}
                </TableCell>
                <TableCell className="font-medium text-slate-700">
                  {item.customer_name}
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => onDelete(item.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  // 2. 出价记录 (卡片视图)
  if (type === "offer") {
    const maxPrice = Math.max(...data.map((b) => b.price || 0));
    return (
      <div className="space-y-2">
        {sortedData.map((item) => {
          const isMax = (item.price || 0) === maxPrice;
          return (
            <div
              key={item.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border bg-white transition-all",
                isMax
                  ? "border-red-100 shadow-sm ring-1 ring-red-50"
                  : "border-slate-100"
              )}
            >
              <div className="flex flex-col">
                <span
                  className={cn(
                    "text-sm font-bold",
                    isMax
                      ? "text-red-600 flex items-center gap-1"
                      : "text-slate-700"
                  )}
                >
                  ¥{item.price}万{" "}
                  {isMax && (
                    <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded font-normal">
                      最高
                    </span>
                  )}
                </span>
              </div>
              <div className="flex flex-col text-right mr-4 flex-1">
                <span className="text-xs font-medium text-slate-700">
                  {item.customer_name}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {format(parseISO(item.record_date), "MM-dd HH:mm")}
                </span>
              </div>
              <button
                onClick={() => onDelete(item.id)}
                className="text-slate-300 hover:text-red-500 p-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  // 3. 面谈记录 (时间轴视图)
  return (
    <div className="relative pl-4 space-y-6 pb-2 mt-4">
      <div className="absolute left-[5px] top-2 bottom-2 w-0.5 bg-slate-200" />
      {sortedData.map((item) => (
        <div key={item.id} className="relative pl-4 group">
          <div className="absolute left-[-4px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-emerald-500 bg-white group-hover:bg-emerald-500 transition-colors z-10" />
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-mono">
                {format(parseISO(item.record_date), "yyyy/MM/dd HH:mm")}
              </span>
              <button
                onClick={() => onDelete(item.id)}
                className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            <div className="text-sm font-bold text-slate-800">
              {item.customer_name}
            </div>
            {item.notes && (
              <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded mt-1 border border-slate-100">
                {item.notes}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
