
"use client";

import { useEffect, useState } from "react";
import { Info, Loader2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Label } from "recharts";
import { getTrendPositioningAction, type TrendData } from "../../actions/monitor";

interface TrendPositioningProps {
  projectId: string;
}

export function TrendPositioning({ projectId }: TrendPositioningProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TrendData[]>([]);
  const [myPricing, setMyPricing] = useState<number>(0);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const res = await getTrendPositioningAction(projectId);
        if (res.success && res.data) {
          setData(res.data);
          setMyPricing(res.myPrice || 0);
        } else {
          setError(res.message || "获取走势数据失败");
        }
      } catch (e) {
        console.error(e);
        setError("加载失败");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [projectId]);

  // 计算Y轴范围
  const allPrices = [
    ...data.map(d => d.listing_price),
    ...data.map(d => d.deal_price),
    myPricing > 0 ? myPricing : 0
  ].filter(p => p > 0);
  
  const minPrice = allPrices.length > 0 ? Math.floor(Math.min(...allPrices) * 0.9 / 1000) * 1000 : 30000;
  const maxPrice = allPrices.length > 0 ? Math.ceil(Math.max(...allPrices) * 1.1 / 1000) * 1000 : 45000;

  // 简单的风险偏离计算
  const latestDealPrice = data.length > 0 ? data[data.length - 1].deal_price : 0;
  const riskPercent = latestDealPrice > 0 && myPricing > 0 
    ? ((myPricing - latestDealPrice) / latestDealPrice * 100).toFixed(1) 
    : "0.0";

  if (loading) {
    return (
      <section className="mt-8 pb-10">
        <SectionHeader index="3" title="趋势研判 (价格与成交量预测)" subtitle="Trend & Positioning" />
        <div className="px-6 flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-8 pb-10">
        <SectionHeader index="3" title="趋势研判 (价格与成交量预测)" subtitle="Trend & Positioning" />
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
        <SectionHeader index="3" title="趋势研判 (价格与成交量预测)" subtitle="Trend & Positioning" />
        <div className="px-6 text-center py-10 text-slate-500 text-sm">暂无走势数据</div>
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
      
      <div className="px-6">
        <Card className="p-6 border-slate-100 shadow-sm bg-white">
          <div className="h-[400px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="month" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12 }} 
                />
                <YAxis 
                  yAxisId="left" 
                  orientation="left" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12 }} 
                  domain={[minPrice, maxPrice]}
                  label={{ value: '单价 (元/㎡)', angle: -90, position: 'insideLeft', style: { fill: '#94a3b8', fontSize: 12 } }}
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  domain={[0, 'auto']}
                  label={{ value: '成交量 (套)', angle: 90, position: 'insideRight', style: { fill: '#94a3b8', fontSize: 12 } }}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  cursor={{ stroke: "#e2e8f0", strokeWidth: 1 }}
                />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                
                <Bar 
                  yAxisId="right" 
                  dataKey="volume" 
                  name="成交量" 
                  fill="#e2e8f0" 
                  radius={[4, 4, 0, 0]} 
                  barSize={40}
                />
                <Line 
                  yAxisId="left" 
                  type="monotone" 
                  dataKey="listing_price" 
                  name="小区挂牌均价" 
                  stroke="#6366f1" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} 
                />
                <Line 
                  yAxisId="left" 
                  type="monotone" 
                  dataKey="deal_price" 
                  name="小区成交均价" 
                  stroke="#10b981" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} 
                />
                
                {/* Current Target Price Reference */}
                {myPricing > 0 && (
                  <ReferenceLine 
                    yAxisId="left" 
                    y={myPricing} 
                    stroke="#ef4444" 
                    strokeDasharray="5 5" 
                    strokeWidth={2}
                  >
                    <Label 
                      value={`我的定价: ${Math.round(myPricing / 1000)}k`} 
                      position="right" 
                      fill="#ef4444" 
                      fontSize={12} 
                      fontWeight="bold" 
                      offset={10}
                    />
                  </ReferenceLine>
                )}

                {/* Annotation for Scissors Gap */}
                {/* 暂时移除静态标注，后续可根据数据动态添加 */}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-slate-50">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                   <Info className="h-5 w-5" />
                 </div>
                 <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">市场趋势</p>
                    <p className="text-sm font-bold text-slate-700">价格剪刀差正在扩大，挂牌价虚高</p>
                 </div>
              </div>
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                    <Info className="h-5 w-5" />
                 </div>
                 <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">成交量能</p>
                    <p className="text-sm font-bold text-slate-700">成交量维持低位，抛售压力均衡</p>
                 </div>
              </div>
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600">
                    <Info className="h-5 w-5" />
                 </div>
                 <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">风险偏离</p>
                    <p className="text-sm font-bold text-slate-700">您的定价 {Number(riskPercent) > 0 ? "高于" : "低于"}最新成交均价 {Math.abs(Number(riskPercent))}%</p>
                 </div>
              </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
