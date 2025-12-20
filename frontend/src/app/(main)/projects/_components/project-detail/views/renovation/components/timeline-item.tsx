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

import { PhotoGrid, UploadingPhoto } from "./photo-grid";
import { ActionBar } from "./action-bar";

import { Project, RenovationPhoto } from "../../../../../types";
import { RENOVATION_STAGES } from "../../../constants";
import {
  addRenovationPhotoAction,
  updateRenovationStageAction,
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
  const [isSubmittingStage, setIsSubmittingStage] = useState(false); // 仅控制完成阶段的loading
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date()
  );

  // [新增] 维护一个上传队列
  const [uploadQueue, setUploadQueue] = useState<UploadingPhoto[]>([]);

  const isCompleted = index < currentIndex;
  const isCurrent = index === currentIndex;
  const isFuture = index > currentIndex;

  // --- [核心] 处理上传 (支持多选 + 进度条) ---
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // 1. 将 FileList 转为数组并进行预检查
    const newUploads: UploadingPhoto[] = [];
    Array.from(files).forEach((file) => {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} 过大，已跳过`);
        return;
      }
      // 生成本地预览 URL
      const previewUrl = URL.createObjectURL(file);
      newUploads.push({
        id: Math.random().toString(36).substring(7), // 临时ID
        file,
        previewUrl,
        progress: 0,
        status: "uploading",
      });
    });

    if (newUploads.length === 0) {
      e.target.value = "";
      return;
    }

    // 2. 加入队列，界面立马显示预览图
    setUploadQueue((prev) => [...prev, ...newUploads]);
    e.target.value = ""; // 清空 input 允许重复选

    // 3. 开始并发上传
    // 这里我们不等待所有传完，而是"发后即忘"，让它们各自跑
    newUploads.forEach((item) => uploadSingleFile(item));
  };

  // 单文件上传逻辑 (使用 XHR 以获取进度)
  const uploadSingleFile = async (item: UploadingPhoto) => {
    const formData = new FormData();
    formData.append("file", item.file);

    // 获取 API 地址 (逻辑同 actions.ts)
    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    // 前端直接请求建议用 localhost:8000 (如果配置了代理) 或者 完整后端地址
    // 注意：如果是在浏览器端运行，127.0.0.1 可能导致跨域，建议用 NEXT_PUBLIC_API_URL 配置的地址
    // 如果是本地开发，通常 http://localhost:8000 即可
    const apiBase = (envUrl || "http://localhost:8000").replace(
      /\/api\/v1\/?$/,
      ""
    );
    const uploadUrl = `${apiBase}/api/v1/files/upload`;

    return new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();

      // 监听进度
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          // 更新队列中的进度
          setUploadQueue((prev) =>
            prev.map((p) =>
              p.id === item.id ? { ...p, progress: percent } : p
            )
          );
        }
      };

      // 上传完成处理
      xhr.onload = async () => {
        if (xhr.status === 200) {
          try {
            const json = JSON.parse(xhr.responseText);
            if (json.code === 200 && json.data?.url) {
              // A. 上传文件成功，拿到 URL
              const realUrl = json.data.url;

              // B. 调用 Server Action 存入数据库
              // 注意：这里不需要进度条，因为很快
              const dbRes = await addRenovationPhotoAction({
                projectId: project.id,
                stage: stage.value,
                url: realUrl,
                filename: item.file.name,
              });

              if (dbRes.success) {
                // C. 全部成功：
                // 1. 从队列移除该项
                setUploadQueue((prev) => prev.filter((p) => p.id !== item.id));
                // 2. 释放 URL 对象内存
                URL.revokeObjectURL(item.previewUrl);
                // 3. 刷新真实列表
                onPhotoUploaded();
                resolve();
                return;
              }
            }
          } catch (e) {
            console.error("解析响应失败", e);
          }
        }

        // D. 失败处理
        handleUploadError(item.id);
        resolve();
      };

      xhr.onerror = () => {
        handleUploadError(item.id);
        resolve();
      };

      xhr.open("POST", uploadUrl);
      xhr.send(formData);
    });
  };

  const handleUploadError = (itemId: string) => {
    setUploadQueue((prev) =>
      prev.map((p) =>
        p.id === itemId ? { ...p, status: "error", progress: 0 } : p
      )
    );
    toast.error("部分图片上传失败");
  };

  // --- 处理完成阶段 ---
  const handleSubmit = async () => {
    // 如果还有正在上传的图片，阻止提交
    if (uploadQueue.length > 0) {
      toast.warning("请等待图片上传完成");
      return;
    }

    if (photos.length === 0) {
      toast.error("请至少上传一张验收照片");
      return;
    }

    setIsSubmittingStage(true);

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
        router.refresh();
        if (onRefresh) {
          await onRefresh();
        }
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("操作失败");
    } finally {
      setIsSubmittingStage(false);
    }
  };

  // 删除处理函数
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

          {/* 此时的照片数量 = 已完成 + 正在上传 */}
          {(photos.length > 0 || uploadQueue.length > 0) && !isCurrent && (
            <span className="text-xs text-muted-foreground ml-2 bg-slate-100 px-1.5 rounded">
              {photos.length + uploadQueue.length} 张照片
            </span>
          )}
        </div>
      </AccordionTrigger>

      <AccordionContent className="pl-12 pt-4 pb-2">
        <div
          className={cn(
            "rounded-lg border p-4 space-y-4 transition-all",
            isCurrent
              ? "bg-white border-orange-200 shadow-sm"
              : "bg-slate-50/50 border-slate-100"
          )}
        >
          {/* 1. 照片墙：同时传入真实照片和上传队列 */}
          <PhotoGrid
            photos={photos}
            uploadingPhotos={uploadQueue} // [新增]
            isCurrent={isCurrent}
            isFuture={isFuture}
            isLoading={isSubmittingStage} // 仅在提交阶段时禁用操作
            onUpload={handleUpload}
            onDelete={handleDelete}
          />

          {/* 2. 操作栏 */}
          <ActionBar
            isCurrent={isCurrent}
            selectedDate={selectedDate}
            isLoading={isSubmittingStage}
            onDateSelect={setSelectedDate}
            onSubmit={handleSubmit}
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
