"use client";

import { useMemo, useEffect, useState, useCallback } from "react";
import { useCurrentDate } from "@/hooks/use-current-date";
import { format, addDays, differenceInDays } from "date-fns";
import { Project } from "../../../../types";
import { getRenovationContractAction } from "../../../../actions/renovation";
import { ActualEndDateDialog } from "./actual-end-date-dialog";
import { Pencil } from "lucide-react";
interface SellingBasicInfoProps {
  project: Project;
  onRefresh?: () => void;
  /** 受控打开「实际结束日期」弹窗（页面级 flowbar「结束项目」接线；两 prop 均提供时受控） */
  endProjectDialogOpen?: boolean;
  onEndProjectDialogOpenChange?: (open: boolean) => void;
}

export function SellingBasicInfo({
  project,
  onRefresh,
  endProjectDialogOpen,
  onEndProjectDialogOpenChange,
}: SellingBasicInfoProps) {
  const today = useCurrentDate();

  // 实际竣工时间来自装修合同接口（项目详情响应未携带 actual_end_date）
  const [actualEndDate, setActualEndDate] = useState<string | undefined>(undefined);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // 受控优先：外部提供两 prop 时由外部驱动弹窗开关，否则用内部触发兜底
  const isDialogControlled =
    endProjectDialogOpen !== undefined && onEndProjectDialogOpenChange !== undefined;
  const dialogOpen = isDialogControlled ? endProjectDialogOpen : isDialogOpen;
  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!isDialogControlled) setIsDialogOpen(open);
      onEndProjectDialogOpenChange?.(open);
    },
    [isDialogControlled, onEndProjectDialogOpenChange],
  );

  const loadContract = useCallback(async () => {
    try {
      const result = await getRenovationContractAction(project.id);
      if (result.success && result.data) {
        setActualEndDate(result.data.actual_end_date ?? undefined);
      }
    } catch {
      // 静默失败，不阻塞在售视图展示
    }
  }, [project.id]);

  useEffect(() => {
    void loadContract();
  }, [loadContract]);

  const handleEditSuccess = useCallback(async () => {
    // 重新拉取合同数据以刷新本地展示，并通知父组件刷新项目数据
    await loadContract();
    onRefresh?.();
  }, [loadContract, onRefresh]);

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
      deadlineDate: finalDeadline,
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
      <div className="mb-5 rounded-cards bg-pure-white p-6 shadow-steep">
        {/* 卡头：标题 + 补登实际结束日期 textlink（设计稿 1448-1450，textlink 无图标） */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-base font-[500] text-ink">房源基础信息</div>
          <button
            type="button"
            onClick={() => handleDialogOpenChange(true)}
            className="text-sm text-graphite transition-colors hover:text-ink"
          >
            补登实际结束日期
          </button>
        </div>

        {/* info-grid 两列六项（设计稿 .info-grid / .info-item） */}
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {/* 挂牌价：值 480 字重 + 单价次级（设计稿 1453） */}
          <div className="flex flex-col gap-[3px] border-b border-[#f0f0f2] py-[13px]">
            <span className="text-[13px] font-[430] text-graphite">挂牌价</span>
            <span className="text-[14.5px] font-[480] text-ink">
              {project.list_price ? `${project.list_price} 万元` : "-"}
              {unitPrice > 0 && (
                <span className="font-[430] text-graphite">
                  {" "}
                  · {unitPrice.toLocaleString()} 元/㎡
                </span>
              )}
            </span>
          </div>

          {/* 委托倒计时：绿 Pill（设计稿 1454：#e5efe7 bg / #3e6b4f text，无图标） */}
          <div className="flex flex-col gap-[3px] border-b border-[#f0f0f2] py-[13px]">
            <span className="text-[13px] font-[430] text-graphite">委托倒计时</span>
            <span className="text-[14.5px] font-[450] text-ink">
              {deadlineDate ? (
                <span className="inline-flex items-center rounded-full bg-[#e5efe7] px-[13px] py-[5px] text-[13px] font-[450] text-[#3e6b4f]">
                  剩余 {daysLeft} 天 · 截止 {format(deadlineDate, "yyyy.MM.dd")}
                </span>
              ) : (
                "-"
              )}
            </span>
          </div>

          {/* 上架日期（设计稿 1455） */}
          <div className="flex flex-col gap-[3px] border-b border-[#f0f0f2] py-[13px]">
            <span className="text-[13px] font-[430] text-graphite">上架日期</span>
            <span className="text-[14.5px] font-[450] text-ink">
              {project.listing_date ? format(new Date(project.listing_date), "yyyy.MM.dd") : "-"}
            </span>
          </div>

          {/* 实际竣工 + 编辑 mini-link（设计稿 1456-1458） */}
          <div className="flex flex-col gap-[3px] border-b border-[#f0f0f2] py-[13px]">
            <span className="text-[13px] font-[430] text-graphite">实际竣工</span>
            <span className="flex flex-wrap items-center gap-2 text-[14.5px] font-[450] text-ink">
              {actualEndDate ? format(new Date(actualEndDate), "yyyy.MM.dd") : "-"}
              <button
                type="button"
                onClick={() => handleDialogOpenChange(true)}
                className="inline-flex items-center gap-1 text-[13px] text-graphite transition-colors hover:text-ink"
              >
                <Pencil className="size-3" />
                编辑
              </button>
            </span>
          </div>

          {/* 签约价（设计稿 1459） */}
          <div className="flex flex-col gap-[3px] border-b border-[#f0f0f2] py-[13px]">
            <span className="text-[13px] font-[430] text-graphite">签约价</span>
            <span className="text-[14.5px] font-[450] text-ink">
              {project.signing_price ? `${project.signing_price} 万元` : "-"}
            </span>
          </div>

          {/* 总投入（设计稿 1460） */}
          <div className="flex flex-col gap-[3px] border-b border-[#f0f0f2] py-[13px]">
            <span className="text-[13px] font-[430] text-graphite">总投入</span>
            <span className="text-[14.5px] font-[450] text-ink">
              {project.total_investment ? `${project.total_investment} 万元` : "-"}
            </span>
          </div>
        </div>
      </div>

      <ActualEndDateDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        projectId={project.id}
        currentActualEndDate={actualEndDate}
        onSuccess={handleEditSuccess}
        // 受控打开（页面级 flowbar「结束项目」）= end 语义；内部补登入口保持 edit
        mode={isDialogControlled ? "end" : "edit"}
      />
    </>
  );
}
