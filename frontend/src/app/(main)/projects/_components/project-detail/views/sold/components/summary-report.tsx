"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Quote, Copy, Check } from "lucide-react";
import { Project } from "../../../../../types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { differenceInDays, parseISO, format } from "date-fns";

interface SummaryReportProps {
  project: Project;
}

export function SummaryReport({ project }: SummaryReportProps) {
  const [copied, setCopied] = useState(false);

  const netProfit = Number(project.net_cash_flow) || 0;
  const roi = Number(project.roi) || 0;
  const totalInvestment = Number(project.total_expense) || 0;

  const signingDate = project.signing_date || project.created_at;
  const soldDateStr = project.sold_at || project.sold_date;

  let occupationDays = 0;
  if (signingDate) {
    const start = parseISO(signingDate);
    const end = soldDateStr ? parseISO(soldDateStr) : new Date();
    occupationDays = Math.max(0, differenceInDays(end, start));
  }

  const formatSimpleDate = useCallback((dStr: string | null | undefined) => {
    if (!dStr) return "--";
    try {
      return format(parseISO(dStr), "yyyy/MM/dd");
    } catch {
      return "--";
    }
  }, []);

  const reportContent = `【项目结案喜报】🎉
--------------------------------
🏠 项目：${project.name}
📍 地址：${project.address || project.community_name || "--"}

💰 财务复盘
• 成交价格：¥${Number(project.sold_price || 0).toFixed(1)} 万
• 投资总额：¥${(totalInvestment / 10000).toFixed(1)} 万
• 净 利 润：${netProfit >= 0 ? "+" : ""}¥${(netProfit / 10000).toFixed(1)} 万 
• 投资回报：${roi.toFixed(1)}% (ROI)

⏱ 项目周期
• 拿房日期：${formatSimpleDate(signingDate)}
• 售出日期：${formatSimpleDate(soldDateStr)}
• 历时天数：${occupationDays} 天

📸 影像记录：已归档 ${project.renovation_photos?.length || 0} 张

感谢团队的辛勤付出！🚀`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(reportContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [reportContent]);

  return (
    <Card className="border-slate-200 shadow-sm flex flex-col h-full bg-slate-50/50">
      <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold flex items-center gap-2 text-slate-700">
          <Quote className="h-4 w-4 text-red-400 rotate-180" />
          项目结案简报
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-2 font-medium transition-all group",
            copied ? "border-emerald-500 text-emerald-600 bg-emerald-50" : "hover:border-slate-400"
          )}
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              已复制
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600" />
              复制完整报告
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className="p-5">
        <div className="bg-white rounded-lg border border-slate-200 shadow-inner p-6 font-mono text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
          {reportContent}
        </div>
      </CardContent>
    </Card>
  );
}
