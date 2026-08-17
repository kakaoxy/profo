"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, parseISO, isValid, differenceInDays } from "date-fns";
import { useCurrentDate } from "@/hooks/use-current-date";

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
  const today = useCurrentDate();
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
  const isLast = index === RENOVATION_STAGES.length - 1;

  // 区间起始日期：上一阶段完成日期（首阶段取 renovation_start_date），不可得则单日展示
  const stageStartDateStr = (() => {
    const stageDates = project.renovationStageDates ?? {};
    if (index === 0) return project.renovation_start_date ?? undefined;
    return stageDates[RENOVATION_STAGES[index - 1].value];
  })();

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

  // 完成态日期：起止均可得且起始早于完成时显示区间，否则单日
  const renderFinishDate = () => {
    if (!stageFinishDateStr) return null;
    try {
      const end = parseISO(stageFinishDateStr);
      if (!isValid(end)) return null;
      const endText = format(end, "MM.dd");
      if (stageStartDateStr) {
        const start = parseISO(stageStartDateStr);
        if (isValid(start) && start.getTime() < end.getTime()) {
          return (
            <span className="text-[13px] font-[430] text-graphite">
              {format(start, "MM.dd")} – {endText}
            </span>
          );
        }
      }
      return <span className="text-[13px] font-[430] text-graphite">{endText}</span>;
    } catch {
      return null;
    }
  };

  // 进行中阶段：起始日期展示（设计稿 tl-date「09.03 开始」）
  const renderStartDate = () => {
    if (!isCurrent || !stageStartDateStr) return null;
    try {
      const start = parseISO(stageStartDateStr);
      if (!isValid(start)) return null;
      return (
        <span className="text-[13px] font-[430] text-graphite">{format(start, "MM.dd")} 开始</span>
      );
    } catch {
      return null;
    }
  };

  // 进行中阶段已进行天数（设计稿 chip「进行中 · 第 N 天」；起始日期缺失则省略）
  const stageElapsedDays = (() => {
    if (!isCurrent || !stageStartDateStr || !today) return null;
    try {
      const start = parseISO(stageStartDateStr);
      if (!isValid(start)) return null;
      const days = differenceInDays(today, start) + 1;
      return days >= 1 ? days : null;
    } catch {
      return null;
    }
  })();

  return (
    // 设计稿 .tl-item：左右 gap 18px、非末项下边距 26px
    <div className={cn("flex gap-[18px]", !isLast && "pb-[26px]")}>
      {/* 左轨道：圆点 + 连线（done=Ink 实心 · now=Rust 点+光环 · todo=灰空心） */}
      <div className="flex w-[22px] shrink-0 flex-col items-center">
        <span
          className={cn(
            "z-[1] mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2",
            isCompleted
              ? "border-ink bg-ink"
              : isCurrent
                ? "border-rust bg-rust shadow-[0_0_0_5px_rgba(93,42,26,0.12)]"
                : "border-dove bg-pure-white",
          )}
        />
        {!isLast && (
          <span className={cn("mt-1.5 w-[1.5px] flex-1", isCompleted ? "bg-ink" : "bg-muted")} />
        )}
      </div>

      {/* 右内容：头部（阶段名 + 状态 chip + 起始/区间日期）→ 照片墙 → 操作区（设计稿无描边盒子） */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[15.5px] font-[500] text-ink">{stage.label}</span>
          {isCompleted && (
            <span className="rounded-full bg-[#e5efe7] px-2.5 py-[2.5px] text-xs font-[450] text-[#3e6b4f]">
              已完成
            </span>
          )}
          {isCurrent && (
            <span className="rounded-full bg-apricot-wash px-2.5 py-[2.5px] text-xs font-[450] text-rust">
              {stageElapsedDays ? `进行中 · 第 ${stageElapsedDays} 天` : "进行中"}
            </span>
          )}
          {!isCompleted && !isCurrent && (
            <span className="rounded-full bg-fog px-2.5 py-[2.5px] text-xs font-[450] text-graphite">
              待开始
            </span>
          )}
          {renderStartDate()}
          {renderFinishDate()}
        </div>

        {/* 照片墙 + 操作区（photos mt-12px / actions mt-10px，设计稿 .photos / .tl-actions） */}
        <div className="mt-3 space-y-2.5">
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
      </div>

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
    </div>
  );
}
