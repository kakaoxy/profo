"use client";

// ⚠️ 过渡方案:转发到 @/components/finance/record-dialog,待调用方迁移后删除
import { RecordDialog } from "@/components/finance/record-dialog";

interface AddRecordDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  businessForm?: "agent" | "wholesale" | null;
}

/**
 * 记账弹窗（项目资金账本页使用）
 *
 * 已替换为引用共享组件 @/components/finance/record-dialog，
 * 行为与资金账本详情页一致。保留默认导出名以减少调用方改动。
 */
export function AddRecordDialog({
  projectId,
  isOpen,
  onClose,
  onSuccess,
  businessForm,
}: AddRecordDialogProps) {
  return (
    <RecordDialog
      projectId={projectId}
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={onSuccess}
      businessForm={businessForm}
    />
  );
}

export default AddRecordDialog;
