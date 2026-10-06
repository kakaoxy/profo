"use client";

import { memo, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PriceChangeCard } from "./price-change-card";
import type { L4MarketingProject } from "@/app/(main)/admin/marketing/types";

/** 列表行内调价弹层 props. */
interface PricePopoverProps {
  project: L4MarketingProject;
  /** 触发器（列表操作列「调价」项） */
  trigger: React.ReactNode;
}

/**
 * 列表行内快捷调价弹层（设计稿 Artboard C）.
 *
 * - 受控开关：提交成功（onPriceSuccess）或取消（onCancel）时关闭弹层
 * - 内嵌 PriceChangeCard variant="popover"（恒为表单态，不拉时间线）
 * - Radix 自动定位（side="top" 对齐行上方，空间不足自动翻转），不手写箭头定位
 * - 关闭规则：点外部 / Esc / ✕（Radix 原生）+ 成功/取消（受控）
 * - 成功链路：组件内 toast → 关闭弹层 → router.refresh（行总价/调价副行/订阅计数同步）
 */
export const PricePopover = memo(function PricePopover({
  project,
  trigger,
}: PricePopoverProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  /** 提交成功：关弹层 → 刷新列表 RSC 缓存（行内三处数据同步） */
  const handleSuccess = useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  /** 取消：关弹层（输入由组件内部清空） */
  const handleCancel = useCallback(() => {
    setOpen(false);
  }, []);

  const area = Number(project.area);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        // Radix Portal 保留 React 树冒泡：弹层内点击会沿 React 树冒泡到 TableRow 的 onRowClick
        // 触发软导航到详情页（覆盖弹层）。在此截断冒泡（入口按钮自身已有 stopPropagation）。
        onClick={(e) => e.stopPropagation()}
        className="w-80 rounded-cards border-dove/40 p-4 shadow-steep"
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="truncate text-xs font-medium text-ink">
            调价 · {project.title || "未命名项目"}
          </span>
          <PopoverPrimitive.Close
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-dove hover:bg-fog hover:text-ink"
            aria-label="关闭"
          >
            <X className="h-3.5 w-3.5" />
          </PopoverPrimitive.Close>
        </div>
        <div className="mb-3 text-[11px] text-graphite tabular-nums">
          当前总价{" "}
          <b className="text-sm font-medium text-ink">
            {Number(project.total_price).toFixed(2)} 万
          </b>
          {Number.isFinite(area) && area > 0 && <span> · {area} ㎡</span>}
        </div>
        <PriceChangeCard
          variant="popover"
          project={project}
          onPriceSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </PopoverContent>
    </Popover>
  );
});
