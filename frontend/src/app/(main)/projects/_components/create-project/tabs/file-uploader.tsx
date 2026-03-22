"use client";

import { useRef, useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ATTACHMENT_CATEGORIES,
  ALLOWED_EXTENSIONS,
  type Attachment,
  type AttachmentCategory,
} from "../attachment-types";
import { useFileUpload } from "../use-file-upload";

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
  const [selectedCategory, setSelectedCategory] = useState<AttachmentCategory>("signing_contract");

  const { uploadingFiles, isUploading, uploadFiles, setUploadingFiles } = useFileUpload({
    category: selectedCategory,
    onUploadComplete,
  });

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
