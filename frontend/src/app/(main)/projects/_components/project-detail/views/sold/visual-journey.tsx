"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Quote, ImageIcon } from "lucide-react";
import { Project } from "../../../../types";

// VisualJourney 组件保持不变...
export function VisualJourney({ project }: { project: Project }) {
  const photos = project.renovation_photos || [];
  const displayPhotos = photos.slice(0, 4);

  return (
    <Card className="h-full border-slate-200 shadow-sm flex flex-col">
      <CardHeader>
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-slate-500" />
          视觉回顾 (Visual Journey)
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {displayPhotos.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 h-full">
            {displayPhotos.map((photo, index) => (
              <div
                key={photo.id || index}
                className="relative aspect-square rounded-md overflow-hidden bg-slate-100 group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.description || "Project photo"}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                {photo.stage && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-2 py-1 truncate">
                    {photo.stage}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
            <ImageIcon className="h-8 w-8 mb-2 opacity-50" />
            <span className="text-xs">暂无影像记录</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// SummaryReport 组件
export function SummaryReport({ project }: { project: Project }) {
  const netProfit = Number(project.net_cash_flow) || 0;
  const roi = Number(project.roi) || 0;
  const totalInvestment = Number(project.total_expense) || 0;

  // [修复 3] 移除了未使用的 'duration' 变量
  // const duration = project.signing_period || 0;

  let performanceTag = "稳健收益";
  let tagColor = "bg-blue-100 text-blue-700";

  if (roi >= 20) {
    performanceTag = "超额收益 🚀";
    tagColor = "bg-red-100 text-red-700";
  } else if (roi >= 10) {
    performanceTag = "优质资产 🌟";
    tagColor = "bg-amber-100 text-amber-700";
  } else if (roi < 0) {
    performanceTag = "亏损警示 ⚠️";
    tagColor = "bg-slate-100 text-slate-700";
  }

  return (
    <Card className="h-full bg-slate-900 text-white border-0 shadow-md">
      {/* 保持原有的 JSX 内容不变 */}
      <CardHeader>
        <CardTitle className="text-base font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Quote className="h-4 w-4 text-red-400" />
            项目总结 (Summary)
          </span>
          <Badge variant="outline" className={`border-0 ${tagColor}`}>
            {performanceTag}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-slate-300 leading-relaxed">
        <p>
          该项目 <span className="text-white font-medium">{project.name}</span>{" "}
          已圆满结案。 全周期总投入资金{" "}
          <span className="text-white font-mono">
            ¥{(totalInvestment / 10000).toFixed(2)}万
          </span>
          。
        </p>

        <p>
          最终实现净利润{" "}
          <span
            className={`font-bold font-mono text-lg ${
              netProfit >= 0 ? "text-red-400" : "text-red-400"
            }`}
          >
            {netProfit >= 0 ? "+" : ""}¥{(netProfit / 10000).toFixed(2)}万
          </span>
          ，投资回报率 (ROI) 达到{" "}
          <span className="text-amber-400 font-bold font-mono">
            {roi.toFixed(2)}%
          </span>
          。
        </p>

        <div className="pt-4 border-t border-slate-800">
          <p className="text-xs text-slate-500">
            * 数据基于最终财务核算，记录归档于 {new Date().toLocaleDateString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
