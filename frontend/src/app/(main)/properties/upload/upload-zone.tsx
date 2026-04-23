"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  X,
  Clock,
  RotateCcw,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { downloadCsvTemplate } from "@/lib/file-utils";
import {
  createImportTask,
  pollTaskStatus,
  cancelImportTask,
  type ImportTaskStatusResponse,
} from "@/lib/api-upload";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// 状态显示映射
const statusMap: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "等待处理", color: "bg-yellow-100 text-yellow-700", icon: <Clock className="h-4 w-4" /> },
  processing: { label: "处理中", color: "bg-blue-100 text-blue-700", icon: <Loader2 className="h-4 w-4 animate-spin" /> },
  completed: { label: "已完成", color: "bg-green-100 text-green-700", icon: <CheckCircle2 className="h-4 w-4" /> },
  failed: { label: "失败", color: "bg-red-100 text-red-700", icon: <AlertCircle className="h-4 w-4" /> },
  cancelled: { label: "已取消", color: "bg-gray-100 text-gray-700", icon: <Ban className="h-4 w-4" /> },
};

export function UploadZone() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [taskStatus, setTaskStatus] = useState<ImportTaskStatusResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const cancelRef = useRef(false);

  // 组件卸载时取消轮询
  useEffect(() => {
    return () => {
      cancelRef.current = true;
    };
  }, []);

  const startUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    setTaskStatus(null);
    cancelRef.current = false;

    try {
      // 1. 创建导入任务
      const createResponse = await createImportTask(file);
      toast.info("导入任务已创建", {
        description: "正在后台处理，请稍候...",
      });

      // 2. 开始轮询任务状态
      setIsPolling(true);
      const finalStatus = await pollTaskStatus(
        createResponse.task_id,
        (status) => {
          setTaskStatus(status);
        },
        {
          interval: 2000, // 每 2 秒查询一次
          timeout: 30 * 60 * 1000, // 30 分钟超时
          onCancel: () => cancelRef.current,
        }
      );

      // 3. 处理最终结果
      if (finalStatus.status === "completed") {
        if (finalStatus.failed_count === 0) {
          toast.success("导入成功", {
            description: `成功导入 ${finalStatus.success_count} 条数据`,
          });
        } else {
          toast.warning("导入完成，存在部分失败", {
            description: `成功 ${finalStatus.success_count} 条，失败 ${finalStatus.failed_count} 条`,
          });
        }
      } else if (finalStatus.status === "failed") {
        toast.error("导入失败", {
          description: finalStatus.error_message || "处理过程中发生错误",
        });
      } else if (finalStatus.status === "cancelled") {
        toast.info("任务已取消");
      }
    } catch (error) {
      console.error(error);
      toast.error("上传失败", {
        description: error instanceof Error ? error.message : "未知错误",
      });
      setCurrentFile(null);
    } finally {
      setIsUploading(false);
      setIsPolling(false);
    }
  }, []);

  const validateAndUpload = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("文件格式错误", {
        description: "请上传 .csv 格式的文件",
      });
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error("文件过大", {
        description: "文件大小不能超过 10MB",
      });
      return;
    }

    setCurrentFile(file);
    startUpload(file);
  }, [startUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging((prev) => {
      if (!prev) return true;
      return prev;
    });
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files?.length && !isUploading) {
      validateAndUpload(files[0]);
    }
  }, [isUploading, validateAndUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      validateAndUpload(e.target.files[0]);
    }
    e.target.value = "";
  }, [validateAndUpload]);

  const handleDownloadTemplate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    downloadCsvTemplate();
  }, []);

  const handleCancel = useCallback(async () => {
    if (taskStatus?.task_id) {
      try {
        cancelRef.current = true;
        await cancelImportTask(taskStatus.task_id);
        toast.info("正在取消任务...");
      } catch (error) {
        console.error("取消任务失败:", error);
      }
    }
  }, [taskStatus?.task_id]);

  const handleClearResult = useCallback(() => {
    setTaskStatus(null);
    setCurrentFile(null);
    cancelRef.current = false;
  }, []);

  const handleOpenFailedFile = useCallback((url: string) => {
    window.open(url, "_blank");
  }, []);

  const handleRetry = useCallback(() => {
    if (currentFile) {
      startUpload(currentFile);
    }
  }, [currentFile, startUpload]);

  // 判断是否可以取消
  const canCancel = isPolling && taskStatus && ["pending", "processing"].includes(taskStatus.status);

  return (
    <div className="space-y-6">
      {/* 拖拽上传区域 */}
      <div
        className={cn(
          "relative border-2 border-dashed rounded-xl p-10 transition-all duration-200 ease-in-out flex flex-col items-center justify-center gap-4 cursor-pointer min-h-[300px]",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-slate-50",
          (isUploading || isPolling) && "pointer-events-none opacity-60"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileSelect}
        />

        {isUploading || isPolling ? (
          <div className="w-full max-w-md space-y-4 text-center animate-in fade-in">
            <div className="mx-auto w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{currentFile?.name}</p>
              
              {taskStatus ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <Badge className={statusMap[taskStatus.status]?.color}>
                      {statusMap[taskStatus.status]?.icon}
                      <span className="ml-1">{statusMap[taskStatus.status]?.label}</span>
                    </Badge>
                  </div>
                  
                  <Progress 
                    value={taskStatus.progress_percent} 
                    className="h-2 w-full max-w-xs mx-auto" 
                  />
                  <p className="text-xs text-muted-foreground">
                    {taskStatus.total_records > 0 ? (
                      <>
                        已处理 {taskStatus.processed_records} / {taskStatus.total_records} 条
                        ({taskStatus.progress_percent}%)
                      </>
                    ) : (
                      "正在准备数据..."
                    )}
                  </p>
                  
                  {(taskStatus.success_count > 0 || taskStatus.failed_count > 0) && (
                    <p className="text-xs text-muted-foreground">
                      <span className="text-green-600">成功: {taskStatus.success_count}</span>
                      <span className="mx-2">|</span>
                      <span className="text-red-600">失败: {taskStatus.failed_count}</span>
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">正在创建导入任务...</p>
              )}
              
              {canCancel && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancel();
                  }}
                  className="mt-2"
                >
                  <Ban className="mr-2 h-4 w-4" />
                  取消导入
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
              <UploadCloud className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-semibold">点击或拖拽上传 CSV 文件</h3>
              <p className="text-sm text-muted-foreground">
                支持批量导入房源数据，单次最大 10MB，支持数千条记录
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              下载数据模板
            </Button>
          </>
        )}
      </div>

      {/* 结果反馈区域 */}
      {taskStatus && !isPolling && (
        <Card className="animate-in slide-in-from-bottom-4 fade-in">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              {taskStatus.status === "completed" && taskStatus.failed_count === 0 ? (
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
              ) : taskStatus.status === "completed" ? (
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                  <AlertCircle className="h-6 w-6 text-orange-600" />
                </div>
              ) : taskStatus.status === "failed" ? (
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <AlertCircle className="h-6 w-6 text-red-600" />
                </div>
              ) : taskStatus.status === "cancelled" ? (
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                  <Ban className="h-6 w-6 text-gray-600" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <Clock className="h-6 w-6 text-blue-600" />
                </div>
              )}

              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-base">
                    {taskStatus.status === "completed" && taskStatus.failed_count === 0
                      ? "全部导入成功"
                      : taskStatus.status === "completed"
                      ? "导入完成，存在部分失败"
                      : taskStatus.status === "failed"
                      ? "导入失败"
                      : taskStatus.status === "cancelled"
                      ? "任务已取消"
                      : "导入任务"}
                  </h4>
                  <Badge className={statusMap[taskStatus.status]?.color}>
                    {statusMap[taskStatus.status]?.label}
                  </Badge>
                </div>
                
                <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                  <span>总记录: {taskStatus.total_records}</span>
                  <span className="text-green-600">成功: {taskStatus.success_count}</span>
                  <span className="text-red-600">失败: {taskStatus.failed_count}</span>
                  {taskStatus.processing_duration && (
                    <span>用时: {Math.round(taskStatus.processing_duration)}秒</span>
                  )}
                </div>

                {taskStatus.error_message && (
                  <p className="text-sm text-red-600 mt-2">
                    错误: {taskStatus.error_message}
                  </p>
                )}

                {taskStatus.failed_count > 0 && taskStatus.failed_file_url && (
                  <div className="pt-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleOpenFailedFile(taskStatus.failed_file_url!)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      下载失败记录 (CSV)
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      请下载失败记录，修改错误后重新上传该文件。
                    </p>
                  </div>
                )}

                {(taskStatus.status === "failed" || taskStatus.status === "cancelled") && currentFile && (
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRetry}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      重新导入
                    </Button>
                  </div>
                )}
              </div>

              <Button variant="ghost" size="icon" onClick={handleClearResult}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
