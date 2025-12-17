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
import { SellingView } from "./views/selling";

import { STAGE_CONFIG, ViewMode } from "./constants";
import type { ProjectDetailSheetProps, AttachmentHandlers } from "./types";

import { getProjectDetailAction } from "../../actions";

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

  // 使用 Server Action 刷新数据
  const refreshProjectData = useCallback(async () => {
    if (!project?.id) return;

    const res = await getProjectDetailAction(project.id);

    if (res.success && res.data) {
      setProject(res.data);
    }
  }, [project?.id]);

  const handleHandoverSuccess = async () => {
    router.refresh();
    await refreshProjectData();
    // 交房后自动切到装修视图
    setViewMode("renovation");
  };

  // 监听 isOpen 和 project 变化，自动切换到当前状态对应的视图
  useEffect(() => {
    if (isOpen && project?.id) {
      // 1. 自动切换视图模式 (原有逻辑)
      const index = STAGE_CONFIG.findIndex((s) =>
        (s.aliases as readonly string[]).includes(project.status)
      );
      const safeIndex = index === -1 ? 0 : index;
      const targetMode = STAGE_CONFIG[safeIndex].key;

      if (viewMode !== targetMode) {
        setViewMode(targetMode);
      }

      if (project.sales_records === undefined) {
        refreshProjectData();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, project?.id, project?.status]);

  if (!project) return null;

  // 计算当前阶段索引用于 Header 进度条
  const currentStatusIndex = STAGE_CONFIG.findIndex((s) =>
    (s.aliases as readonly string[]).includes(project.status)
  );
  const currentProjectStageIndex =
    currentStatusIndex === -1 ? 0 : currentStatusIndex;

  const attachments = project.signing_materials?.attachments || [];

  // 附件操作句柄
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

  // [修改] 视图渲染分发逻辑
  const renderContent = () => {
    switch (viewMode) {
      case "renovation":
        return (
          <RenovationView project={project} onRefresh={refreshProjectData} />
        );

      // [新增] 对应 "在售" 状态
      case "selling":
        return <SellingView project={project} onRefresh={refreshProjectData} />;

      // [新增] 对应 "已售" 状态 (暂时复用 SellingView 查看历史，或后续新建 SoldView)
      case "sold":
        return <SellingView project={project} onRefresh={refreshProjectData} />;

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
