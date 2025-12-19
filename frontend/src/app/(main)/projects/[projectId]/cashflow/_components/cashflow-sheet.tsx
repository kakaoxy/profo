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
import { CashFlowRecord, CashFlowStats } from "../types";

export function CashFlowSheet() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const projectId = searchParams.get("cashflow_id");
  const rawProjectName = searchParams.get("project_name");
  const projectName = rawProjectName ? decodeURIComponent(rawProjectName) : "";
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

      const records = apiData.records.map((r) => ({
        id: r.id,
        project_id: projectId,
        type: r.type,
        category: r.category,
        amount: Number(r.amount),
        date: r.date,
        notes: r.description,
        created_at: r.created_at,
      })) as CashFlowRecord[];

      const stats = {
        total_income: Number(apiData.summary.total_income),
        total_expense: Number(apiData.summary.total_expense),
        net_cash_flow: Number(apiData.summary.net_cash_flow),
        roi: Number(apiData.summary.roi || 0),
        annualized_return: Number(apiData.summary.annualized_return || 0),
        holding_days: Number(apiData.summary.holding_days || 0),
      };

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
    params.delete("project_name");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent className="w-full sm:max-w-2xl md:max-w-[800px] bg-slate-50 p-0 flex flex-col h-full border-l border-slate-200 shadow-2xl">
        <div className="flex-none bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            {/* [修改] 标题区域：显示项目名称 */}
            <SheetTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
              资金账本
              {projectName && (
                <>
                  <span className="text-slate-300 font-light">/</span>
                  <span
                    className="text-base font-medium text-slate-600 truncate max-w-[200px]"
                    title={projectName}
                  >
                    {projectName}
                  </span>
                </>
              )}
            </SheetTitle>
            <SheetDescription className="text-xs text-slate-500 mt-1">
              全周期资金流向监控，即时核算项目盈亏。
            </SheetDescription>
          </div>
        </div>

        {/* [修复 3] 内容滚动区域 (flex-1 overflow-y-auto) */}
        {/* 只有这个区域会滚动，Header 保持不动，且背景色稳固 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {isLoading || !data ? (
            <div className="flex h-full items-center justify-center min-h-[400px]">
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
