"use client";

/**
 * L4 Marketing 图片上传组件
 * 基于通用上传系统，保留拖拽上传和进度展示功能
 */

import { useRef, useState, useCallback } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { UploadProgress } from "./use-image-upload";

interface ImageUploaderProps {
  uploadingFiles: UploadProgress[];
  isUploading: boolean;
  onUpload: (files: FileList) => void;
  disabled?: boolean;
}

// 允许的图片格式
const ALLOWED_IMAGE_EXTENSIONS = ".jpg,.jpeg,.png,.gif,.webp";

/**
 * 图片上传组件
 * 支持拖拽上传和点击上传
 */
export function ImageUploader({
  uploadingFiles,
  isUploading,
  onUpload,
  disabled,
}: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!isUploading && !disabled) setIsDragging(true);
  }, [isUploading, disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isUploading || disabled) return;

    const files = e.dataTransfer.files;
    if (files?.length) {
      onUpload(files);
    }
  }, [isUploading, disabled, onUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      onUpload(e.target.files);
    }
    e.target.value = "";
  }, [onUpload]);

  const handleClick = useCallback(() => {
    if (!isUploading && !disabled) {
      fileInputRef.current?.click();
    }
  }, [isUploading, disabled]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer",
        isDragging && "border-primary bg-primary/5",
        isUploading && "pointer-events-none opacity-60",
        disabled && "cursor-not-allowed opacity-50",
        !isDragging && !isUploading && !disabled && "hover:border-primary/50 hover:bg-muted/50"
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ALLOWED_IMAGE_EXTENSIONS}
        onChange={handleFileSelect}
        className="hidden"
        disabled={isUploading || disabled}
      />

      {isUploading ? (
        <UploadingState uploadingFiles={uploadingFiles} />
      ) : (
        <IdleState />
      )}
    </div>
  );
}

/**
 * 上传中状态
 */
function UploadingState({ uploadingFiles }: { uploadingFiles: UploadProgress[] }) {
  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">
          正在上传 {uploadingFiles.length} 个文件...
        </span>
      </div>
      <div className="space-y-2">
        {uploadingFiles.map((file) => (
          <div key={file.filename} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="truncate max-w-[200px]">{file.filename}</span>
              <span>{file.progress}%</span>
            </div>
            <Progress value={file.progress} className="h-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 空闲状态
 */
function IdleState() {
  return (
    <>
      <UploadCloud className="h-10 w-10 text-muted-foreground" />
      <div className="text-center">
        <p className="text-sm font-medium">点击或拖拽图片到此处上传</p>
        <p className="mt-1 text-xs text-muted-foreground">
          支持 JPG, PNG, GIF, WebP 格式，单文件最大 10MB
        </p>
      </div>
    </>
  );
}
