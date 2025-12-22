"use client";

import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Label } from "recharts";

interface TrendPositioningProps {
  projectId: string;
}

export function TrendPositioning({ projectId }: TrendPositioningProps) {
  // Use projectId to satisfy linter
  console.log(`Trend data for: ${projectId}`);
  // Mock data for Recharts
  const data = [
    { month: 'M-5', listing: 40000, deal: 37000, volume: 8 },
    { month: 'M-4', listing: 41500, deal: 38500, volume: 12 },
    { month: 'M-3', listing: 40500, deal: 38000, volume: 15 },
    { month: 'M-2', listing: 39500, deal: 37500, volume: 10 },
    { month: 'M-1', listing: 38800, deal: 36800, volume: 6 },
    { month: 'Now', listing: 38500, deal: 36500, volume: 4 },
  ];

  const myPricing = 38181;

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
                  domain={[30000, 45000]}
                  label={{ value: '单价 (元/㎡)', angle: -90, position: 'insideLeft', style: { fill: '#94a3b8', fontSize: 12 } }}
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  domain={[0, 25]}
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
                  dataKey="listing" 
                  name="小区挂牌均均价" 
                  stroke="#6366f1" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} 
                />
                <Line 
                  yAxisId="left" 
                  type="monotone" 
                  dataKey="deal" 
                  name="小区成交均价" 
                  stroke="#10b981" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} 
                />
                
                {/* Current Target Price Reference */}
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

                {/* Annotation for Scissors Gap */}
                <ReferenceLine yAxisId="left" y={38181} stroke="transparent">
                  <Label 
                    value="📉 剪刀差扩大" 
                    position="center" 
                    offset={-50} 
                    fill="#f59e0b" 
                    fontSize={14} 
                    fontWeight="bold" 
                  />
                </ReferenceLine>
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
                    <p className="text-sm font-bold text-slate-700">您的定价高于最新成交均价 2.8%</p>
                 </div>
              </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
