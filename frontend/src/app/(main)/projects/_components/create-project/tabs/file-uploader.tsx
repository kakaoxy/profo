"use client";

/**
 * 项目文件上传组件
 * 基于通用上传系统，保留分类选择功能
 */

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileUploader as CommonFileUploader } from "@/components/common/upload";
import {
  ATTACHMENT_CATEGORIES,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  type Attachment,
  type AttachmentCategory,
} from "../attachment-types";

interface FileUploaderProps {
  onUploadComplete: (attachment: Attachment) => void;
  disabled?: boolean;
}

/**
 * 文件上传组件
 * 支持分类选择和拖拽上传，基于通用上传系统
 */
export function FileUploader({ onUploadComplete, disabled }: FileUploaderProps) {
  const [selectedCategory, setSelectedCategory] = useState<AttachmentCategory>("signing_contract");

  return (
    <div className="space-y-4">
      {/* 分类选择 */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">选择分类：</span>
        <Select
          value={selectedCategory}
          onValueChange={(v) => setSelectedCategory(v as AttachmentCategory)}
          disabled={disabled}
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

      {/* 上传区域 - 使用通用组件 */}
      <CommonFileUploader
        options={{
          maxSize: MAX_FILE_SIZE,
          allowedTypes: ALLOWED_MIME_TYPES,
          multiple: true,
          validateFile: (file) => {
            const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
            const allowedExts = ALLOWED_EXTENSIONS.split(",");
            if (!allowedExts.includes(ext)) {
              return "不支持的文件格式";
            }
            return null;
          },
        }}
        disabled={disabled}
        onUploadComplete={(response) => {
          // 创建附件对象
          const fileType = getFileType(response.filename || "");
          if (!fileType || !response.url) return;

          const attachment: Attachment = {
            id: crypto.randomUUID(),
            filename: response.filename || "unknown",
            url: response.url,
            category: selectedCategory,
            fileType,
            size: response.size || 0,
            uploadedAt: new Date().toISOString(),
          };
          onUploadComplete(attachment);
        }}
        title="点击或拖拽文件到此处上传"
        description={`支持多文件上传，Excel、图片、PDF、Word 格式，单文件最大 10MB`}
      />
    </div>
  );
}

/**
 * 根据文件名判断文件类型
 */
function getFileType(filename: string): "excel" | "image" | "pdf" | "word" | null {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  const extensions: Record<string, string[]> = {
    excel: [".xlsx", ".xls"],
    image: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
    pdf: [".pdf"],
    word: [".doc", ".docx"],
  };

  for (const [type, exts] of Object.entries(extensions)) {
    if (exts.includes(ext)) {
      return type as "excel" | "image" | "pdf" | "word";
    }
  }
  return null;
}
