"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CircleDot, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, isValid } from "date-fns";

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

import { PhotoGrid } from "./photo-grid";
import { ActionBar } from "./action-bar";
import { useRenovationUpload } from "./use-renovation-upload";

import { Project, RenovationPhoto } from "../../../../../types";
import { RENOVATION_STAGES } from "../../../constants";
import { updateRenovationStageAction, deleteRenovationPhotoAction } from "../../../../../actions/renovation";

// 【关键修复】本地临时照片类型，用于上传后立即显示
interface LocalTempPhoto {
  id: string;
  url: string;
  filename: string;
  createdAt: string;
}

interface TimelineItemProps {
  stage: (typeof RENOVATION_STAGES)[number];
  index: number;
  currentIndex: number;
  project: Project;
  photos: RenovationPhoto[];
  onPhotoUploaded: () => void;
  onRefresh?: () => void;
}

export function TimelineItem({
  stage,
  index,
  currentIndex,
  project,
  photos,
  onPhotoUploaded,
  onRefresh,
}: TimelineItemProps) {
  const router = useRouter();
  const [isSubmittingStage, setIsSubmittingStage] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  // 【关键修复】本地临时照片状态，上传后立即显示，避免图片"消失"
  const [localTempPhotos, setLocalTempPhotos] = useState<LocalTempPhoto[]>([]);

  // 【关键修复】处理新照片添加到本地状态
  const handlePhotoAdded = useCallback((photo: { url: string; filename: string }) => {
    const newPhoto: LocalTempPhoto = {
      id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      url: photo.url,
      filename: photo.filename,
      createdAt: new Date().toISOString(),
    };
    setLocalTempPhotos((prev) => [...prev, newPhoto]);
  }, []);

  // 【关键修复】当服务器刷新后，清理本地临时照片（避免重复显示）
  const handlePhotoUploaded = useCallback(() => {
    setLocalTempPhotos([]); // 清理本地临时照片，因为服务器已经有了
    onPhotoUploaded();
  }, [onPhotoUploaded]);

  const { uploadQueue, handleUpload } = useRenovationUpload({
    projectId: project.id,
    stageValue: stage.value,
    onPhotoUploaded: handlePhotoUploaded,
    onPhotoAdded: handlePhotoAdded, // 【关键修复】上传成功后立即添加到本地状态
  });

  // 【关键修复】合并服务器照片和本地临时照片，优先显示本地照片（更新鲜）
  const displayPhotos = useMemo(() => {
    // 将本地临时照片转换为 RenovationPhoto 格式
    const localPhotos: RenovationPhoto[] = localTempPhotos.map((p) => ({
      id: p.id,
      url: p.url,
      filename: p.filename,
      stage: stage.value,
      project_id: project.id,
      created_at: p.createdAt,
    }));
    // 服务器照片 + 本地临时照片
    return [...photos, ...localPhotos];
  }, [photos, localTempPhotos, stage.value, project.id]);

  // [修改] 优先通过 renovationStageDates 判断是否已完成
  const stageFinishDateStr = project.renovationStageDates?.[stage.value];
  const isCompleted = !!stageFinishDateStr || index < currentIndex;
  const isCurrent = !isCompleted && index === currentIndex;
  const isFuture = !isCompleted && index > currentIndex;

  const handleSubmit = async () => {
    if (uploadQueue.length > 0) {
      toast.warning("请等待图片上传完成");
      return;
    }
    if (displayPhotos.length === 0) {
      toast.error("请至少上传一张验收照片");
      return;
    }

    setIsSubmittingStage(true);
    try {
      const nextStage = RENOVATION_STAGES[index + 1];
      // [修复] 即使是最后一个阶段也允许提交，传 "交付后" 或类似标志给后端
      const res = await updateRenovationStageAction({
        projectId: project.id,
        renovation_stage: nextStage ? nextStage.value : "已完成",
        stage_completed_at: selectedDate?.toISOString(),
      });

      if (res.success) {
        toast.success(`完成 ${stage.label}${nextStage ? `，进入 ${nextStage.label}` : ""}`);
        router.refresh();
        if (onRefresh) await onRefresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("操作失败");
    } finally {
      setIsSubmittingStage(false);
    }
  };

  const handleDelete = async (photoId: string) => {
    const toastId = toast.loading("正在删除...");
    try {
      const res = await deleteRenovationPhotoAction(project.id, photoId);
      if (res.success) {
        toast.success("删除成功");
        onPhotoUploaded();
      } else {
        throw new Error(res.message);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "删除失败";
      toast.error(msg);
    } finally {
      toast.dismiss(toastId);
    }
  };

  const renderFinishDate = () => {
    if (!stageFinishDateStr) return null;
    try {
      const date = parseISO(stageFinishDateStr);
      if (isValid(date)) {
        return <span className="text-[12px] text-success font-mono ml-auto"> {format(date, "MM-dd")}</span>;
      }
    } catch {
      return null;
    }
  };

  return (
    <AccordionItem value={stage.key} className="border-none relative" disabled={isFuture}>
      <div className="absolute left-0 top-1 z-10 bg-card p-1">
        {isCompleted ? (
          <CheckCircle2 className="h-6 w-6 text-status-selling fill-status-selling/10" />
        ) : isCurrent ? (
          <CircleDot className="h-6 w-6 text-status-renovating animate-pulse" />
        ) : (
          <Circle className="h-6 w-6 text-muted-foreground/30" />
        )}
      </div>

      <AccordionTrigger className={cn("pl-12 py-1 hover:no-underline data-[state=open]:py-1 group", isFuture ? "cursor-not-allowed opacity-60" : "")}>
        <div className="flex items-center gap-3 w-full">
          <span className={cn("text-lg transition-colors", isCurrent ? "font-bold text-foreground" : "font-medium text-muted-foreground group-hover:text-foreground")}>
            {stage.label}
          </span>
          {isCurrent && <Badge variant="secondary" className="bg-status-renovating/10 text-status-renovating hover:bg-status-renovating/10 border-none">进行中</Badge>}
          {(displayPhotos.length > 0 || uploadQueue.length > 0) && !isCurrent && (
            <span className="text-xs text-muted-foreground ml-2 bg-muted px-1.5 rounded">{displayPhotos.length + uploadQueue.length} 张照片</span>
          )}
          {renderFinishDate()}
        </div>
      </AccordionTrigger>

      <AccordionContent className="pl-12 pt-4 pb-2">
        <div className={cn("rounded-lg border p-4 space-y-4 transition-all", isCurrent ? "bg-card border-status-renovating/30 shadow-sm" : "bg-muted/50 border-border")}>
          <PhotoGrid photos={displayPhotos} uploadingPhotos={uploadQueue} isCurrent={isCurrent} isFuture={isFuture} isLoading={isSubmittingStage} onUpload={handleUpload} onDelete={handleDelete} />
          <ActionBar isCurrent={isCurrent} selectedDate={selectedDate} isLoading={isSubmittingStage} onDateSelect={setSelectedDate} onSubmit={handleSubmit} />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
