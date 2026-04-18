"use client";

import { MapPin, Info, Clock, RefreshCw } from "lucide-react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { getProjectDetailAction } from "../../../actions/core";
import type { ProjectData } from "../types";
import { calculateTimeMonitor } from "./time-monitor";
import { HeroSkeleton } from "./hero-skeleton";
import { TimeMonitorDisplay } from "./time-monitor-display";

interface HeroSectionProps {
  projectId?: string;
  projectName?: string;
  overrideData?: ProjectData;
}

const projectDetailFetcher = async (projectId: string): Promise<ProjectData> => {
  const result = await getProjectDetailAction(projectId, true);
  if (!result.success) {
    throw new Error(result.message || "获取项目详情失败");
  }
  return result.data as ProjectData;
};

export function HeroSection({ projectId, overrideData }: HeroSectionProps) {
  const { data, error, isLoading, mutate } = useSWR(
    overrideData || !projectId ? null : [`project-detail`, projectId],
    ([, id]) => projectDetailFetcher(id),
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      errorRetryCount: 3,
    }
  );

  const projectData = overrideData || data;
  const loading = isLoading && !overrideData;

  if (loading) {
    return <HeroSkeleton />;
  }

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
        <TimeMonitorDisplay timeMonitor={timeMonitor} />
      </div>
    </section>
  );
}
