"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CircleDot, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, isValid } from "date-fns";

import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

import { PhotoGrid } from "./photo-grid";
import { ActionBar } from "./action-bar";
import { useRenovationUpload } from "./use-renovation-upload";

import { Project, RenovationPhoto } from "../../../../../types";
import { RENOVATION_STAGES } from "../../../constants";
import {
  updateRenovationStageAction,
  updateRenovationStageDateAction,
  deleteRenovationPhotoAction,
} from "../../../../../actions/renovation";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";

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
  const { roleCode, hasAnyPermission } = usePermission();
  const [isSubmittingStage, setIsSubmittingStage] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  useEffect(() => {
    setSelectedDate(new Date());
  }, []);

  // 已完成阶段修改/清空相关 state（仅 admin）
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [editDate, setEditDate] = useState<Date | undefined>(undefined);
  const [isEditingSubmitting, setIsEditingSubmitting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const { uploadQueue, handleUpload } = useRenovationUpload({
    projectId: project.id,
    stageValue: stage.value,
    onPhotoUploaded,
  });

  // [修改] 优先通过 renovationStageDates 判断是否已完成（无序模式下只看完成日期）
  const stageFinishDateStr = project.renovationStageDates?.[stage.value];
  const isCompleted = !!stageFinishDateStr;
  const isCurrent = !isCompleted && index === currentIndex;

  // 业务身份校验：权限码 OR 后端计算的业务身份标志
  const canEditByPermission = hasAnyPermission([
    PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO,
    PERMISSION_CODES.PROJECT_WRITE,
  ]);
  const canCompleteByPermission = hasAnyPermission([
    PERMISSION_CODES.PROJECT_RENOVATION_COMPLETE_STAGE,
    PERMISSION_CODES.PROJECT_WRITE,
  ]);
  const canEditRenovation = canEditByPermission || project.renovation?.can_edit_renovation === true;
  const canComplete = canCompleteByPermission || project.renovation?.can_edit_renovation === true;

  // 仅 admin 可修改/清空已完成阶段的时间
  const canEditDate = roleCode === "admin";

  const handleSubmit = async () => {
    if (uploadQueue.length > 0) {
      toast.warning("请等待图片上传完成");
      return;
    }

    setIsSubmittingStage(true);
    try {
      const res = await updateRenovationStageAction({
        projectId: project.id,
        completed_stage: stage.value,
        stage_completed_at: selectedDate?.toISOString(),
      });

      if (res.success) {
        toast.success(`完成 ${stage.label}`);
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

  const handleStartEditDate = () => {
    // 默认填充当前已完成日期
    if (stageFinishDateStr) {
      try {
        const parsed = parseISO(stageFinishDateStr);
        setEditDate(isValid(parsed) ? parsed : new Date());
      } catch {
        setEditDate(new Date());
      }
    } else {
      setEditDate(new Date());
    }
    setIsEditingDate(true);
  };

  const handleCancelEditDate = () => {
    setIsEditingDate(false);
    setEditDate(undefined);
  };

  const handleSubmitEditDate = async () => {
    if (!editDate) {
      toast.warning("请选择新的完成日期");
      return;
    }
    setIsEditingSubmitting(true);
    try {
      const res = await updateRenovationStageDateAction({
        projectId: project.id,
        stage: stage.value,
        stage_completed_at: editDate.toISOString(),
      });
      if (res.success) {
        toast.success("阶段时间已更新");
        setIsEditingDate(false);
        setEditDate(undefined);
        router.refresh();
        if (onRefresh) await onRefresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("操作失败");
    } finally {
      setIsEditingSubmitting(false);
    }
  };

  const handleClearDate = async () => {
    setShowClearConfirm(false);
    setIsClearing(true);
    try {
      const res = await updateRenovationStageDateAction({
        projectId: project.id,
        stage: stage.value,
        stage_completed_at: null,
      });
      if (res.success) {
        toast.success(`已清空 ${stage.label} 完成时间`);
        router.refresh();
        if (onRefresh) await onRefresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("操作失败");
    } finally {
      setIsClearing(false);
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
        return (
          <span className="text-[12px] text-success font-mono ml-auto">
            {" "}
            {format(date, "MM-dd")}
          </span>
        );
      }
    } catch {
      return null;
    }
  };

  return (
    <AccordionItem value={stage.key} className="border-none relative">
      <div className="absolute left-0 top-1 z-10 bg-card p-1">
        {isCompleted ? (
          <CheckCircle2 className="h-6 w-6 text-status-selling fill-status-selling/10" />
        ) : isCurrent ? (
          <CircleDot className="h-6 w-6 text-status-renovating animate-pulse" />
        ) : (
          <Circle className="h-6 w-6 text-muted-foreground/30" />
        )}
      </div>

      <AccordionTrigger
        className={cn("pl-12 py-1 hover:no-underline data-[state=open]:py-1 group")}
      >
        <div className="flex items-center gap-3 w-full">
          <span
            className={cn(
              "text-lg transition-colors",
              isCurrent
                ? "font-bold text-foreground"
                : "font-medium text-muted-foreground group-hover:text-foreground",
            )}
          >
            {stage.label}
          </span>
          {isCurrent && (
            <Badge
              variant="secondary"
              className="bg-status-renovating/10 text-status-renovating hover:bg-status-renovating/10 border-none"
            >
              进行中
            </Badge>
          )}
          {(photos.length > 0 || uploadQueue.length > 0) && !isCurrent && (
            <span className="text-xs text-muted-foreground ml-2 bg-muted px-1.5 rounded">
              {photos.length + uploadQueue.length} 张照片
            </span>
          )}
          {renderFinishDate()}
        </div>
      </AccordionTrigger>

      <AccordionContent className="pl-12 pt-4 pb-2">
        <div
          className={cn(
            "rounded-lg border p-4 space-y-4 transition-all",
            isCurrent
              ? "bg-card border-status-renovating/30 shadow-sm"
              : "bg-muted/50 border-border",
          )}
        >
          <PhotoGrid
            photos={photos}
            uploadingPhotos={uploadQueue}
            isLoading={isSubmittingStage}
            canEditRenovation={canEditRenovation}
            onUpload={handleUpload}
            onDelete={handleDelete}
          />
          <ActionBar
            isCompleted={isCompleted}
            selectedDate={selectedDate}
            isLoading={isSubmittingStage}
            canComplete={canComplete}
            onDateSelect={setSelectedDate}
            onSubmit={handleSubmit}
            canEditDate={canEditDate}
            isEditingDate={isEditingDate}
            editDate={editDate}
            isEditingSubmitting={isEditingSubmitting}
            isClearing={isClearing}
            onEditDateSelect={setEditDate}
            onStartEditDate={handleStartEditDate}
            onCancelEditDate={handleCancelEditDate}
            onSubmitEditDate={handleSubmitEditDate}
            onClearDate={() => setShowClearConfirm(true)}
          />
        </div>
      </AccordionContent>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清空该阶段完成时间？</AlertDialogTitle>
            <AlertDialogDescription>
              清空后，{stage.label}{" "}
              将回退为未完成状态。已上传的照片不受影响，可重新选择日期标记完成。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearing}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearDate}
              disabled={isClearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AccordionItem>
  );
}
