"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { ProjectSummary } from "./project-summary";
import { InfoTab } from "./tabs/info-tab";
import { AttachmentsTab } from "./tabs/attachments-tab";
import { formatDate, getRelativeTime, getStatusColor } from "./utils";
import type { ProjectDetailSheetProps, AttachmentHandlers } from "./types";

/**
 * 项目详情抽屉 - 主组件
 * 使用 Tabs 展示项目信息和附件
 */
export function ProjectDetailSheet({
  project,
  isOpen,
  onClose,
  onUpdateAttachments,
}: ProjectDetailSheetProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  if (!project) return null;

  const attachments = project.signing_materials?.attachments || [];

  // 附件操作处理器
  const handlers: AttachmentHandlers = {
    onPreview: (url, fileType) => {
      if (fileType === "image") {
        setPreviewImage(url);
      } else if (fileType === "pdf") {
        window.open(url, "_blank");
      }
    },
    onDownload: (url, filename) => {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("开始下载", { description: filename });
    },
    onDelete: onUpdateAttachments
      ? (url) => {
          const newAttachments = attachments.filter((att) => att.url !== url);
          onUpdateAttachments({ attachments: newAttachments });
          toast.success("附件已删除");
        }
      : undefined,
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent className="sm:max-w-3xl w-full flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10 shrink-0">
            <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold text-slate-900">
              {project.name}
              <Badge variant="secondary" className={cn(getStatusColor(project.status), "text-white border-transparent")}>
                {project.status}
              </Badge>
            </SheetTitle>
            </div>
            <SheetDescription className="flex items-center gap-2 text-xs">
              <Clock className="h-3 w-3" />
              创建于 {formatDate(project.created_at)}
              <span className="text-muted-foreground">
                ({getRelativeTime(project.created_at)})
              </span>
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hide" style={{ scrollbarGutter: 'stable' }}>
            <div className="space-y-6"> 
            {/* 摘要区域 */}
            <ProjectSummary project={project} />

            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="info">项目信息</TabsTrigger>
                <TabsTrigger value="attachments">
                  附件 {attachments.length > 0 && `(${attachments.length})`}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="mt-4 focus-visible:outline-none">
                <InfoTab project={project} />
              </TabsContent>

              <TabsContent value="attachments" className="mt-4 focus-visible:outline-none">
                <AttachmentsTab attachments={attachments} handlers={handlers} />
              </TabsContent>
            </Tabs>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* 图片预览弹窗 */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>图片预览</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-4">
            {previewImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewImage}
                alt="预览"
                className="max-h-[75vh] rounded-lg object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// 导出所有子组件供外部使用
export { ProjectSummary } from "./project-summary";
export { InfoSection } from "./info-section";
export { InfoItem } from "./info-item";
export { AttachmentGroup } from "./attachment-group";
export { InfoTab } from "./tabs/info-tab";
export { AttachmentsTab } from "./tabs/attachments-tab";
export * from "./types";
export * from "./utils";
export * from "./constants";
