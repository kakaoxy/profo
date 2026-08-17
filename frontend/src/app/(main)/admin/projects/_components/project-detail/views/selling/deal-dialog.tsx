"use client";

import { useState } from "react";
import { useCurrentDate } from "@/hooks/use-current-date";
import { format } from "date-fns";
import { AlertTriangle, Calendar as CalendarIcon, Gavel } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { Project } from "../../../../types";
import { completeProjectAction } from "../../../../actions/sales";
import { StatusTransitionDialog } from "../../status-transition-dialog";

interface DealDialogProps {
  project: Project;
  onSuccess?: () => void;
  /** 可选受控打开状态（详情页 Hero 主 CTA 接线用；不传则由自带触发按钮驱动） */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DealDialog({ project, onSuccess, open, onOpenChange }: DealDialogProps) {
  const initialDate = useCurrentDate();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  // 派生值：用户未选择时默认今天，SSR 时为 undefined 避免 hydration 不匹配
  const date = selectedDate ?? initialDate ?? undefined;
  const [price, setPrice] = useState("");

  // 动态让利 hint：输入价与挂牌价均有效且输入价低于挂牌价时显示
  const listingPrice = project.list_price ?? project.listing_price;
  const inputPrice = Number(price);
  const showDiscountHint =
    listingPrice != null &&
    listingPrice > 0 &&
    price !== "" &&
    inputPrice > 0 &&
    inputPrice < listingPrice;
  const discountDiff = showDiscountHint ? Number((listingPrice - inputPrice).toFixed(2)) : 0;
  const discountPct = showDiscountHint
    ? (((listingPrice - inputPrice) / listingPrice) * 100).toFixed(1)
    : "";

  const handleConfirm = async () => {
    if (!date) {
      toast.error("请选择成交日期");
      throw new Error("请选择成交日期");
    }
    if (!price || Number(price) <= 0) {
      toast.error("请输入有效的成交价格");
      throw new Error("请输入有效的成交价格");
    }

    const res = await completeProjectAction(project.id, {
      soldPrice: Number(price),
      soldDate: format(date, "yyyy-MM-dd"),
    });

    if (res.success) {
      toast.success("恭喜！项目已成功结案");
      if (onSuccess) onSuccess();
      return;
    }

    toast.error(res.message || "操作失败");
    throw new Error(res.message || "操作失败");
  };

  return (
    <StatusTransitionDialog
      triggerLabel="确认成交"
      triggerIcon={<Gavel className="mr-2 h-4 w-4" />}
      // Hero 主 CTA 是页面唯一 Ink 实心胶囊，视图内触发按钮降为次级描边形态（仅样式）
      triggerVariant="outline"
      triggerClassName="w-full gap-2 h-10"
      hideTrigger={open !== undefined}
      kicker="阶段流转 · Selling → Sold"
      title="确认成交"
      description="成交确认后项目进入已售归档阶段，财务数据将锁定。请填写成交价与日期。"
      confirmLabel="确认成交"
      onConfirm={handleConfirm}
      open={open}
      onOpenChange={onOpenChange}
    >
      <div className="grid gap-[14px] py-0">
        <div className="grid gap-2">
          <Label htmlFor="deal-price" className="text-xs font-medium text-muted-foreground">
            成交价格（万元）
          </Label>
          <div className="relative">
            <Input
              id="deal-price"
              type="number"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="pl-3 pr-8 border-border focus-visible:ring-status-selling"
            />
            <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">万</span>
          </div>
          {showDiscountHint && (
            <p className="text-xs text-muted-foreground">
              较挂牌价 {listingPrice} 万让利 {discountDiff} 万（{discountPct}%）
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="deal-date" className="text-xs font-medium text-muted-foreground">
            成交日期
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="deal-date"
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal border-border hover:bg-muted",
                  !date && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, "yyyy年MM月dd日") : <span>选择日期</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={date} onSelect={setSelectedDate} initialFocus />
            </PopoverContent>
          </Popover>
        </div>

        {/* V4.1 危险提示行（原型 .danger-note 样式） */}
        <div className="mt-1 flex gap-2.5 rounded-[14px] border border-[#f0dcd2] bg-[#fdf4ef] px-[15px] py-[13px] text-[13.5px] font-[430] leading-[1.55] text-rust">
          <AlertTriangle className="mt-[2px] h-4 w-4 shrink-0" />
          <span>已售为归档终态，确认后不可恢复为在售。</span>
        </div>
      </div>
    </StatusTransitionDialog>
  );
}
