"use client";

import { useState, useEffect } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

import { ProjectDetailHeader } from "./header";
import { RenovationView } from "./views/renovation";
import { DefaultView } from "./views/default";
import { STAGE_CONFIG, ViewMode } from "./constants";
import type { ProjectDetailSheetProps, AttachmentHandlers } from "./types";

// 导出组件供外部使用
export * from "./types";
export * from "./utils";
export * from "./constants";

export function ProjectDetailSheet({
  project,
  isOpen,
  onClose,
  onUpdateAttachments,
}: ProjectDetailSheetProps) {
  // 1. Hooks
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("signing");

  // 2. [还原逻辑] 初始化 Effect
  useEffect(() => {
    if (isOpen && project) {
      const index = STAGE_CONFIG.findIndex((s) =>
        (s.aliases as readonly string[]).includes(project.status)
      );
      const safeIndex = index === -1 ? 0 : index;
      const targetMode = STAGE_CONFIG[safeIndex].key;

      // 只有当 当前视图 != 目标视图 时才更新
      if (viewMode !== targetMode) {
        setViewMode(targetMode);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, project?.id, project?.status]);

  if (!project) return null;

  // 3. 计算当前项目的真实阶段索引 (用于 Header 锁定逻辑)
  const currentStatusIndex = STAGE_CONFIG.findIndex((s) =>
    (s.aliases as readonly string[]).includes(project.status)
  );
  const currentProjectStageIndex =
    currentStatusIndex === -1 ? 0 : currentStatusIndex;

  // 4. 附件处理逻辑
  const attachments = project.signing_materials?.attachments || [];
  const handlers: AttachmentHandlers = {
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
    onDelete: onUpdateAttachments
      ? (url) => {
          const newAttachments = attachments.filter((att) => att.url !== url);
          onUpdateAttachments({ attachments: newAttachments });
          toast.success("附件已删除");
        }
      : undefined,
  };

  // 5. 视图渲染工厂
  const renderContent = () => {
    switch (viewMode) {
      case "renovation":
        return <RenovationView project={project} />;
      case "listing":
      case "sold":
      case "signing":
      default:
        return (
          <DefaultView
            project={project}
            attachments={attachments}
            handlers={handlers}
          />
        );
    }
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent className="sm:max-w-3xl w-full flex flex-col p-0">
          {/* Header 模块 */}
          <ProjectDetailHeader
            project={project}
            viewMode={viewMode}
            setViewMode={setViewMode}
            currentProjectStageIndex={currentProjectStageIndex}
            onClose={onClose}
          />

          {/* Content 模块 */}
          <div
            className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hide"
            style={{ scrollbarGutter: "stable" }}
          >
            {renderContent()}
          </div>
        </SheetContent>
      </Sheet>

      {/* 图片预览全局弹窗 */}
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
