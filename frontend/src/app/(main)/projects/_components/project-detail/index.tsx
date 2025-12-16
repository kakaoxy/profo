"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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

import { getProjectDetailAction } from "../../actions"; // <-- 使用 Action 替代

export * from "./types";
export * from "./utils";
export * from "./constants";

export function ProjectDetailSheet({
  project: initialProject,
  isOpen,
  onClose,
  onUpdateAttachments,
}: ProjectDetailSheetProps) {
  const router = useRouter();

  const [project, setProject] = useState(initialProject);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("signing");

  useEffect(() => {
    if (initialProject) {
      setProject(initialProject);
    }
  }, [initialProject]);

  // [修复] 使用 Server Action 刷新数据
  const refreshProjectData = useCallback(async () => {
    if (!project?.id) return;

    // 调用 Server Action (它是异步的，且运行在服务端，所以安全)
    const res = await getProjectDetailAction(project.id);

    if (res.success && res.data) {
      setProject(res.data);
    }
  }, [project?.id]);

  const handleHandoverSuccess = async () => {
    router.refresh();
    await refreshProjectData();
    setViewMode("renovation");
  };

  useEffect(() => {
    if (isOpen && project) {
      const index = STAGE_CONFIG.findIndex((s) =>
        (s.aliases as readonly string[]).includes(project.status)
      );
      const safeIndex = index === -1 ? 0 : index;
      const targetMode = STAGE_CONFIG[safeIndex].key;

      if (viewMode !== targetMode) {
        setViewMode(targetMode);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, project?.id, project?.status]);

  if (!project) return null;

  const currentStatusIndex = STAGE_CONFIG.findIndex((s) =>
    (s.aliases as readonly string[]).includes(project.status)
  );
  const currentProjectStageIndex =
    currentStatusIndex === -1 ? 0 : currentStatusIndex;

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

  const renderContent = () => {
    switch (viewMode) {
      case "renovation":
        return (
          <RenovationView project={project} onRefresh={refreshProjectData} />
        );
      case "listing":
      case "sold":
      case "signing":
      default:
        return (
          <DefaultView
            project={project}
            attachments={attachments}
            handlers={handlers}
            onHandoverSuccess={handleHandoverSuccess}
          />
        );
    }
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent className="sm:max-w-3xl w-full flex flex-col p-0">
          <ProjectDetailHeader
            project={project}
            viewMode={viewMode}
            setViewMode={setViewMode}
            currentProjectStageIndex={currentProjectStageIndex}
            onClose={onClose}
          />
          <div
            className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hide"
            style={{ scrollbarGutter: "stable" }}
          >
            {renderContent()}
          </div>
        </SheetContent>
      </Sheet>

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
