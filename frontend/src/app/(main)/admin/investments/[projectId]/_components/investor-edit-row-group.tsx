"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCNY, formatPercent } from "@/lib/formatters";
import { type LocalInvestor, type LocalSubInvestor } from "./investor-dialog";
import { InvestorTypeIcon, RATIO_EPS } from "./shared";
import { RatioInput } from "./ratio-input";

/** 编辑态投资方行组（母投资方 + 子投资人 + 小计） */
export function InvestorEditRowGroup({
  inv,
  idx,
  amount,
  subs,
  subAmountSum,
  onRatioChange,
  onEdit,
  onAddSub,
  onDeleteInvestor,
  onDeleteSub,
  disabled,
}: {
  inv: LocalInvestor;
  idx: number;
  amount: number;
  subs: LocalSubInvestor[];
  subAmountSum: number;
  onRatioChange: (idx: number, n: number) => void;
  onEdit: (idx: number) => void;
  onAddSub: (idx: number) => void;
  onDeleteInvestor: (idx: number, name: string) => void;
  onDeleteSub: (investorIdx: number, subIdx: number, name: string) => void;
  disabled: boolean;
}) {
  const subRatioSum = subs.reduce((s, sub) => s + sub.share_ratio, 0);
  return (
    <>
      <TableRow className="bg-muted/30 hover:bg-muted/40">
        <TableCell>
          <div className="flex items-center gap-2.5">
            <InvestorTypeIcon type={inv.type} />
            <span className="font-medium">{inv.name}</span>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <RatioInput
              value={inv.share_ratio}
              onChange={(n) => onRatioChange(idx, n)}
              className="h-8 w-24 font-mono tabular-nums"
            />
            <span className="text-sm font-medium text-muted-foreground">%</span>
          </div>
        </TableCell>
        <TableCell className="font-mono tabular-nums text-right">
          {formatCNY(amount)}
        </TableCell>
        <TableCell className="text-center">
          {subs.length > 0 ? `${subs.length}人` : "—"}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1.5 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-secondary"
              onClick={() => onAddSub(idx)}
              disabled={disabled}
              title="添加子投资人"
            >
              <Plus className="h-3.5 w-3.5" />
              子投资人
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => onEdit(idx)}
              disabled={disabled}
              title="编辑"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => onDeleteInvestor(idx, inv.name)}
              disabled={disabled}
              title="删除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {subs.map((sub, j) => {
        const subAmount = (amount * sub.share_ratio) / 100;
        return (
          <TableRow
            key={`${idx}-${j}`}
            className="border-l-2 border-accent hover:bg-transparent"
          >
            <TableCell className="pl-12 font-normal text-muted-foreground">
              {sub.name}
            </TableCell>
            <TableCell className="pl-12 font-mono tabular-nums font-normal text-muted-foreground">
              {formatPercent(sub.share_ratio)}
            </TableCell>
            <TableCell className="pl-12 font-mono tabular-nums text-right font-normal text-muted-foreground">
              {formatCNY(subAmount)}
            </TableCell>
            <TableCell className="pl-12 text-center text-muted-foreground">—</TableCell>
            <TableCell className="pl-12 text-right">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => onDeleteSub(idx, j, sub.name)}
                disabled={disabled}
                title="删除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TableCell>
          </TableRow>
        );
      })}
      {subs.length > 0 && (
        <TableRow className="border-t border-dashed border-border hover:bg-transparent">
          <TableCell className="pl-12 italic text-muted-foreground text-sm">
            小计
          </TableCell>
          <TableCell
            className={cn(
              "pl-12 font-mono tabular-nums italic text-muted-foreground text-sm",
              Math.abs(subRatioSum - 100) > RATIO_EPS && "text-red-500",
            )}
          >
            {formatPercent(subRatioSum)}
          </TableCell>
          <TableCell className="pl-12 font-mono tabular-nums text-right italic text-muted-foreground text-sm">
            {formatCNY(subAmountSum)}
          </TableCell>
          <TableCell className="pl-12 text-center text-muted-foreground">—</TableCell>
          <TableCell />
        </TableRow>
      )}
    </>
  );
}
