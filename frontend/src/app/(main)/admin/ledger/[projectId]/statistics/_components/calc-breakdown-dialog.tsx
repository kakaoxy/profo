"use client";

import * as React from "react";
import type { components } from "@/lib/api-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber, formatPercent } from "./format";

type CalcBreakdown = components["schemas"]["LedgerStatisticsCalcBreakdown"];
type CalcSection = components["schemas"]["LedgerStatisticsCalcSection"];
type CalcItem = components["schemas"]["LedgerStatisticsCalcItem"];

interface CalcBreakdownDialogProps {
  breakdown: CalcBreakdown;
  children: React.ReactNode;
}

/** 业务形态标签映射：null/undefined → 代理美化 */
function getBusinessFormLabel(businessForm: string | null | undefined): string {
  if (businessForm === "agent") return "代理美化";
  if (businessForm === "wholesale") return "收购美化";
  return "代理美化";
}

/** 按 result_type 格式化区段结果 */
function formatSectionResult(section: CalcSection): string {
  switch (section.result_type) {
    case "currency":
      return formatCurrency(section.result);
    case "days":
      return `${formatNumber(section.result)}天`;
    case "percent":
      return formatPercent(section.result);
    case "number":
      return formatNumber(section.result);
    default:
      return String(section.result);
  }
}

/** 计算明细项取值：优先 amount，其次 text */
function formatItemValue(item: CalcItem): string | null {
  if (item.amount != null) return formatCurrency(item.amount);
  if (item.text != null) return item.text;
  return null;
}

export function CalcBreakdownDialog({
  breakdown,
  children,
}: CalcBreakdownDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>五层法计算明细</DialogTitle>
        </DialogHeader>
        <div className="flex items-center">
          <Badge variant="secondary">
            {getBusinessFormLabel(breakdown.business_form)}
          </Badge>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {breakdown.sections.map((section, index) => (
            <section
              key={index}
              className={
                index > 0 ? "mt-4 pt-4 border-t border-border" : undefined
              }
            >
              <h3 className="font-medium text-sm">{section.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                {section.formula}
              </p>
              <ul className="mt-2 space-y-1">
                {section.items.map((item, itemIndex) => {
                  const value = formatItemValue(item);
                  if (value == null) return null;
                  return (
                    <li
                      key={itemIndex}
                      className="flex items-baseline justify-between gap-3 text-sm"
                    >
                      <span className="text-graphite">
                        {item.sign ? (
                          <span className="mr-1">{item.sign}</span>
                        ) : null}
                        {item.label}
                      </span>
                      <span className="tabular-nums text-ink">{value}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-baseline justify-between gap-3 mt-2 pt-2 border-t border-border/60">
                <span className="text-sm font-medium">结果</span>
                <span className="tabular-nums text-sm font-medium text-ink">
                  {formatSectionResult(section)}
                </span>
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
