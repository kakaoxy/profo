"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CircleDot, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

import { PhotoGrid } from "./photo-grid";
import { ActionBar } from "./action-bar";

import { Project, RenovationPhoto } from "../../../../../types";
import { RENOVATION_STAGES } from "../../../constants";
import {
  addRenovationPhotoAction,
  updateRenovationStageAction,
  uploadFileAction,
  deleteRenovationPhotoAction,
} from "../../../../../actions";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface TimelineItemProps {
  stage: (typeof RENOVATION_STAGES)[number];
  index: number;
  currentIndex: number;
  project: Project;
  photos: RenovationPhoto[];
  onPhotoUploaded: () => void;
}

export function TimelineItem({
  stage,
  index,
  currentIndex,
  project,
  photos,
  onPhotoUploaded,
}: TimelineItemProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date()
  );

  const isCompleted = index < currentIndex;
  const isCurrent = index === currentIndex;
  const isFuture = index > currentIndex;

  // --- 处理上传 ---
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0]; // 获取当前要上传的文件

    // [新增] 1. 前端校验文件大小
    if (file.size > MAX_FILE_SIZE) {
      toast.error("文件过大", {
        description: `当前文件 ${(file.size / 1024 / 1024).toFixed(
          2
        )}MB，最大允许 10MB`,
      });
      e.target.value = ""; // 清空选择，允许用户重新选
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading("正在上传...");

    try {
      // 1. Upload the file to the server first
      const formData = new FormData();
      formData.append("file", files[0]);

      // Using the uploadFileAction we discussed to get the real server path
      const uploadRes = await uploadFileAction(formData);

      if (!uploadRes.success || !uploadRes.data?.url) {
        throw new Error(uploadRes.message || "文件上传失败");
      }

      const realUrl = uploadRes.data.url; // e.g., "/static/uploads/image.png"

      // 2. Save the record with the REAL URL
      const res = await addRenovationPhotoAction({
        projectId: project.id,
        stage: stage.value,
        url: realUrl, // Use the real URL here
        filename: files[0].name,
      });

      if (res.success) {
        toast.success("上传成功");
        onPhotoUploaded();
        e.target.value = "";
      } else {
        throw new Error(res.message);
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : "上传失败";
      toast.error(errMsg);
    } finally {
      toast.dismiss(toastId);
      setIsLoading(false);
    }
  };

  // --- 处理完成阶段 ---
  const handleSubmit = async () => {
    if (photos.length === 0) {
      toast.error("请至少上传一张验收照片");
      return;
    }

    setIsLoading(true);

    try {
      const nextStage = RENOVATION_STAGES[index + 1];
      if (!nextStage) {
        toast.success("装修流程已全部结束");
        return;
      }

      const res = await updateRenovationStageAction({
        projectId: project.id,
        renovation_stage: nextStage.value,
        stage_completed_at: selectedDate?.toISOString(),
      });

      if (res.success) {
        toast.success(`完成 ${stage.label}，进入 ${nextStage.label}`);
        // Refresh the router to update the server components and prop data
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("操作失败");
    } finally {
      setIsLoading(false);
    }
  };

  // [新增] 删除处理函数
  const handleDelete = async (photoId: string) => {
    // 防止重复点击
    const toastId = toast.loading("正在删除...");

    try {
      const res = await deleteRenovationPhotoAction(project.id, photoId);

      if (res.success) {
        toast.success("删除成功");
        onPhotoUploaded(); // 复用刷新逻辑 (重新 fetch 列表)
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

  return (
    <AccordionItem
      value={stage.key}
      className="border-none relative"
      disabled={isFuture}
    >
      {/* 图标状态 */}
      <div className="absolute left-0 top-1 z-10 bg-white p-1">
        {isCompleted ? (
          <CheckCircle2 className="h-6 w-6 text-green-500 fill-green-50" />
        ) : isCurrent ? (
          <CircleDot className="h-6 w-6 text-orange-500 animate-pulse" />
        ) : (
          <Circle className="h-6 w-6 text-slate-300" />
        )}
      </div>

      {/* 标题 */}
      <AccordionTrigger
        className={cn(
          "pl-12 py-1 hover:no-underline data-[state=open]:py-1 group",
          isFuture ? "cursor-not-allowed opacity-60" : ""
        )}
      >
        <div className="flex items-center gap-3 w-full">
          <span
            className={cn(
              "text-lg transition-colors",
              isCurrent
                ? "font-bold text-slate-900"
                : "font-medium text-slate-600 group-hover:text-slate-900"
            )}
          >
            {stage.label}
          </span>

          {isCurrent && (
            <Badge
              variant="secondary"
              className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-none"
            >
              进行中
            </Badge>
          )}

          {photos.length > 0 && !isCurrent && (
            <span className="text-xs text-muted-foreground ml-2 bg-slate-100 px-1.5 rounded">
              {photos.length} 张照片
            </span>
          )}
        </div>
      </AccordionTrigger>

      {/* 内容区域 */}
      <AccordionContent className="pl-12 pt-4 pb-2">
        <div
          className={cn(
            "rounded-lg border p-4 space-y-4 transition-all",
            isCurrent
              ? "bg-white border-orange-200 shadow-sm"
              : "bg-slate-50/50 border-slate-100"
          )}
        >
          {/* 1. 照片墙 */}
          <PhotoGrid
            photos={photos}
            isCurrent={isCurrent}
            isFuture={isFuture}
            isLoading={isLoading}
            onUpload={handleUpload}
            onDelete={handleDelete}
          />

          {/* 2. 操作栏 (仅当前阶段) */}
          <ActionBar
            isCurrent={isCurrent}
            selectedDate={selectedDate}
            isLoading={isLoading}
            onDateSelect={setSelectedDate}
            onSubmit={handleSubmit}
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
