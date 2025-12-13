"use client";

import { useState } from "react";
import {
  FileSpreadsheet,
  FileImage,
  FileText,
  File,
  Trash2,
  Download,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type Attachment,
  type FileType,
  getCategoryLabel,
  formatFileSize,
} from "../attachment-types";

interface FilePreviewProps {
  attachment: Attachment;
  onRemove: (id: string) => void;
}

/**
 * 根据文件类型返回对应图标
 */
function getFileIcon(fileType: FileType) {
  switch (fileType) {
    case "excel":
      return <FileSpreadsheet className="h-8 w-8 text-green-600" />;
    case "image":
      return <FileImage className="h-8 w-8 text-blue-500" />;
    case "pdf":
      return <FileText className="h-8 w-8 text-red-500" />;
    case "word":
      return <File className="h-8 w-8 text-blue-700" />;
    default:
      return <File className="h-8 w-8 text-gray-500" />;
  }
}

/**
 * 文件预览组件
 * 支持图片预览、PDF 在线查看、其他文件下载
 */
export function FilePreview({ attachment, onRemove }: FilePreviewProps) {
  const [showPreview, setShowPreview] = useState(false);
  const { id, filename, url, category, fileType, size } = attachment;

  const handlePreview = () => {
    if (fileType === "image") {
      setShowPreview(true);
    } else if (fileType === "pdf") {
      // PDF 在新标签页打开
      window.open(url, "_blank");
    }
  };

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <>
      <Card className="group relative overflow-hidden transition-shadow hover:shadow-md">
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            {/* 文件图标或缩略图 */}
            <div className="flex-shrink-0">
              {fileType === "image" ? (
                <div className="relative h-14 w-14 overflow-hidden rounded-md border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={filename}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-muted">
                  {getFileIcon(fileType)}
                </div>
              )}
            </div>

            {/* 文件信息 */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={filename}>
                {filename}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {getCategoryLabel(category)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(size)}
                </span>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex flex-shrink-0 items-center gap-1">
              {(fileType === "image" || fileType === "pdf") && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handlePreview}
                  title="预览"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleDownload}
                title="下载"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => onRemove(id)}
                title="删除"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 图片预览弹窗 */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{filename}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={filename}
              className="max-h-[70vh] rounded-lg object-contain"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface FileListProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

/**
 * 附件列表组件
 * 按分类分组显示附件
 */
export function FileList({ attachments, onRemove }: FileListProps) {
  if (attachments.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          暂无附件，请在上方上传文件
        </p>
      </div>
    );
  }

  // 按分类分组
  const groupedAttachments = attachments.reduce(
    (acc, att) => {
      const key = att.category;
      if (!acc[key]) acc[key] = [];
      acc[key].push(att);
      return acc;
    },
    {} as Record<string, Attachment[]>
  );

  return (
    <div className="space-y-4">
      {Object.entries(groupedAttachments).map(([category, files]) => (
        <div key={category} className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            {getCategoryLabel(category as Attachment["category"])}（{files.length}）
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {files.map((att) => (
              <FilePreview key={att.id} attachment={att} onRemove={onRemove} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
