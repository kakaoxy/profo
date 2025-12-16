"use client";

import { Handshake } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { StatusTransitionDialog } from "../../status-transition-dialog";
import { updateProjectStatusAction } from "../../../../actions";
import { Project } from "../../../../types";

interface DealDialogProps {
  project: Project;
  onSuccess?: () => void;
}

export function DealDialog({ project, onSuccess }: DealDialogProps) {
  const router = useRouter();

  const handleConfirm = async () => {
    // 调用接口更新状态为 sold
    const res = await updateProjectStatusAction(project.id, "sold");
    if (!res.success) throw new Error(res.message);

    toast.success("恭喜！项目已确认成交 🎉");

    // 刷新数据
    router.refresh();
    if (onSuccess) onSuccess();
  };

  return (
    <StatusTransitionDialog
      triggerLabel="确认成交"
      triggerIcon={<Handshake className="h-4 w-4" />}
      // 自定义样式，使其更显眼
      triggerVariant="default"
      title="确认成交结算？"
      description={
        <span>
          确认后项目将流转至 <b>&quot;已售 (Sold)&quot;</b> 状态。
          <br />
          请确保已完成所有合同签署及款项确认。
        </span>
      }
      confirmLabel="确认成交"
      onConfirm={handleConfirm}
    />
  );
}
