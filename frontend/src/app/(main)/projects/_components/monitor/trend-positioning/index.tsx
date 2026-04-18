"use client";

import { Info, Loader2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "../section-header";
import { useTrendData } from "./use-trend-data";
import { calculatePriceRange, calculateRiskPercent } from "./chart-config";
import { PriceChart } from "./price-chart";

interface TrendPositioningProps {
  projectId?: string;
  communityName?: string;
  myOverridePrice?: number;
}

export function TrendPositioning({
  projectId,
  communityName,
  myOverridePrice,
}: TrendPositioningProps) {
  const { data, myPricing, loading, error } = useTrendData({
    projectId,
    communityName,
    myOverridePrice,
  });

  const priceRange = calculatePriceRange(data, myPricing);
  const riskPercent = calculateRiskPercent(data, myPricing);

  if (loading) {
    return (
      <section className="mt-8 pb-10">
        <SectionHeader
          index="3"
          title="趋势研判 (价格与成交量预测)"
          subtitle="Trend & Positioning"
        />
        <div className="px-6 flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-8 pb-10">
        <SectionHeader
          index="3"
          title="趋势研判 (价格与成交量预测)"
          subtitle="Trend & Positioning"
        />
        <div className="px-6">
          <AlertCircle className="h-5 w-5 text-red-500 mb-2" />
          <p className="text-sm text-red-500">{error}</p>
        </div>
      </section>
    );
  }

  if (data.length === 0) {
    return (
      <section className="mt-8 pb-10">
        <SectionHeader
          index="3"
          title="趋势研判 (价格与成交量预测)"
          subtitle="Trend & Positioning"
        />
        <div className="px-6 text-center py-10 text-slate-500 text-sm">
          暂无走势数据
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8 pb-10">
      <SectionHeader
        index="3"
        title="趋势研判 (价格与成交量预测)"
        subtitle="Trend & Positioning"
      />

      <div className="px-4 sm:px-6">
        <Card className="p-6 border-slate-100 shadow-sm bg-white">
          <PriceChart data={data} myPricing={myPricing} priceRange={priceRange} />

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-slate-50">
            <InsightCard
              iconColor="amber"
              title="市场趋势"
              content="价格剪刀差正在扩大，挂牌价虚高"
            />
            <InsightCard
              iconColor="blue"
              title="成交量能"
              content="成交量维持低位，抛售压力均衡"
            />
            <InsightCard
              iconColor="red"
              title="风险偏离"
              content={`您的定价 ${Number(riskPercent) > 0 ? "高于" : "低于"}最新成交均价 ${Math.abs(Number(riskPercent))}%`}
            />
          </div>
        </Card>
      </div>
    </section>
  );
}

interface InsightCardProps {
  iconColor: "amber" | "blue" | "red";
  title: string;
  content: string;
}

function InsightCard({ iconColor, title, content }: InsightCardProps) {
  const colorMap = {
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600",
    red: "bg-red-50 text-red-600",
  };

  return (
    <div className="flex items-center gap-3">
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center ${colorMap[iconColor]}`}
      >
        <Info className="h-5 w-5" />
      </div>
      <div>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
          {title}
        </p>
        <p className="text-sm font-bold text-slate-700">{content}</p>
      </div>
    </div>
  );
}
