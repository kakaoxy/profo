"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GrowthEmployee, GrowthFallbackEmployee } from "../../_lib/growth-data";

/** 「不设置」哨兵值（Radix Select 空串与未选择语义重叠，同筛选栏口径用哨兵） */
const NONE = "none";

interface FallbackEmployeeDialogProps {
  /** 弹窗打开（null 表示关闭） */
  open: boolean;
  /** 当前全局兜底配置（打开时回显） */
  fallbackEmployee: GrowthFallbackEmployee;
  /** 员工下拉数据源（与筛选栏同源） */
  employees: GrowthEmployee[];
  /** 提交中（确认按钮禁用 + loading） */
  submitting: boolean;
  /** 确认回调（employeeId=null 表示清除设置） */
  onConfirm: (employeeId: string | null) => void;
  /** 关闭回调 */
  onClose: () => void;
}

/**
 * 全局兜底负责人设置弹窗：
 * 分享归因与讲房人均未命中时，无归属留资自动归属该员工（兜底链最后一环）；
 * 仅影响后续新建留资，存量无归属线索仍走行内「设置归属」手动指派。
 */
export function FallbackEmployeeDialog({
  open,
  fallbackEmployee,
  employees,
  submitting,
  onConfirm,
  onClose,
}: FallbackEmployeeDialogProps) {
  const [selected, setSelected] = React.useState<string>(NONE);

  // 每次打开回显当前配置
  React.useEffect(() => {
    if (open) {
      setSelected(fallbackEmployee.employeeId ?? NONE);
    }
  }, [open, fallbackEmployee]);

  const currentLabel = fallbackEmployee.employeeName ?? "未设置";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogTitle className="text-base font-medium text-ink">全局兜底负责人</DialogTitle>
        <DialogDescription className="text-[13px] text-graphite">
          分享归因与讲房人均未命中时，新留资自动归属该员工并通知跟进（当前：
          <span className="text-ink font-medium">{currentLabel}</span>）。仅影响后续新建留资，
          存量无归属线索请逐条「设置归属」
        </DialogDescription>

        <div className="flex flex-col gap-1.5">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="h-9.5 rounded-inputs border-dove bg-white text-[14px] w-full">
              <SelectValue placeholder="选择员工" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>不设置（保持无归属）</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-[14px] font-medium text-ink px-0.5 hover:opacity-60 transition-opacity"
          >
            取消
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => onConfirm(selected === NONE ? null : selected)}
            className="h-9 px-4 rounded-[10px] bg-ink text-white text-[13px] font-medium inline-flex items-center gap-1 hover:opacity-85 transition-opacity disabled:opacity-35 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
            保存
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
