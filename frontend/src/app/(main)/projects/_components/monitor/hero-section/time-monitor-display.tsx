"use client";

import { Clock } from "lucide-react";
import type { TimeMonitor } from "./time-monitor";

interface TimeMonitorDisplayProps {
  timeMonitor: TimeMonitor;
}

export function TimeMonitorDisplay({ timeMonitor }: TimeMonitorDisplayProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
          <Clock className="w-4 h-4 text-orange-500" />
          时间成本监控 (Time Bomb)
        </h3>
        <span className="text-xs font-bold text-slate-400">
          进度: {timeMonitor.progress}%
        </span>
      </div>

      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
        <div
          className="h-full bg-linear-to-r from-indigo-500 via-orange-400 to-rose-500 transition-all duration-1000"
          style={{ width: `${timeMonitor.progress}%` }}
        />
      </div>

      <div className="flex justify-between items-center gap-4">
        <div className="flex-1 p-2.5 bg-white border border-slate-100 rounded-lg shadow-sm">
          <p className="text-[10px] text-slate-400 font-bold mb-1">
            免租期余额
          </p>
          <p className="text-sm font-black text-rose-600">
            {timeMonitor.remaining_days} 天
          </p>
        </div>
        <div className="flex-2 flex items-center gap-3 bg-rose-50 px-4 py-2 rounded-lg border border-rose-100 min-w-[180px]">
          <div>
            <p className="text-[10px] text-rose-500 font-bold">
              延期日损失预计
            </p>
            <p className="text-base font-black text-rose-700">
              ¥ {timeMonitor.daily_loss} / 天
            </p>
          </div>
          <div className="text-[10px] text-rose-400 font-medium">
            利润侵蚀
            <br />¥{timeMonitor.monthly_loss.toLocaleString()}/月
          </div>
        </div>
      </div>
    </div>
  );
}
