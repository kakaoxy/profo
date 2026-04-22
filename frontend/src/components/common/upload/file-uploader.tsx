"use client";

/**
 * 通用上传系统 - 上传组件
 * 支持拖拽上传、点击上传、进度展示
 */

import { useRef, useState } from "react";
import { UploadCloud, Loader2, X, FileImage, File, AlertCircle, RefreshCw } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useUpload } from "./use-upload";
import { formatFileSize } from "./utils";
import type { FileUploaderProps } from "./types";

export function FileUploader({
  options = {},
  disabled = false,
  onUploadComplete,
  onUploadError,
  children,
  className,
  title = "点击或拖拽文件到此处上传",
  description,
  renderFileList,
  showFileList = true,
}: FileUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const {
    files,
    isUploading,
    uploadingFiles,
    upload,
    remove,
    retry,
  } = useUpload({
    ...options,
    onSuccess: (response, file) => {
      options.onSuccess?.(response, file);
      onUploadComplete?.(response, file);
    },
    onError: (error, file) => {
      options.onError?.(error, file);
      onUploadError?.(error, file);
    },
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isUploading && !disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isUploading || disabled) return;

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles?.length) {
      upload(Array.from(droppedFiles));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      upload(Array.from(e.target.files));
    }
    e.target.value = "";
  };

  const handleClick = () => {
    if (!isUploading && !disabled) {
      fileInputRef.current?.click();
    }
  };

  // 获取描述文本
  const getDescription = () => {
    if (description) return description;

    const { maxSize, allowedTypes } = options;
    const sizeText = maxSize ? `单文件最大 ${formatFileSize(maxSize)}` : "";
    const typeText = allowedTypes?.length ? "支持特定格式" : "";

    if (sizeText && typeText) return `${typeText}，${sizeText}`;
    return sizeText || typeText || "支持多文件上传";
  };

  // 获取文件图标
  const getFileIcon = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext || "")) {
      return <FileImage className="h-4 w-4" />;
    }
    return <File className="h-4 w-4" />;
  };

  // 默认文件列表渲染
  const defaultFileList = (
    <div className="space-y-2">
      {files.map((file) => (
        <div
          key={file.id}
          className={cn(
            "flex items-center gap-3 p-2 rounded-md border",
            file.status === "error" && "border-red-200 bg-red-50",
            file.status === "success" && "border-green-200 bg-green-50/30",
            file.status === "uploading" && "border-blue-200 bg-blue-50/30"
          )}
        >
          <div className={cn(
            "p-1.5 rounded",
            file.status === "error" ? "bg-red-100 text-red-600" : "bg-muted"
          )}>
            {file.status === "error" ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              getFileIcon(file.file.name)
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{file.file.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(file.file.size)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {file.status === "uploading" && (
              <span className="text-xs text-blue-600">{file.progress}%</span>
            )}
            {file.status === "error" && (
              <button
                onClick={() => retry(file.id)}
                className="p-1 hover:bg-red-100 rounded text-red-600"
                title="重试"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
            {(file.status === "success" || file.status === "error") && (
              <button
                onClick={() => remove(file.id)}
                className="p-1 hover:bg-gray-100 rounded text-muted-foreground hover:text-red-600"
                title="删除"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      ))}

      {/* 上传进度条 */}
      {isUploading && uploadingFiles.length > 0 && (
        <div className="space-y-2 pt-2">
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
      )}
    </div>
  );

  return (
    <div className={cn("space-y-4", className)}>
      {/* 上传区域 */}
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
          multiple={options.multiple !== false}
          accept={options.allowedTypes?.join(",")}
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading || disabled}
        />

        {children ? (
          children
        ) : isUploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">正在上传...</span>
          </div>
        ) : (
          <>
            <UploadCloud className="h-10 w-10 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {getDescription()}
              </p>
            </div>
          </>
        )}
      </div>

      {/* 文件列表 */}
      {showFileList && files.length > 0 && (
        renderFileList ? (
          renderFileList({ files, onRemove: remove, onRetry: retry })
        ) : (
          defaultFileList
        )
      )}
    </div>
  );
}

export default FileUploader;
