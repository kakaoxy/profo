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
import { API_BASE_URL } from "@/lib/config";
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

interface UploadProgress {
  filename: string;
  progress: number;
}

/**
 * 文件上传组件
 * 支持拖拽上传，自动检测文件类型，支持分类选择
 */
export function FileUploader({ onUploadComplete, disabled }: FileUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadProgress[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<AttachmentCategory>("signing_contract");

  const isUploading = uploadingFiles.length > 0;

  const uploadFile = useCallback(
    (file: File): Promise<boolean> => {
      return new Promise((resolve) => {
        // 验证文件类型
        if (!isAllowedFile(file)) {
          toast.error(`${file.name}: 不支持的文件格式`);
          resolve(false);
          return;
        }

        // 验证文件大小
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`${file.name}: 文件过大`, {
            description: `文件大小不能超过 ${formatFileSize(MAX_FILE_SIZE)}`,
          });
          resolve(false);
          return;
        }

        // 添加到上传队列
        setUploadingFiles((prev) => [...prev, { filename: file.name, progress: 0 }]);

        const formData = new FormData();
        formData.append("file", file);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_BASE_URL}/api/v1/files/upload`);
        xhr.withCredentials = true;

        // 进度监听
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadingFiles((prev) =>
              prev.map((f) =>
                f.filename === file.name ? { ...f, progress: percent } : f
              )
            );
          }
        };

        // 完成处理
        xhr.onload = () => {
          // 从上传队列移除
          setUploadingFiles((prev) => prev.filter((f) => f.filename !== file.name));
          
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
                    return `${API_BASE_URL}${relativeUrl}`;
                  }
                  return relativeUrl;
                })(),
                category: selectedCategory,
                fileType,
                size: file.size,
                uploadedAt: new Date().toISOString(),
              };

              onUploadComplete(attachment);
              toast.success(`${file.name}: 上传成功`);
              resolve(true);
            } catch {
              toast.error(`${file.name}: 解析响应失败`);
              resolve(false);
            }
          } else {
            try {
              const error = JSON.parse(xhr.responseText);
              toast.error(`${file.name}: 上传失败`, {
                description: error.detail || `状态码: ${xhr.status}`,
              });
            } catch {
              toast.error(`${file.name}: 上传失败`);
            }
            resolve(false);
          }
        };

        xhr.onerror = () => {
          setUploadingFiles((prev) => prev.filter((f) => f.filename !== file.name));
          toast.error(`${file.name}: 网络错误`);
          resolve(false);
        };

        xhr.send(formData);
      });
    },
    [selectedCategory, onUploadComplete]
  );

  // 处理多文件上传
  const uploadFiles = useCallback(
    async (files: FileList) => {
      const fileArray = Array.from(files);
      if (fileArray.length > 1) {
        toast.info(`开始上传 ${fileArray.length} 个文件...`);
      }
      
      const results = await Promise.all(fileArray.map((file) => uploadFile(file)));
      const successCount = results.filter(Boolean).length;
      
      if (fileArray.length > 1) {
        toast.success(`上传完成`, {
          description: `成功 ${successCount} 个，共 ${fileArray.length} 个文件`,
        });
      }
    },
    [uploadFile]
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
      uploadFiles(files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      uploadFiles(e.target.files);
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
          multiple
          accept={ALLOWED_EXTENSIONS}
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading || disabled}
        />

        {isUploading ? (
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
        ) : (
          <>
            <UploadCloud className="h-10 w-10 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">点击或拖拽文件到此处上传</p>
              <p className="mt-1 text-xs text-muted-foreground">
                支持多文件上传，Excel、图片、PDF、Word 格式，单文件最大 10MB
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
