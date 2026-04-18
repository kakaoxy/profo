"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { BrawlItem } from "../../../actions/monitor-lib/types";
import type { SortConfig } from "./types";
import { SortIcon } from "./sort-icon";

interface CompetitorsTableProps {
  items: BrawlItem[];
  sortConfig: SortConfig;
  onSort: (key: "total" | "unit") => void;
}

export function CompetitorsTable({
  items,
  sortConfig,
  onSort,
}: CompetitorsTableProps) {
  return (
    <div className="overflow-x-auto scrollbar-hide">
      <Table className="min-w-[1000px]">
        <TableHeader className="bg-slate-50/50">
          <TableRow className="hover:bg-transparent border-b border-slate-100">
            <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              房源 ID
            </TableHead>
            <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              小区 / 状态
            </TableHead>
            <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              户型 / 朝向
            </TableHead>
            <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              面积 (㎡)
            </TableHead>
            <TableHead
              className="py-4 px-4 text-[10px] font-bold text-rose-500 uppercase tracking-wider cursor-pointer select-none hover:bg-slate-100 transition-colors"
              onClick={() => onSort("total")}
            >
              <div className="flex items-center">
                总价 (万)
                <SortIcon column="total" sortConfig={sortConfig} />
              </div>
            </TableHead>
            <TableHead
              className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:bg-slate-100 transition-colors"
              onClick={() => onSort("unit")}
            >
              <div className="flex items-center">
                单价 (元/㎡)
                <SortIcon column="unit" sortConfig={sortConfig} />
              </div>
            </TableHead>
            <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              挂牌/成交日期
            </TableHead>
            <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">
              操作
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-slate-50">
          {items.map((item) => (
            <TableRow
              key={item.id}
              className={`${item.is_current ? "bg-indigo-50/40" : "hover:bg-slate-50"} transition-colors border-none`}
            >
              <TableCell className="py-4 px-4 font-mono text-xs text-slate-400 font-bold">
                {item.id.length > 10
                  ? `#${item.id.slice(0, 6)}...`
                  : `#${item.id}`}
              </TableCell>
              <TableCell className="py-4 px-4 text-xs">
                <div className="flex flex-col">
                  <span className="font-bold text-slate-800">
                    {item.community}
                  </span>
                  <span
                    className={`text-[10px] font-bold ${item.status === "on_sale" ? "text-amber-500" : "text-emerald-500"}`}
                  >
                    ●{" "}
                    {item.display_status ||
                      (item.status === "on_sale" ? "在售" : "已成交")}
                  </span>
                </div>
              </TableCell>
              <TableCell className="py-4 px-4 text-xs font-bold text-slate-600">
                {item.layout} · {item.floor}
              </TableCell>
              <TableCell className="py-4 px-4 text-xs font-black text-slate-800">
                {item.area}
              </TableCell>
              <TableCell className="py-4 px-4 text-sm font-black text-rose-600">
                ¥ {item.total}
              </TableCell>
              <TableCell className="py-4 px-4 text-xs font-bold text-slate-500">
                ¥ {item.unit.toLocaleString()}
              </TableCell>
              <TableCell className="py-4 px-4 text-[10px] text-slate-400 font-medium font-mono">
                {item.date}
              </TableCell>
              <TableCell className="py-4 px-4 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-lg hover:bg-slate-100 text-[10px] font-bold text-indigo-600"
                >
                  查看详情
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
