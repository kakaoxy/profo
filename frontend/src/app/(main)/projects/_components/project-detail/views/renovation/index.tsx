"use client";

import { useRouter } from "next/navigation";
import { Store } from "lucide-react";
import { toast } from "sonner";

// 确保这里的 types 路径是正确的，通常是 4 层 ../
import { Project } from "../../../../types";
// [修复 1] 修正 actions 路径，从 5 层改为 4 层
import { updateProjectStatusAction } from "../../../../actions";
import { RenovationKPIs } from "./kpi";
import { RenovationTimeline } from "./timeline";
import { StatusTransitionDialog } from "../../status-transition-dialog";

interface RenovationViewProps {
  project: Project;
  onRefresh?: () => void;
}

export function RenovationView({ project, onRefresh }: RenovationViewProps) {
  const router = useRouter();

  // 定义完工逻辑
  const handleCompletion = async () => {
    try {
      // 调用 Action 更新状态为 selling
      const res = await updateProjectStatusAction(project.id, "selling");
      if (!res.success) throw new Error(res.message);

      toast.success("装修已完成，项目已转为在售状态！");

      // 刷新数据
      router.refresh();
      if (onRefresh) await onRefresh();
    } catch (error: unknown) {
      // [修复 2] 使用 unknown 替代 any，并进行安全类型检查
      const msg = error instanceof Error ? error.message : "操作失败";
      toast.error(msg);
      throw error;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300 pb-10">
      <RenovationKPIs project={project} />
      <RenovationTimeline project={project} onRefresh={onRefresh} />

      <div className="mt-8 pt-6 border-t border-dashed">
        <StatusTransitionDialog
          triggerLabel="装修验收完成，上架销售"
          triggerIcon={<Store className="h-4 w-4" />}
          title="确认完工并上架？"
          description={
            <>
              此操作表示所有装修阶段已全部结束。
              <br />
              {/* [修复 3] 使用 &quot; 转义双引号 */}
              项目状态将流转为 <b>&quot;在售 (Selling)&quot;</b>
              ，并进入销售管理流程。
            </>
          }
          confirmLabel="确认上架"
          onConfirm={handleCompletion}
        />
      </div>
    </div>
  );
}
