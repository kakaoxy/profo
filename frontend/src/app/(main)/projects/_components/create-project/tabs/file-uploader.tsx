"use client";

import { useState, useRef, useCallback } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ATTACHMENT_CATEGORIES,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
  isAllowedFile,
  getFileType,
  formatFileSize,
  type Attachment,
  type AttachmentCategory,
} from "../attachment-types";

interface FileUploaderProps {
  onUploadComplete: (attachment: Attachment) => void;
  disabled?: boolean;
}

/**
 * 文件上传组件
 * 支持拖拽上传，自动检测文件类型，支持分类选择
 */
export function FileUploader({ onUploadComplete, disabled }: FileUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<AttachmentCategory>("signing_contract");

  const uploadFile = useCallback(
    async (file: File) => {
      // 验证文件类型
      if (!isAllowedFile(file)) {
        toast.error("不支持的文件格式", {
          description: "请上传 Excel、图片、PDF 或 Word 文件",
        });
        return;
      }

      // 验证文件大小
      if (file.size > MAX_FILE_SIZE) {
        toast.error("文件过大", {
          description: `文件大小不能超过 ${formatFileSize(MAX_FILE_SIZE)}`,
        });
        return;
      }

      setIsUploading(true);
      setProgress(0);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const xhr = new XMLHttpRequest();
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
        xhr.open("POST", `${baseUrl}/api/v1/files/upload`);
        xhr.withCredentials = true;

        // 进度监听
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setProgress(percent);
          }
        };

        // 完成处理
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText);
              const fileType = getFileType(file.name);
              if (!fileType) {
                throw new Error("无法识别文件类型");
              }

              const attachment: Attachment = {
                id: crypto.randomUUID(),
                filename: file.name,
                // Backend returns nested data.url with relative path, prepend base URL
                url: (() => {
                  const relativeUrl = result.data?.url || result.url || result.file_url || result.path;
                  if (relativeUrl?.startsWith("/")) {
                    return `${baseUrl}${relativeUrl}`;
                  }
                  return relativeUrl;
                })(),
                category: selectedCategory,
                fileType,
                size: file.size,
                uploadedAt: new Date().toISOString(),
              };

              onUploadComplete(attachment);
              toast.success("上传成功", {
                description: `${file.name} 已添加到附件列表`,
              });
            } catch {
              toast.error("解析响应失败");
            }
          } else {
            try {
              const error = JSON.parse(xhr.responseText);
              toast.error("上传失败", {
                description: error.detail || `状态码: ${xhr.status}`,
              });
            } catch {
              toast.error("上传失败", { description: xhr.statusText });
            }
          }
          setIsUploading(false);
          setProgress(0);
        };

        xhr.onerror = () => {
          toast.error("网络错误", { description: "请检查网络连接和后端服务" });
          setIsUploading(false);
          setProgress(0);
        };

        xhr.send(formData);
      } catch (error) {
        console.error("Upload error:", error);
        toast.error("上传失败");
        setIsUploading(false);
        setProgress(0);
      }
    },
    [selectedCategory, onUploadComplete]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isUploading && !disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isUploading || disabled) return;

    const files = e.dataTransfer.files;
    if (files?.length) {
      uploadFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      uploadFile(e.target.files[0]);
    }
    e.target.value = "";
  };

  const handleClick = () => {
    if (!isUploading && !disabled) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="space-y-4">
      {/* 分类选择 */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">选择分类：</span>
        <Select
          value={selectedCategory}
          onValueChange={(v) => setSelectedCategory(v as AttachmentCategory)}
          disabled={isUploading || disabled}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="选择附件分类" />
          </SelectTrigger>
          <SelectContent>
            {ATTACHMENT_CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
          accept={ALLOWED_EXTENSIONS}
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading || disabled}
        />

        {isUploading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="w-full max-w-xs space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-center text-sm text-muted-foreground">
                上传中... {progress}%
              </p>
            </div>
          </>
        ) : (
          <>
            <UploadCloud className="h-10 w-10 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">点击或拖拽文件到此处上传</p>
              <p className="mt-1 text-xs text-muted-foreground">
                支持 Excel、图片、PDF、Word 格式，单文件最大 10MB
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
