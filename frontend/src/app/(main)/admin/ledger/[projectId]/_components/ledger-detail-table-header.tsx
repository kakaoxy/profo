import { TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function LedgerDetailTableHeader() {
  return (
    <TableHeader>
      <TableRow className="bg-fog hover:bg-fog [&_th]:font-medium [&_th]:text-graphite">
        <TableHead className="px-4 py-3 text-xs w-[9%]">日期</TableHead>
        <TableHead className="px-4 py-3 text-xs w-[14%]">科目分类</TableHead>
        <TableHead className="px-4 py-3 text-xs w-[9%]">付款方</TableHead>
        <TableHead className="px-4 py-3 text-xs w-[9%]">收款方</TableHead>
        <TableHead className="px-4 py-3 text-xs w-[13%]">账户</TableHead>
        <TableHead className="px-4 py-3 text-right text-xs w-[10%]">流出</TableHead>
        <TableHead className="px-4 py-3 text-right text-xs w-[10%]">流入</TableHead>
        <TableHead className="px-4 py-3 text-center text-xs w-[6%]">凭证</TableHead>
        <TableHead className="px-4 py-3 text-xs w-[17%]">摘要</TableHead>
        <TableHead className="px-4 py-3 text-center text-xs w-[6%]">操作</TableHead>
      </TableRow>
    </TableHeader>
  );
}
