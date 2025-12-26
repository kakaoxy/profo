"use client";
// 数据监控 - 基础信息展示 - 时间监控
import { useEffect, useState } from "react";
import { MapPin, Info, Clock } from "lucide-react";
import { getProjectDetailAction } from "@/app/(main)/projects/actions";
import { ProjectData } from "./types";

interface HeroSectionProps {
  projectId?: string;
  projectName?: string;
  overrideData?: ProjectData;
}



interface TimeMonitor {
  progress: number;
  remaining_days: number;
  daily_loss: number;
  monthly_loss: number;
}

function calculateTimeMonitor(
  signingDate: string | null,
  signingPeriod: number | null,
  extensionRent: number | null
): TimeMonitor {
  const defaultMonitor: TimeMonitor = {
    progress: 0,
    remaining_days: 0,
    daily_loss: 0,
    monthly_loss: 0,
  };

  if (!signingDate || !signingPeriod) {
    return defaultMonitor;
  }

  const startDate = new Date(signingDate);
  const today = new Date();
  // signing_period 单位是天数，直接使用
  const totalDays = signingPeriod;
  const consumedDays = Math.floor(
    (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const remainingDays = Math.max(0, totalDays - consumedDays);
  const progress = Math.min(100, Math.max(0, (consumedDays / totalDays) * 100));

  const monthlyLoss = extensionRent ?? 0;
  const dailyLoss = Math.round(monthlyLoss / 30);

  return {
    progress: Math.round(progress),
    remaining_days: remainingDays,
    daily_loss: dailyLoss,
    monthly_loss: monthlyLoss,
  };
}

export function HeroSection({ projectId, projectName, overrideData }: HeroSectionProps) {
  const [data, setData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (overrideData) {
        setData(overrideData);
        setLoading(false);
        return;
      }

      if (!projectId) return;

      try {
        setLoading(true);
        setError(null);
        const result = await getProjectDetailAction(projectId, true);

        if (!result.success) {
          setError(result.message || "获取项目详情失败");
          return;
        }

        const projectData = result.data as ProjectData;
        setData(projectData);
      } catch (e) {
        console.error(`获取项目 ${projectName} 详情异常:`, e);
        setError("网络错误，请稍后重试");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  // 只依赖 projectId，避免 dependency array 大小变化错误
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, overrideData]);

  // Loading state
  if (loading) {
    return (
      <section className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-white border-b border-slate-100">
        <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 p-2 rounded-lg bg-slate-100 animate-pulse w-8 h-8" />
              <div className="flex-1">
                <div className="h-3 bg-slate-100 rounded animate-pulse w-16 mb-2" />
                <div className="h-4 bg-slate-100 rounded animate-pulse w-32" />
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 p-2 rounded-lg bg-slate-100 animate-pulse w-8 h-8" />
              <div className="flex-1">
                <div className="h-3 bg-slate-100 rounded animate-pulse w-16 mb-2" />
                <div className="h-4 bg-slate-100 rounded animate-pulse w-24" />
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-20 bg-slate-100 rounded animate-pulse" />
            <div className="h-12 bg-slate-100 rounded animate-pulse" />
          </div>
        </div>
        <div className="lg:col-span-5">
          <div className="h-32 bg-slate-100 rounded animate-pulse" />
        </div>
      </section>
    );
  }

  // Error state
  if (error) {
    return (
      <section className="p-6 bg-white border-b border-slate-100">
        <div className="text-center py-8">
          <p className="text-sm text-rose-500">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 text-xs text-blue-600 hover:underline"
          >
            点击重试
          </button>
        </div>
      </section>
    );
  }

  // Compute display values
  const address = data?.address || data?.community_name || "地址未设置";
  const area = data?.area ? Number(data.area) : 0;
  const layout = area > 0 ? `${area}㎡` : "面积未设置";
  const signingPrice = data?.signing_price ? Number(data.signing_price) : 0;
  const listPrice = data?.list_price ? Number(data.list_price) : signingPrice;
  const unitPrice = area > 0 && signingPrice > 0 
    ? Math.round((signingPrice * 10000) / area) 
    : 0;

  const timeMonitor = calculateTimeMonitor(
    data?.signing_date ?? null,
    data?.signing_period ?? null,
    data?.extensionRent ? Number(data.extensionRent) : null
  );

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
              <p className="text-sm font-semibold text-slate-700">{address}</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="mt-1 p-2 rounded-lg bg-slate-50 text-slate-600">
              <Info className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">户型面积</p>
              <p className="text-sm font-semibold text-slate-700">{layout}</p>
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
                  <span className="text-lg font-bold text-slate-900">¥{signingPrice.toFixed(0)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">当前挂牌</span>
                  <span className="text-lg font-bold text-red-500">¥{listPrice.toFixed(0)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pl-11">
             <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">单价详情</p>
             <p className="text-lg font-bold text-slate-900">
               {unitPrice > 0 ? `¥${unitPrice.toLocaleString()}/㎡` : "—"}
             </p>
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
            <span className="text-xs font-bold text-slate-400">进度: {timeMonitor.progress}%</span>
          </div>

          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-indigo-500 via-orange-400 to-rose-500 transition-all duration-1000"
              style={{ width: `${timeMonitor.progress}%` }}
            />
          </div>

          <div className="flex justify-between items-center gap-4">
            <div className="flex-1 p-2.5 bg-white border border-slate-100 rounded-lg shadow-sm">
              <p className="text-[10px] text-slate-400 font-bold mb-1">免租期余额</p>
              <p className="text-sm font-black text-rose-600">{timeMonitor.remaining_days} 天</p>
            </div>
            <div className="flex-2 flex items-center gap-3 bg-rose-50 px-4 py-2 rounded-lg border border-rose-100 min-w-[180px]">
              <div>
                <p className="text-[10px] text-rose-500 font-bold">延期日损失预计</p>
                <p className="text-base font-black text-rose-700">¥ {timeMonitor.daily_loss} / 天</p>
              </div>
              <div className="text-[10px] text-rose-400 font-medium">
                利润侵蚀<br/>¥{timeMonitor.monthly_loss.toLocaleString()}/月
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
