import {
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function LedgerDetailTableHeader() {
  return (
    <TableHeader>
      <TableRow className="bg-muted/50 hover:bg-muted/50">
        <TableHead className="px-4 py-3 text-xs w-[10%]">日期</TableHead>
        <TableHead className="px-4 py-3 text-xs w-[22%]">摘要</TableHead>
        <TableHead className="px-4 py-3 text-xs w-[16%]">科目分类</TableHead>
        <TableHead className="px-4 py-3 text-xs w-[9%]">付款方</TableHead>
        <TableHead className="px-4 py-3 text-xs w-[9%]">收款方</TableHead>
        <TableHead className="px-4 py-3 text-right text-xs w-[11%]">流出</TableHead>
        <TableHead className="px-4 py-3 text-right text-xs w-[11%]">流入</TableHead>
        <TableHead className="px-4 py-3 text-center text-xs w-[6%]">凭证</TableHead>
        <TableHead className="px-4 py-3 text-center text-xs w-[6%]">操作</TableHead>
      </TableRow>
    </TableHeader>
  );
}
