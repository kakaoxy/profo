"use client";

import { useState, useEffect } from "react";
import { Store, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

import { Project } from "../../../../types";
// 从 client.ts 导入客户端可用的 Server Action
import { updateProjectStatusAction } from "../../../../actions/client";
import { StatusTransitionDialog } from "../../status-transition-dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ListingDialogProps {
  project: Project;
  /** 上架成功回调（useProjectDetail.handleListingSuccess：刷新 + 切至在售视图） */
  onSuccess?: () => Promise<void>;
  /** 可选受控打开状态（详情页 Hero 主 CTA 接线用；不传则由自带触发按钮驱动） */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * 上架确认弹窗（V4.1 · Renovation → Selling 阶段流转）
 *
 * 表单状态与提交逻辑自 RenovationView 原内联实现原样迁出（同一 action，
 * 由页面级 flowbar CTA 的受控实例驱动打开；视图内触发按钮已随 CTA 收口移除）。
 */
export function ListingDialog({ project, onSuccess, open, onOpenChange }: ListingDialogProps) {
  const [listingDate, setListingDate] = useState<Date | undefined>(undefined);
  const [listPrice, setListPrice] = useState<string>("");
  useEffect(() => {
    setListingDate(new Date());
  }, []);

  // 定义完工逻辑
  const handleCompletion = async () => {
    try {
      // 调用 Action 更新状态为 selling，并传入上架时间
      const res = await updateProjectStatusAction(
        project.id,
        "selling",
        listingDate?.toISOString(),
        listPrice ? parseFloat(listPrice) : undefined,
      );
      if (!res.success) throw new Error(res.message);

      toast.success("装修已完成，项目已转为在售状态！");

      // 刷新数据并自动跳转到在售阶段
      if (onSuccess) await onSuccess();
    } catch (error: unknown) {
      // [修复 2] 使用 unknown 替代 any，并进行安全类型检查
      const msg = error instanceof Error ? error.message : "操作失败";
      toast.error(msg);
      throw error;
    }
  };

  return (
    <StatusTransitionDialog
      triggerLabel="装修验收完成，上架销售"
      triggerIcon={<Store className="h-4 w-4" />}
      // Hero 主 CTA 是页面唯一 Ink 实心胶囊，视图内触发按钮降为次级描边形态（仅样式）
      triggerVariant="outline"
      triggerClassName="w-full gap-2 h-12 text-base"
      hideTrigger={open !== undefined}
      kicker="阶段流转 · Renovation → Selling"
      title="验收完成，上架销售"
      description="上架后项目进入在售阶段，房源将对渠道可见。请填写上架日期与挂牌价格。"
      confirmLabel="确认上架"
      onConfirm={handleCompletion}
      open={open}
      onOpenChange={onOpenChange}
    >
      <div className="space-y-[14px]">
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">上架日期</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-full justify-start text-left font-normal h-10",
                  !listingDate && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {listingDate ? format(listingDate, "PPP", { locale: zhCN }) : <span>选择日期</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={listingDate}
                onSelect={setListingDate}
                initialFocus
                locale={zhCN}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">挂牌价格（万元）</label>
          <Input
            type="number"
            placeholder="请输入上架价格"
            value={listPrice}
            onChange={(e) => setListPrice(e.target.value)}
          />
          {/* 定价 hint：Project 无评估价字段（评估数据仅存在于线索域），暂为静态建议文案 */}
          <p className="text-[12.5px] font-[430] text-graphite">建议基于评估价与装修投入定价</p>
        </div>
      </div>
    </StatusTransitionDialog>
  );
}
