"use client";

import { useState, useMemo, useCallback } from "react";
import { useWatch, UseFormReturn } from "react-hook-form";
import Image from "next/image";
import { toast } from "sonner";
import { FileUploader } from "./file-uploader";
import { type FormValues } from "../schema";
import { type Attachment } from "../attachment-types";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AttachmentsTab as DetailAttachmentsTab } from "../../project-detail/views/default/tabs/attachments-tab";
import { DocumentsAttachmentsTab } from "../../project-detail/views/default/tabs/documents-attachments-tab";
import { useProjectAttachments } from "../../project-detail/hooks/use-project-attachments";
import { updateProjectAction } from "../../../actions/core";
import type { AttachmentInfo, AttachmentHandlers } from "../../project-detail/types";
import type { Project } from "../../../types/project";

interface TabProps {
  form: UseFormReturn<FormValues>;
  project?: Project;
  isEditMode?: boolean;
}

/**
 * 新建/编辑项目 - 附件 Tab
 *
 * 编辑模式：复用详情页 DocumentsAttachmentsTab（文书签收 + 附件列表），附件即时持久化
 * 新建模式：上传区域（带分类选择）+ 5 大分组展示，提交时一次性保存
 */
export function AttachmentsTab({ form, project, isEditMode }: TabProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const attachments = useWatch({
    control: form.control,
    name: "attachments",
    defaultValue: [],
  }) || [];

  // ============ 新建模式：表单管理附件 ============
  const attachmentInfos = useMemo<AttachmentInfo[]>(
    () =>
      attachments.map((att) => ({
        filename: att.filename,
        url: att.url,
        category: att.category,
        fileType: att.fileType,
        size: att.size,
      })),
    [attachments],
  );

  const handleUploadComplete = (attachment: Attachment) => {
    const current = form.getValues("attachments") || [];
    form.setValue("attachments", [...current, attachment], {
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  const handleRemove = (url: string) => {
    const current = form.getValues("attachments") || [];
    form.setValue(
      "attachments",
      current.filter((att) => att.url !== url),
      { shouldDirty: true, shouldTouch: true },
    );
    toast.success("附件已删除");
  };

  const newHandlers: AttachmentHandlers = {
    onPreview: (url, fileType) => {
      if (fileType === "image") setPreviewImage(url);
      else if (fileType === "pdf") window.open(url, "_blank");
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
    onDelete: handleRemove,
  };

  // ============ 编辑模式：即时持久化附件 ============
  const handleUpdateAttachments = useCallback(
    async (newAttachments: AttachmentInfo[]) => {
      if (!project) return;
      const result = await updateProjectAction(project.id, {
        signing_materials: newAttachments.length
          ? newAttachments.map((a) => ({
              filename: a.filename,
              url: a.url,
              category: a.category,
              fileType: a.fileType,
              size: a.size ?? 0,
            }))
          : null,
      });
      if (!result.success) {
        toast.error(result.message || "附件保存失败");
      }
    },
    [project],
  );

  const { attachments: editAttachments, createHandlers } = useProjectAttachments({
    signingMaterials: project?.signing_materials,
    onUpdateAttachments: handleUpdateAttachments,
  });

  const editHandlers = createHandlers(setPreviewImage);

  // ============ 编辑模式：渲染 DocumentsAttachmentsTab ============
  if (isEditMode && project) {
    return (
      <>
        <DocumentsAttachmentsTab
          project={project}
          attachments={editAttachments}
          handlers={editHandlers}
          onUpdateAttachments={handleUpdateAttachments}
        />
        <ImagePreviewDialog url={previewImage} onClose={() => setPreviewImage(null)} />
      </>
    );
  }

  // ============ 新建模式：上传区 + 5 大分组展示 ============
  return (
    <div className="space-y-6">
      {/* 上传区域 */}
      <div>
        <h3 className="mb-3 text-[14px] font-medium text-foreground tracking-tight">上传附件</h3>
        <FileUploader onUploadComplete={handleUploadComplete} />
      </div>

      <Separator className="bg-dove/20" />

      {/* 已上传文件列表（与详情侧展示一致） */}
      <div>
        <h3 className="mb-3 text-[14px] font-medium text-foreground tracking-tight">
          已上传附件
          {attachments.length > 0 && (
            <span className="ml-2 text-[13px] text-graphite font-normal">
              （共 {attachments.length} 个）
            </span>
          )}
        </h3>
        <ScrollArea className="h-[300px] w-full rounded-inputs border border-dove/40 p-5 bg-pure-white">
          <div className="pr-4">
            <DetailAttachmentsTab attachments={attachmentInfos} handlers={newHandlers} />
          </div>
        </ScrollArea>
      </div>

      <ImagePreviewDialog url={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
}

/** 图片预览弹窗（与详情侧一致） */
function ImagePreviewDialog({ url, onClose }: { url: string | null; onClose: () => void }) {
  return (
    <Dialog open={!!url} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>图片预览</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center py-4 relative w-full h-[75vh]">
          {url && (
            <Image
              src={url}
              alt="预览"
              fill
              className="object-contain rounded-lg"
              sizes="(max-width: 896px) 100vw, 896px"
              priority
              unoptimized
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
