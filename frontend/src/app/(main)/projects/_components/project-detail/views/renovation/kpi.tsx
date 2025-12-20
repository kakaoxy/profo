"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Image as ImageIcon } from "lucide-react";
import { Project } from "../../../../types";
import { RENOVATION_STAGES } from "../../constants";
import { differenceInDays, addDays } from "date-fns";
// [新增] 引入获取照片的 Action
import { getRenovationPhotosAction } from "../../../../actions";

interface RenovationKPIsProps {
  project: Project;
}

export function RenovationKPIs({ project }: RenovationKPIsProps) {
  // [新增] 用于存储照片总数的状态
  const [photoCount, setPhotoCount] = useState(0);

  // 1. 计算倒计时逻辑
  const today = new Date();
  const handoverDate = project.planned_handover_date
    ? new Date(project.planned_handover_date)
    : new Date();

  const deadlineDate = addDays(handoverDate, 65);
  const daysLeft = differenceInDays(deadlineDate, today);

  let daysColor = "text-green-600";
  if (daysLeft < 10) daysColor = "text-red-600 animate-pulse";
  else if (daysLeft <= 30) daysColor = "text-orange-500";

  // 2. 计算索引用于传参 (与 RenovationTimeline 同步逻辑)
  const currentIndex = (() => {
    // 如果阶段是 "已完成"，或者项目已经进入在售/已售状态，说明装修已全部结束
    if (project.renovation_stage === "已完成" || ["selling", "sold"].includes(project.status)) {
      return RENOVATION_STAGES.length;
    }
    const idx = RENOVATION_STAGES.findIndex(
      (s) => s.value === project.renovation_stage || s.key === project.renovation_stage
    );
    return idx === -1 ? 0 : idx;
  })();

  const currentStageLabel = currentIndex < RENOVATION_STAGES.length 
    ? RENOVATION_STAGES[currentIndex].label 
    : "已完成";

  // 3. 计算总体进度
  // 如果已经完成，进度定死 100%
  const progressValue = currentIndex >= RENOVATION_STAGES.length
    ? 100
    : Math.round(((currentIndex + 1) / RENOVATION_STAGES.length) * 100);

  // 4. [关键修改] 异步获取照片总数
  useEffect(() => {
    const fetchTotalPhotos = async () => {
      try {
        // 调用接口获取该项目下 *所有* 照片 (不传 stage 参数即为获取全部)
        const res = await getRenovationPhotosAction(project.id);
        if (res.success && Array.isArray(res.data)) {
          // 直接取数组长度作为总数
          setPhotoCount(res.data.length);
        }
      } catch (error) {
        console.error("获取照片统计失败", error);
      }
    };

    if (project.id) {
      fetchTotalPhotos();
    }
  }, [project.id]);

  return (
    <div className="grid grid-cols-4 gap-4 mb-8">
      {/* 卡片 1: 交付倒计时 */}
      <Card className="shadow-sm">
        <CardContent className="p-4 flex flex-col justify-between h-full">
          <span className="text-xs text-muted-foreground font-medium">
            交付倒计时
          </span>
          <div>
            <div className={cn("text-2xl font-bold font-mono", daysColor)}>
              {daysLeft}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                天
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              截止: {deadlineDate.toLocaleDateString()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 卡片 2: 当前阶段 */}
      <Card className="shadow-sm border-orange-100 bg-orange-50/30">
        <CardContent className="p-4 flex flex-col justify-between h-full">
          <span className="text-xs text-muted-foreground font-medium">
            当前阶段
          </span>
          <div className="space-y-1">
            <div className="text-xl font-bold text-slate-900">
              {currentStageLabel}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
              </span>
              <span className="text-xs text-orange-600 font-medium">
                进行中
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 卡片 3: 总体进度 */}
      <Card className="shadow-sm">
        <CardContent className="p-4 flex flex-col justify-between h-full">
          <span className="text-xs text-muted-foreground font-medium">
            总体进度
          </span>
          <div>
            <div className="text-2xl font-bold text-slate-900 mb-1">
              {progressValue}%
            </div>
            <Progress
              value={progressValue}
              className="h-2 bg-slate-100 [&>*]:bg-orange-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* 卡片 4: 现场相册 */}
      <Card className="shadow-sm hover:bg-slate-50 cursor-pointer transition-colors group">
        <CardContent className="p-4 flex flex-col justify-between h-full">
          <span className="text-xs text-muted-foreground font-medium">
            现场相册
          </span>
          <div className="flex items-center justify-between">
            <div className="text-2xl font-bold text-slate-900">
              {/* 显示计算出来的 photoCount */}
              {photoCount}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                张
              </span>
            </div>
            <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all">
              <ImageIcon className="h-4 w-4 text-slate-600" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
