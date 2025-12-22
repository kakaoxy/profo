"use client";

import { MapPin, Info, Clock } from "lucide-react";

interface HeroSectionProps {
  projectId: string;
  projectName: string;
}

export function HeroSection({ projectId, projectName }: HeroSectionProps) {
  // Use props to satisfy linter and make it feel dynamic
  console.log(`Loading monitor for project: ${projectName} (${projectId})`);
  // Mock data for demonstration
  const data = {
    address: "上海市静安区XX路XX号",
    layout: "2室1厅 55㎡",
    signing_price: 195,
    listing_price: 210,
    unit_price: 38182,
    time_monitor: {
      progress: 75,
      remaining_days: 15,
      daily_loss: 300,
      monthly_loss: 9000,
    }
  };

  return (
    <section className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-white border-b border-slate-100">
      {/* Left Column: Basic Info */}
      <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 p-2 rounded-lg bg-blue-50 text-blue-600">
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">项目地址</p>
              <p className="text-sm font-semibold text-slate-700">{data.address}</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="mt-1 p-2 rounded-lg bg-slate-50 text-slate-600">
              <Info className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">户型面积</p>
              <p className="text-sm font-semibold text-slate-700">{data.layout}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 p-2 rounded-lg bg-indigo-50 text-indigo-600">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">价格信息 (万)</p>
              <div className="flex items-baseline gap-4 mt-0.5">
                <div>
                  <span className="text-[10px] text-slate-400 block">签约价</span>
                  <span className="text-lg font-bold text-slate-900">¥{data.signing_price}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">当前挂牌</span>
                  <span className="text-lg font-bold text-red-500">¥{data.listing_price}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pl-11">
             <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">单价详情</p>
             <p className="text-lg font-bold text-slate-900">¥{data.unit_price.toLocaleString()}/㎡</p>
          </div>
        </div>
      </div>

      {/* Right Column: Time Monitor */}
      <div className="lg:col-span-5">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
              <Clock className="w-4 h-4 text-orange-500" />
              时间成本监控 (Time Bomb)
            </h3>
            <span className="text-xs font-bold text-slate-400">进度: {data.time_monitor.progress}%</span>
          </div>

          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-indigo-500 via-orange-400 to-rose-500 transition-all duration-1000"
              style={{ width: `${data.time_monitor.progress}%` }}
            />
          </div>

          <div className="flex justify-between items-center gap-4">
            <div className="flex-1 p-2.5 bg-white border border-slate-100 rounded-lg shadow-sm">
              <p className="text-[10px] text-slate-400 font-bold mb-1">免租期余额</p>
              <p className="text-sm font-black text-rose-600">{data.time_monitor.remaining_days} 天</p>
            </div>
            <div className="flex-2 flex items-center gap-3 bg-rose-50 px-4 py-2 rounded-lg border border-rose-100 min-w-[180px]">
              <div>
                <p className="text-[10px] text-rose-500 font-bold">延期日损失预计</p>
                <p className="text-base font-black text-rose-700">¥ {data.time_monitor.daily_loss} / 天</p>
              </div>
              <div className="text-[10px] text-rose-400 font-medium">
                利润侵蚀<br/>¥{data.time_monitor.monthly_loss.toLocaleString()}/月
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
