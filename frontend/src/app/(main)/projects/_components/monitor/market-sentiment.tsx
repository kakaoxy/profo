"use client";

import React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { SectionHeader } from "./section-header";

interface MarketSentimentProps {
  projectId: string;
}

export function MarketSentiment({ projectId }: MarketSentimentProps) {
  // Use projectId to satisfy linter
  console.log(`Sentiment data for: ${projectId}`);
  // Mock data for Module 1
  const floorStats = [
    { type: "高楼层", deals: 5, deal_avg: 212, deal_unit: 38545, current: 2, current_avg: 225, current_unit: 40909 },
    { type: "中楼层", deals: 8, deal_avg: 202, deal_unit: 36727, current: 4, current_avg: 215, current_unit: 39090 },
    { type: "低楼层", deals: 3, deal_avg: 195, deal_unit: 35454, current: 2, current_avg: 205, current_unit: 37272 },
  ];

  const pressure = {
    months: 9.2,
    label: "滞销 (买方市场)",
    status: "selling" // Using status for color mapping
  };

  return (
    <section className="mt-8 pb-10">
      <SectionHeader 
        index="1" 
        title="宏观风向标 (本小区行情)" 
        subtitle="Market Sentiment" 
      />
      
      <div className="px-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Deal Stats Card */}
        <div className="p-5 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">同户型成交统计</p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">过去12个月</p>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-600">
               <TrendingDown size={12} />
               1.2%
            </div>
          </div>
          
          <div className="space-y-3 flex-grow">
            {floorStats.map((item, idx) => (
              <React.Fragment key={`deal-${item.type}`}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className={`w-1 h-8 rounded-full ${idx === 0 ? 'bg-indigo-500' : idx === 1 ? 'bg-blue-400' : 'bg-slate-300'}`} />
                    <div>
                      <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                        {item.type} <span className="text-slate-300">|</span> <span className="text-indigo-600 font-bold">{item.deals} 套</span>
                      </p>
                      <p className="text-base font-black text-slate-800">{item.deal_avg} 万</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-medium">平均单价</p>
                    <p className="text-xs font-bold text-slate-600">¥{item.deal_unit.toLocaleString()}/㎡</p>
                  </div>
                </div>
                {idx < floorStats.length - 1 && <div className="h-px bg-slate-200/50" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Current Stats Card */}
        <div className="p-5 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">同户型挂牌统计</p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">当前在售</p>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">
               <TrendingUp size={12} />
               0.5%
            </div>
          </div>

          <div className="space-y-3 flex-grow">
            {floorStats.map((item, idx) => (
              <React.Fragment key={`curr-${item.type}`}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className={`w-1 h-8 rounded-full ${idx === 0 ? 'bg-indigo-500' : idx === 1 ? 'bg-blue-400' : 'bg-slate-300'}`} />
                    <div>
                      <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                        {item.type} <span className="text-slate-300">|</span> <span className="text-indigo-600 font-bold">{item.current} 套</span>
                      </p>
                      <p className="text-base font-black text-slate-800">{item.current_avg} 万</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-medium">平均单价</p>
                    <p className="text-xs font-bold text-slate-600">¥{item.current_unit.toLocaleString()}/㎡</p>
                  </div>
                </div>
                {idx < floorStats.length - 1 && <div className="h-px bg-slate-200/50" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Pressure Gauge Card */}
        <div className="p-5 rounded-xl border border-slate-100 bg-slate-50/50 flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">去化压力 (库存/月销)</p>
            </div>
          </div>
          
          <div className="mt-2 flex flex-col justify-center flex-grow pb-6">
            <p className="text-3xl font-black text-slate-900">{pressure.months} 个月</p>
            <p className="text-sm font-bold text-rose-600 mt-2">🔴 {pressure.label}</p>
          </div>

          <div className="mt-auto w-full pt-6 border-t border-slate-200/50 flex items-center justify-center gap-4">
             <div className="flex flex-col items-center">
                <span className="text-[10px] text-slate-400 uppercase font-bold">成交周期</span>
                <span className="text-xs font-bold text-slate-700">45天</span>
             </div>
             <div className="w-px h-6 bg-slate-200" />
             <div className="flex flex-col items-center">
                <span className="text-[10px] text-slate-400 uppercase font-bold">带看热度</span>
                <span className="text-xs font-bold text-emerald-600">极高</span>
             </div>
          </div>
        </div>
      </div>
    </section>
  );
}
