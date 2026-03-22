"use client";
// 数据监控 - 基础信息展示 - 时间监控
import { MapPin, Info, Clock } from "lucide-react";
import useSWR from "swr";
import { getProjectDetailAction } from "../../actions/core";
import { ProjectData } from "./types";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

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
  extensionRent: number | null,
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
    (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
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

// SWR fetcher for project detail
const projectDetailFetcher = async (projectId: string): Promise<ProjectData> => {
  const result = await getProjectDetailAction(projectId, true);
  if (!result.success) {
    throw new Error(result.message || "获取项目详情失败");
  }
  return result.data as ProjectData;
};

export function HeroSection({ projectId, overrideData }: HeroSectionProps) {
  // 使用 SWR 进行数据获取，自动去重、缓存和重试
  const { data, error, isLoading, mutate } = useSWR(
    // 如果有 overrideData 或没有 projectId，则不发起请求
    overrideData || !projectId ? null : [`project-detail`, projectId],
    ([, id]) => projectDetailFetcher(id),
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000, // 5秒内重复请求去重
      errorRetryCount: 3,
    }
  );

  // 优先使用 overrideData
  const projectData = overrideData || data;
  const loading = isLoading && !overrideData;

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
          <p className="text-sm text-rose-500">{error.message}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutate()}
            className="mt-2"
          >
            <RefreshCw className="mr-2 h-3 w-3" />
            重试
          </Button>
        </div>
      </section>
    );
  }

  // Compute display values
  const address = projectData?.address || projectData?.community_name || "地址未设置";
  const area = projectData?.area ? Number(projectData.area) : 0;
  const layout = area > 0 ? `${area}㎡` : "面积未设置";
  const signingPrice = projectData?.signing_price ? Number(projectData.signing_price) : 0;
  const listPrice = projectData?.list_price ? Number(projectData.list_price) : signingPrice;
  const unitPrice =
    area > 0 && signingPrice > 0
      ? Math.round((signingPrice * 10000) / area)
      : 0;

  const timeMonitor = calculateTimeMonitor(
    projectData?.signing_date ?? null,
    projectData?.signing_period ?? null,
    projectData?.extension_rent ? Number(projectData.extension_rent) : null,
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
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                项目地址
              </p>
              <p className="text-sm font-semibold text-slate-700">{address}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="mt-1 p-2 rounded-lg bg-slate-50 text-slate-600">
              <Info className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                户型面积
              </p>
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
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                价格信息 (万)
              </p>
              <div className="flex items-baseline gap-4 mt-0.5">
                <div>
                  <span className="text-[10px] text-slate-400 block">
                    签约价
                  </span>
                  <span className="text-lg font-bold text-slate-900">
                    ¥{signingPrice.toFixed(0)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">
                    当前挂牌
                  </span>
                  <span className="text-lg font-bold text-red-500">
                    ¥{listPrice.toFixed(0)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="pl-11">
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              单价详情
            </p>
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
      </div>
    </section>
  );
}
