

import React from 'react';
import { Lead } from '../types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  ArrowLeft, Activity, TrendingUp, Eye, 
  Share2, Map, Users, AlertCircle, Building2 
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  lead: Lead;
  onClose: () => void;
}

export const MonitoringDashboard: React.FC<Props> = ({ lead, onClose }) => {
  // Mock trend data
  const dataPoints = [210, 208, 209, 215, 212, 210, 208];
  const max = Math.max(...dataPoints);
  const min = Math.min(...dataPoints);
  const range = max - min;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-50 flex flex-col animate-in fade-in zoom-in-95 duration-300">
      {/* Header */}
      <header className="h-16 border-b bg-white flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-8 w-[1px] bg-slate-200" />
          <div>
            <h1 className="text-lg font-black font-sans tracking-tight">{lead.communityName} · 监控看板</h1>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Property Real-time Telemetry</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-100 font-bold">
            <Activity className="h-3 w-3 mr-1" /> 实时数据同步中
          </Badge>
          <Button variant="outline" size="sm" className="h-9 px-4 rounded-full">
            <Share2 className="h-4 w-4 mr-2" /> 导出报告
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
        <div className="container max-w-[1400px] mx-auto space-y-8">
          
          {/* Top Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="今日浏览量" value="1,284" subValue="+12% 较昨日" icon={Eye} color="blue" />
            <StatCard title="留资客户" value="42" subValue="+3 较昨日" icon={Users} color="indigo" />
            <StatCard title="平均停留时长" value="4m 12s" subValue="高于商圈均值" icon={Activity} color="emerald" />
            <StatCard title="市场热度" value="92.4" subValue="极高活跃度" icon={TrendingUp} color="orange" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Price Trend Chart Section */}
            <Card className="lg:col-span-2 border-none shadow-sm overflow-hidden bg-white">
              <CardHeader className="flex flex-row items-center justify-between p-6 pb-0">
                <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-500">报价趋势监测 (近7日)</CardTitle>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-500" />
                    <span className="text-[10px] font-bold text-slate-400">业主报价</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-slate-200" />
                    <span className="text-[10px] font-bold text-slate-400">商圈均值</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8">
                <div className="h-[300px] w-full relative group">
                  <svg className="h-full w-full overflow-visible" viewBox="0 0 700 300">
                    <defs>
                      <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {/* Grid lines */}
                    {[0, 1, 2, 3].map((i) => (
                      <line key={i} x1="0" y1={i * 100} x2="700" y2={i * 100} stroke="#f1f5f9" strokeWidth="1" />
                    ))}
                    {/* Area path */}
                    <path
                      d={`M 0 300 ${dataPoints.map((p, i) => `L ${(i * 700) / 6} ${300 - ((p - min) / range) * 200 - 50}`).join(' ')} L 700 300 Z`}
                      fill="url(#chartGradient)"
                    />
                    {/* Main line */}
                    <path
                      d={dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * 700) / 6} ${300 - ((p - min) / range) * 200 - 50}`).join(' ')}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {/* Data points */}
                    {dataPoints.map((p, i) => (
                      <circle
                        key={i}
                        cx={(i * 700) / 6}
                        cy={300 - ((p - min) / range) * 200 - 50}
                        r="6"
                        className="fill-white stroke-blue-500 stroke-[3px] shadow-sm cursor-pointer hover:r-8 transition-all"
                      />
                    ))}
                  </svg>
                  {/* Tooltip labels */}
                  <div className="absolute -bottom-6 left-0 right-0 flex justify-between px-2 text-[10px] font-black text-slate-300">
                    {['OCT 19', 'OCT 20', 'OCT 21', 'OCT 22', 'OCT 23', 'OCT 24', 'OCT 25'].map(d => <span key={d}>{d}</span>)}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Neighborhood Insights */}
            <div className="space-y-6">
              <Card className="border-none shadow-sm bg-white">
                <CardHeader>
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                    <Map className="h-4 w-4" /> 区域价格热力
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ComparisonItem label="小区均价" value="¥ 4.2万/㎡" percent={100} />
                  <ComparisonItem label="商圈均价" value="¥ 4.8万/㎡" percent={85} warning />
                  <ComparisonItem label="区县均价" value="¥ 5.5万/㎡" percent={70} />
                  <div className="pt-4 border-t">
                    <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-100">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <p className="text-[10px] font-bold leading-tight uppercase tracking-tight">
                        该房源报价低于商圈平均 12.5%，属于极高性价比区间。
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm bg-gradient-to-br from-slate-900 to-slate-800 text-white overflow-hidden relative">
                 <div className="absolute -right-8 -bottom-8 opacity-10">
                    <Building2 className="h-32 w-32" />
                 </div>
                 <CardContent className="p-6 space-y-4 relative z-10">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">FLIP 盈利预测</span>
                    <div className="space-y-1">
                       <h4 className="text-2xl font-black font-sans tracking-tighter">¥ 82.4 万</h4>
                       <p className="text-xs text-emerald-400 font-bold">预计投资回报率 16.5%</p>
                    </div>
                    <Button size="sm" className="w-full bg-white text-slate-900 hover:bg-slate-100 font-bold rounded-lg h-10 uppercase text-xs tracking-widest">
                       启动收购流程
                    </Button>
                 </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: string;
  subValue: string;
  icon: React.ElementType;
  color: 'blue' | 'indigo' | 'emerald' | 'orange';
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subValue, icon: Icon, color }) => {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-600 shadow-blue-200",
    indigo: "bg-indigo-600 shadow-indigo-200",
    emerald: "bg-emerald-600 shadow-emerald-200",
    orange: "bg-orange-600 shadow-orange-200",
  };

  return (
    <Card className="border-none shadow-sm bg-white p-6 group hover:scale-[1.02] transition-transform">
      <div className="flex items-center justify-between">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center text-white shadow-lg", colorMap[color])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{title}</p>
          <p className="text-2xl font-black font-sans tracking-tighter text-slate-900">{value}</p>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{subValue}</span>
      </div>
    </Card>
  );
};

interface ComparisonItemProps {
  label: string;
  value: string;
  percent: number;
  warning?: boolean;
}

const ComparisonItem: React.FC<ComparisonItemProps> = ({ label, value, percent, warning }) => (
  <div className="space-y-2">
    <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider">
      <span className="text-slate-400">{label}</span>
      <span className={cn(warning ? "text-amber-600" : "text-slate-900")}>{value}</span>
    </div>
    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
      <div 
        className={cn("h-full rounded-full transition-all duration-1000", warning ? "bg-amber-500" : "bg-blue-500")}
        style={{ width: `${percent}%` }}
      />
    </div>
  </div>
);
