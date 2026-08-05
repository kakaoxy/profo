"use client";

import { useMemo, useEffect, useState, useCallback } from "react";
import { useCurrentDate } from "@/hooks/use-current-date";
import { Card } from "@/components/ui/card";
import { format, addDays, differenceInDays } from "date-fns";
import { Project } from "../../../../types";
import { getRenovationContractAction } from "../../../../actions/renovation";
import { ActualEndDateDialog } from "./actual-end-date-dialog";
import {
  Clock,
  Share2,
  Ruler,
  Coins,
  TrendingUp,
  CalendarDays,
  CalendarCheck,
  Hourglass,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SellingBasicInfoProps {
  project: Project;
  onRefresh?: () => void;
}

export function SellingBasicInfo({ project, onRefresh }: SellingBasicInfoProps) {
  const today = useCurrentDate();

  // 实际竣工时间来自装修合同接口（项目详情响应未携带 actual_end_date）
  const [actualEndDate, setActualEndDate] = useState<string | undefined>(
    undefined,
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadContract() {
      try {
        const result = await getRenovationContractAction(project.id);
        if (cancelled) return;
        if (result.success && result.data) {
          const data = result.data as Record<string, unknown>;
          setActualEndDate(data.actual_end_date as string | undefined);
        }
      } catch {
        // 静默失败，不阻塞在售视图展示
      }
    }
    loadContract();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const handleEditSuccess = useCallback(async () => {
    // 重新拉取合同数据以刷新本地展示，并通知父组件刷新项目数据
    try {
      const result = await getRenovationContractAction(project.id);
      if (result.success && result.data) {
        const data = result.data as Record<string, unknown>;
        setActualEndDate(data.actual_end_date as string | undefined);
      }
    } catch {
      // ignore
    }
    onRefresh?.();
  }, [project.id, onRefresh]);

  // 1. 计算倒计时
  // 公式：交房日期 + 签约周期(天) + 延长期(天) - 今天
  const { daysLeft, deadlineDate } = useMemo(() => {
    if (!project.planned_handover_date || !today) {
      return { daysLeft: 0, deadlineDate: null };
    }

    const handoverDate = new Date(project.planned_handover_date);

    // 加上签约周期 (天)
    const signingPeriodDays = project.signing_period || 0;

    // 加上顺延期 (天)
    const extensionDays = project.extension_period || 0;

    const totalDaysToAdd = signingPeriodDays + extensionDays;
    const finalDeadline = addDays(handoverDate, totalDaysToAdd);

    const diff = differenceInDays(finalDeadline, today);

    return {
      daysLeft: diff,
      deadlineDate: finalDeadline
    };
  }, [project.planned_handover_date, project.signing_period, project.extension_period, today]);

  // 2. 计算单价 (元/平米)
  // list_price 单位是 "万元"，area 单位是 "平米"
  const unitPrice = useMemo(() => {
    if (!project.list_price || !project.area) return 0;
    // (万元 * 10000) / 面积
    return Math.round((project.list_price * 10000) / project.area);
  }, [project.list_price, project.area]);



  return (
    <>
    <Card className="shadow-sm border-border mb-6 bg-card overflow-hidden">
      <div className="flex flex-col md:flex-row">
        
        {/* 左侧：核心价格区 (35% 宽度) - 高亮背景 */}
        <div className="w-full md:w-[35%] bg-linear-to-br from-money-positive/5 to-status-pending/5 p-6 flex flex-col justify-center border-b md:border-b-0 md:border-r border-border relative overflow-hidden group">
          {/* 背景装饰印花 */}
          <Coins className="absolute -right-4 -bottom-4 w-24 h-24 text-money-positive/10 rotate-12 group-hover:rotate-0 transition-transform duration-500" />

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-money-positive/10 text-money-positive text-[10px] px-2 py-0.5 rounded-full font-bold">
                挂牌价
              </span>
              <span className="text-xs text-muted-foreground">
                {unitPrice > 0 ? `单价 ${unitPrice.toLocaleString()} 元/m²` : ""}
              </span>
            </div>

            <div className="flex items-baseline gap-1.5 overflow-hidden">
              <span className="text-4xl lg:text-5xl font-extrabold text-money-positive tracking-tight">
                {project.list_price || "-"}
              </span>
              <span className="text-lg text-money-positive font-medium">万</span>
            </div>

            {/* 涨跌幅模拟占位 (未来可接真实数据) */}
            <div className="mt-3 flex items-center text-xs text-muted-foreground">
               <TrendingUp className="w-3.5 h-3.5 mr-1" />
               <span className="opacity-80">根据市场波动适时调整</span>
            </div>
          </div>
        </div>

        {/* 右侧：详细信息区 (65% 宽度) */}
        <div className="flex-1 p-6">
          {/* 顶部标题栏 */}
          <div className="flex items-start justify-between mb-8">
            <div className="space-y-1">
               <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                 <Share2 className="w-3.5 h-3.5" />
                 <span>小区名称</span>
               </div>
               <div className="text-lg font-bold text-foreground leading-tight">
                 {project.community_name || "未填写小区名称"}
               </div>
            </div>

            {/* 倒计时 Pill */}
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg border",
              daysLeft < 30 
                ? "bg-error/10 border-error/20 text-error" 
                : "bg-success/10 border-success/20 text-success"
            )}>
               {daysLeft < 30 ? <Hourglass className="w-3.5 h-3.5 animate-pulse" /> : <Clock className="w-3.5 h-3.5" />}
               <div className="flex flex-col items-end leading-none">
                 <span className="text-xs font-bold opacity-90">剩余 {daysLeft} 天</span>
                 {deadlineDate && (
                    <span className="text-[10px] transform scale-90 origin-right opacity-70">
                      截止 {format(deadlineDate, "yy/MM/dd")}
                    </span>
                 )}
               </div>
            </div>
          </div>

          {/* 下方 Grid 信息 */}
          <div className="grid grid-cols-2 gap-y-6 gap-x-8">
            {/* 面积 */}
            <div className="space-y-1">
               <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Ruler className="w-3.5 h-3.5" />
                  <span>建筑面积</span>
               </div>
               <div className="text-base font-semibold text-foreground">
                  {project.area ? `${project.area} m²` : "-"}
               </div>
            </div>

            {/* 挂牌日期 */}
            <div className="space-y-1 flex flex-col items-end">
               <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>挂牌日期</span>
               </div>
               <div className="text-base font-semibold text-foreground">
                  {project.listing_date ? format(new Date(project.listing_date), "yyyy-MM-dd") : "-"}
               </div>
            </div>

            {/* 实际竣工 */}
            <div className="space-y-1">
               <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarCheck className="w-3.5 h-3.5" />
                  <span>实际竣工</span>
               </div>
               <div className="flex items-center gap-1.5 text-base font-semibold text-foreground">
                  <span>
                    {actualEndDate
                      ? format(new Date(actualEndDate), "yyyy-MM-dd")
                      : "-"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsDialogOpen(true)}
                    className="inline-flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                    aria-label="编辑实际竣工时间"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
               </div>
            </div>
          </div>

        </div>
      </div>
    </Card>

      <ActualEndDateDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        projectId={project.id}
        currentActualEndDate={actualEndDate}
        onSuccess={handleEditSuccess}
      />
    </>
  );
}
