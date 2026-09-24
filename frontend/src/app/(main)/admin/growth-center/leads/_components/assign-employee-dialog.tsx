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
import type { GrowthEmployee } from "../../_lib/growth-data";

interface AssignEmployeeDialogProps {
  /** 弹窗打开（null 表示关闭，打开时携带目标线索客户脱敏号用于文案展示） */
  leadPhoneMasked: string | null;
  /** 员工下拉数据源（与筛选栏同源） */
  employees: GrowthEmployee[];
  /** 提交中（确认按钮禁用 + loading） */
  submitting: boolean;
  /** 确认指派回调（employeeId 已通过前端必选拦截） */
  onConfirm: (employeeId: string) => void;
  /** 关闭回调 */
  onClose: () => void;
}

/**
 * 无归属线索兜底员工指派弹窗：
 * 从员工列表选择归属人后确认，后端校验（存在/active/后台身份）并回写归属；
 * 已归属线索不进入本弹窗（操作入口仅对无归属行渲染）。
 */
export function AssignEmployeeDialog({
  leadPhoneMasked,
  employees,
  submitting,
  onConfirm,
  onClose,
}: AssignEmployeeDialogProps) {
  const [employeeId, setEmployeeId] = React.useState("");

  // 每次打开重置选择
  React.useEffect(() => {
    if (leadPhoneMasked !== null) {
      setEmployeeId("");
    }
  }, [leadPhoneMasked]);

  if (leadPhoneMasked === null) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogTitle className="text-base font-medium text-ink">设置归属员工</DialogTitle>
        <DialogDescription className="text-[13px] text-graphite">
          客户 {leadPhoneMasked} 暂无归属员工（直接进入未分享归因），指派后该员工将在
          「我的客户」中跟进并接收新线索通知
        </DialogDescription>

        <div className="flex flex-col gap-1.5">
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger className="h-9.5 rounded-inputs border-dove bg-white text-[14px] w-full">
              <SelectValue placeholder="选择员工" />
            </SelectTrigger>
            <SelectContent>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!employeeId && <p className="text-[12.5px] text-rust">请先选择员工</p>}
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
            disabled={!employeeId || submitting}
            onClick={() => onConfirm(employeeId)}
            className="h-9 px-4 rounded-[10px] bg-ink text-white text-[13px] font-medium inline-flex items-center gap-1 hover:opacity-85 transition-opacity disabled:opacity-35 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
            确认指派
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
