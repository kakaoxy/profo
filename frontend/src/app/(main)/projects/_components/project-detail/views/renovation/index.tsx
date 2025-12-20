import { useState } from "react";
import { useRouter } from "next/navigation";
import { Store, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

// 确保这里的 types 路径是正确的，通常是 4 层 ../
import { Project } from "../../../../types";
// [修复 1] 修正 actions 路径，从 5 层改为 4 层
import { updateProjectStatusAction } from "../../../../actions";
import { RenovationKPIs } from "./kpi";
import { RenovationTimeline } from "./timeline";
import { StatusTransitionDialog } from "../../status-transition-dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RenovationViewProps {
  project: Project;
  onRefresh?: () => void;
}

export function RenovationView({ project, onRefresh }: RenovationViewProps) {
  const router = useRouter();
  const [listingDate, setListingDate] = useState<Date | undefined>(new Date());

  // 定义完工逻辑
  const handleCompletion = async () => {
    try {
      // 调用 Action 更新状态为 selling，并传入上架时间
      const res = await updateProjectStatusAction(
        project.id, 
        "selling", 
        listingDate?.toISOString()
      );
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
              项目状态将流转为 <b>&quot;在售 (Selling)&quot;</b>
              ，并进入销售管理流程。
            </>
          }
          confirmLabel="确认上架"
          onConfirm={handleCompletion}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">上架日期</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal h-10",
                      !listingDate && "text-muted-foreground"
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
              <p className="text-[12px] text-muted-foreground">
                请选择该项目实际在平台上架销售的日期
              </p>
            </div>
          </div>
        </StatusTransitionDialog>
      </div>
    </div>
  );
}
