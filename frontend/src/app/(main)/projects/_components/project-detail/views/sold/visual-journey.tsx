"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Quote, ImageIcon, Copy, Check } from "lucide-react";
import { Project } from "../../../../types";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RENOVATION_STAGES } from "../../constants";
import { cn } from "@/lib/utils";
import { differenceInDays, parseISO, format } from "date-fns";
import { getFileUrl } from "../../utils";

export function VisualJourney({ project }: { project: Project }) {
  const photos = project.renovation_photos || [];
  const stageDates = project.renovationStageDates || {};

  // 按阶段分组照片
  const groupedPhotos = RENOVATION_STAGES.map((stage) => {
    const stagePhotos = photos.filter(
      (p) => p.stage === stage.value || p.stage === stage.key
    );
    const date = stageDates[stage.value];
    return {
      ...stage,
      photos: stagePhotos,
      date: date || null,
    };
  }).filter((s) => s.photos.length > 0);

  const totalPhotos = photos.length;

  return (
    <Card className="border-slate-200 shadow-sm flex flex-col overflow-hidden">
      <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-slate-500" />
          项目蜕变影像 (Visual Journey)
        </CardTitle>
        <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
          📸 全生命周期影像记录 (共 {totalPhotos} 张)
        </span>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex p-6 gap-6">
            {groupedPhotos.length > 0 ? (
              groupedPhotos.map((stage, idx) => (
                <div key={stage.key} className="flex-none w-[200px] group">
                  <Dialog>
                    <DialogTrigger asChild>
                      <div className="relative rounded-xl overflow-hidden shadow-sm transition-all hover:shadow-md cursor-zoom-in ring-1 ring-slate-100">
                        <AspectRatio ratio={4 / 3}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={getFileUrl(stage.photos[0].url)}
                            alt={stage.label}
                            className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-110"
                          />
                        </AspectRatio>
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                          <Badge className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white text-[10px] border-0 h-5">
                            {stage.photos.length} 张
                          </Badge>
                        </div>
                      </div>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl p-0 bg-black/90 border-0 overflow-hidden">
                      <DialogHeader className="sr-only">
                        <DialogTitle>{stage.label} 影像记录</DialogTitle>
                        <DialogDescription>
                          正在查看 {stage.label} 阶段的照片背景。
                        </DialogDescription>
                      </DialogHeader>
                      <ScrollArea className="max-h-[80vh]">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                          {stage.photos.map((p, i) => (
                            <div key={i} className="relative aspect-video rounded-lg overflow-hidden">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={getFileUrl(p.url)} className="object-contain w-full h-full" alt="" />
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>
                  
                  <div className="mt-4 space-y-1 pl-1">
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-900" />
                      <span className="text-sm font-bold text-slate-700">
                        {idx + 1}. {stage.value}{stage.label.includes("阶段") ? "" : "阶段"}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-slate-400 pl-3">
                      ({stage.date ? format(parseISO(stage.date), "MM/dd") : "--/--"})
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="w-full py-12 flex flex-col items-center justify-center text-slate-400">
                <ImageIcon className="h-8 w-8 mb-2 opacity-30" />
                <span className="text-xs">暂无影像记录</span>
              </div>
            )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export function SummaryReport({ project }: { project: Project }) {
  const [copied, setCopied] = useState(false);

  const netProfit = Number(project.net_cash_flow) || 0;
  const roi = Number(project.roi) || 0;
  const totalInvestment = Number(project.total_expense) || 0;
  
  const signingDate = (project.signing_date || project.created_at);
  const soldDateStr = (project.sold_at || project.sold_date);
  
  let occupationDays = 0;
  if (signingDate) {
    const start = parseISO(signingDate);
    const end = soldDateStr ? parseISO(soldDateStr) : new Date();
    occupationDays = Math.max(0, differenceInDays(end, start));
  }

  const formatSimpleDate = (dStr: string | null | undefined) => {
    if (!dStr) return "--";
    try {
      return format(parseISO(dStr), "yyyy/MM/dd");
    } catch {
      return "--";
    }
  };

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

  const handleCopy = () => {
    navigator.clipboard.writeText(reportContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
