"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

import { HeaderStats } from "./header-stats";
import { TrendChart } from "./trend-chart";
import { LedgerTable } from "./ledger-table";
import { getProjectCashFlowAction } from "../actions";
import {
  CashFlowRecord,
  CashFlowStats,
  mapToCashFlowRecord,
  mapToCashFlowStats,
} from "../types";

export function CashFlowSheet() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const projectId = searchParams.get("cashflow_id");
  const rawCommunityName = searchParams.get("community_name");
  const rawAddress = searchParams.get("address");
  const communityName = rawCommunityName ? decodeURIComponent(rawCommunityName) : "";
  const address = rawAddress ? decodeURIComponent(rawAddress) : "";
  // 组合显示：小区名 + 地址
  const projectDisplayName = communityName && address
    ? `${communityName} · ${address}`
    : communityName || address || "项目详情";
  const isOpen = !!projectId;

  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<{
    stats: CashFlowStats;
    records: CashFlowRecord[];
  } | null>(null);

  const fetchData = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    try {
      const apiData = await getProjectCashFlowAction(projectId);
      if (!apiData) {
        toast.error("获取数据失败");
        return;
      }

      const records = apiData.records.map((r) =>
        mapToCashFlowRecord(r, projectId)
      );
      const stats = mapToCashFlowStats(apiData.summary);

      setData({ stats, records });
    } catch (error) {
      console.error(error);
      toast.error("网络错误");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    } else {
      setData(null);
    }
  }, [isOpen, fetchData]);

  const handleClose = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("cashflow_id");
    params.delete("community_name");
    params.delete("address");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // 避免 hydration 不匹配：服务端渲染空内容，客户端再渲染实际内容
  if (!mounted) {
    return null;
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent className="w-full sm:max-w-2xl md:max-w-3xl bg-slate-50 p-0 flex flex-col h-full border-l border-slate-200 shadow-2xl">
        <div className="flex-none bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            {/* 标题区域：显示小区名+地址 */}
            <SheetTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
              资金账本
              {projectDisplayName && (
                <>
                  <span className="text-slate-300 font-light">/</span>
                  <span
                    className="text-base font-medium text-slate-600 truncate max-w-xs"
                    title={projectDisplayName}
                  >
                    {projectDisplayName}
                  </span>
                </>
              )}
            </SheetTitle>
            <SheetDescription className="text-xs text-slate-500 mt-1">
              全周期资金流向监控，即时核算项目盈亏。
            </SheetDescription>
          </div>
        </div>

        {/* 内容滚动区域 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {isLoading || !data ? (
            <div className="flex h-full items-center justify-center min-h-96">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : (
            <>
              {/* 1. 宏观概览 */}
              <section>
                <HeaderStats stats={data.stats} />
              </section>
              {/* 2. 微观账本 */}
              <section className="pb-10">
                {projectId && (
                  <LedgerTable
                    projectId={projectId}
                    data={data.records}
                    onRefresh={fetchData}
                  />
                )}
              </section>

              {/* 3. 趋势洞察 */}
              <section>
                <TrendChart data={data.records} />
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
