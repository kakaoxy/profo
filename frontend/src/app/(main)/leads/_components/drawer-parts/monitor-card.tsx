import React from 'react';
import { Lead } from '../../types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Activity, TrendingUp, ChevronRight,
  BarChart3, PieChart, Timer
} from 'lucide-react';

interface Props {
  lead: Lead;
  onViewMonitor: (lead: Lead) => void;
}

export const MonitorCard: React.FC<Props> = ({ lead, onViewMonitor }) => {
  return (
    <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/30 to-indigo-50/30 p-5 overflow-hidden relative group">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-md">
            <Activity className="h-4 w-4" />
          </div>
          <span className="font-sans font-black text-blue-900 tracking-tight uppercase text-xs">实时市场动态</span>
        </div>
        <Badge variant="outline" className="bg-white/50 text-blue-700 border-blue-200">
          <TrendingUp className="h-3 w-3 mr-1" /> 商圈活跃
        </Badge>
      </div>
      
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/60 p-3 rounded-xl border border-white/80">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <PieChart className="h-3 w-3" />
            <span className="text-[9px] font-bold uppercase tracking-wider">挂牌量</span>
          </div>
          <div className="text-lg font-black text-slate-900">156 <span className="text-[10px] font-normal text-slate-400">套</span></div>
        </div>
        <div className="bg-white/60 p-3 rounded-xl border border-white/80">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <BarChart3 className="h-3 w-3" />
            <span className="text-[9px] font-bold uppercase tracking-wider">成交(12M)</span>
          </div>
          <div className="text-lg font-black text-slate-900">84 <span className="text-[10px] font-normal text-slate-400">套</span></div>
        </div>
        <div className="bg-white/60 p-3 rounded-xl border border-white/80">
          <div className="flex items-center gap-1.5 text-slate-400 mb-1">
            <Timer className="h-3 w-3" />
            <span className="text-[9px] font-bold uppercase tracking-wider">去化压力</span>
          </div>
          <div className="text-lg font-black text-amber-600">22.3 <span className="text-[10px] font-normal text-slate-400">月</span></div>
        </div>
      </div>
      
      <Button 
        variant="link" 
        size="sm" 
        onClick={() => onViewMonitor(lead)}
        className="mt-4 w-full text-blue-600 font-bold text-xs uppercase tracking-widest h-auto p-0 hover:no-underline hover:text-blue-700"
      >
        查看区域供需全景 <ChevronRight className="h-3 w-3 ml-1" />
      </Button>
    </div>
  );
};
