"use client";

import {
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function LedgerDetailTableHeader() {
  return (
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
  );
}
