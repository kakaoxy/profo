"use client";

import { useState, useCallback } from "react";
import { useCurrentDate } from "@/hooks/use-current-date";
import { Copy, Check } from "lucide-react";
import { Project } from "../../../../../types";
import { differenceInDays, parseISO, isValid } from "date-fns";
import { safeFormatDate } from "@/lib/formatters";

interface SummaryReportProps {
  project: Project;
}

interface InfoField {
  key: string;
  label: string;
  value: string;
  full?: boolean;
}

export function SummaryReport({ project }: SummaryReportProps) {
  const [copied, setCopied] = useState(false);
  const today = useCurrentDate();

  const netProfit = Number(project.net_cash_flow) || 0; // 元
  const roi = Number(project.roi) || 0; // %
  const totalInvestment = Number(project.total_investment ?? project.total_expense ?? 0) || 0; // 元

  const signingDateStr = project.signing_date || project.created_at;
  const soldDateStr = project.sold_at || project.sold_date;

  // 项目周期：签约 → 成交
  let projectDays: number | null = null;
  if (signingDateStr) {
    const start = parseISO(signingDateStr);
    if (isValid(start)) {
      const end = soldDateStr ? parseISO(soldDateStr) : (today ?? new Date());
      if (isValid(end)) {
        projectDays = Math.max(0, differenceInDays(end, start));
      }
    }
  }

  // 销售周期：上架 → 成交（优先后端 days_on_market，缺省前端补算）
  let salesDays: number | null = project.days_on_market ?? null;
  if (salesDays == null && project.listing_date && soldDateStr) {
    const start = parseISO(project.listing_date);
    const end = parseISO(soldDateStr);
    if (isValid(start) && isValid(end)) {
      salesDays = Math.max(0, differenceInDays(end, start));
    }
  }

  // 带看 / 出价次数：销售记录可得时渲染（页面未加载销售记录则整行省略）
  const salesRecords = project.sales_records;
  const viewingCount = salesRecords?.filter((r) => r.record_type === "viewing").length;
  const offerCount = salesRecords?.filter((r) => r.record_type === "offer").length;

  // 成交渠道：无渠道数据则整行省略
  const channelName = project.channel_manager?.trim() || null;

  // 经验备注：无专用字段，复用项目备注（notes/remarks），无则整行省略
  const experienceNote = project.notes?.trim() || project.remarks?.trim() || null;

  const fields: InfoField[] = [
    projectDays != null
      ? { key: "project-cycle", label: "项目周期", value: `${projectDays} 天（签约 → 成交）` }
      : null,
    salesDays != null
      ? { key: "sales-cycle", label: "销售周期", value: `${salesDays} 天（上架 → 成交）` }
      : null,
    salesRecords
      ? {
          key: "viewing-offer",
          label: "带看 / 出价",
          value: `${viewingCount} 次带看 · ${offerCount} 次出价`,
        }
      : null,
    channelName ? { key: "channel", label: "成交渠道", value: channelName } : null,
    experienceNote ? { key: "note", label: "经验备注", value: experienceNote, full: true } : null,
  ].filter((f): f is InfoField => f !== null);

  // 复制文案：5 字段内容 + 财务/影像摘要
  const reportLines = [
    `【项目结案报告】`,
    `--------------------------------`,
    `🏠 项目：${project.name}`,
    `📍 地址：${project.address || project.community_name || "--"}`,
    ``,
    `⏱ 周期复盘`,
    projectDays != null ? `• 项目周期：${projectDays} 天（签约 → 成交）` : null,
    salesDays != null ? `• 销售周期：${salesDays} 天（上架 → 成交）` : null,
    salesRecords ? `• 带看 / 出价：${viewingCount} 次带看 · ${offerCount} 次出价` : null,
    channelName ? `• 成交渠道：${channelName}` : null,
    ``,
    `💰 财务复盘`,
    `• 成交价格：¥${Number(project.sold_price || 0).toFixed(1)} 万`,
    `• 投资总额：¥${(totalInvestment / 10000).toFixed(1)} 万`,
    `• 净 利 润：${netProfit >= 0 ? "+" : ""}¥${(netProfit / 10000).toFixed(1)} 万`,
    `• 投资回报：${roi.toFixed(1)}% (ROI)`,
    experienceNote ? `` : null,
    experienceNote ? `📝 经验备注` : null,
    experienceNote ? experienceNote : null,
    ``,
    `📸 影像记录：已归档 ${project.renovation_photos?.length || 0} 张`,
    ``,
    `签约：${safeFormatDate(signingDateStr, "yyyy/MM/dd", "--")} · 成交：${safeFormatDate(soldDateStr, "yyyy/MM/dd", "--")}`,
  ].filter((line): line is string => line !== null);

  const reportContent = reportLines.join("\n");

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(reportContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [reportContent]);

  return (
    <div className="rounded-cards bg-pure-white p-6 shadow-steep-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-base font-[500] text-ink">总结报告</div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#e2e2e5] bg-white px-3.5 py-1.5 text-[13.5px] font-[450] text-ink transition-colors hover:border-dove hover:bg-[#fafafa]"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "已复制" : "复制完整报告"}
        </button>
      </div>

      {/* info-grid：2 列（<md 单列），full 行跨两列 */}
      <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
        {fields.map((field) => (
          <div
            key={field.key}
            className={`flex flex-col gap-[3px] border-b border-[#f0f0f2] py-[13px] ${
              field.full ? "md:col-span-2" : ""
            }`}
          >
            <span className="text-[13px] font-[430] text-graphite">{field.label}</span>
            <span className="text-[14.5px] font-[450] leading-relaxed text-ink">{field.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
