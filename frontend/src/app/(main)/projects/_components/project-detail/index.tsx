"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
import { SoldView } from "./views/sold";

import { STAGE_CONFIG, ViewMode } from "./constants";

import type { ProjectDetailSheetProps, AttachmentHandlers } from "./types";
import type { Project } from "../../types";

import { getProjectDetailAction } from "../../actions/core";
// [优化] 移除 getProjectCashFlowAction，因为数据已集成在详情接口中
// import { getProjectCashFlowAction } from "../../[projectId]/cashflow/actions";

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

  const isFetchingRef = useRef(false);

  const [project, setProject] = useState(initialProject);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("signing");

  // 初始化逻辑
  useEffect(() => {
    if (initialProject) {
      setProject(initialProject);
      setPreviewImage(null);
    }
  }, [initialProject]);

  const refreshProjectData = useCallback(
    async (isFull: boolean = false) => {
      if (!project?.id) return;
      if (isFetchingRef.current) return;

      isFetchingRef.current = true;
      try {
        const currentId = project.id;
        // 调用 Action 时传入 isFull
        const res = await getProjectDetailAction(project.id, isFull);

        if (res.success && res.data) {
          setProject((prev) => {
            if (!prev || prev.id !== currentId) return prev;
            return {
              ...prev,
              ...res.data,
            } as Project;
          });
        }
      } finally {
        isFetchingRef.current = false;
      }
    },
    [project?.id]
  );

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);

    // 如果切换到"签约"或"已售"视图，强制拉取完整数据
    if ((mode === "signing" && !project?.signing_materials) || mode === "sold") {
      refreshProjectData(true);
    }
  };

  const handleHandoverSuccess = async () => {
    router.refresh();
    await refreshProjectData();
    setViewMode("renovation");
  };

  // 视图切换与数据加载监听
  // 使用 ref 来避免重复调用 refreshProjectData
  const initialLoadRef = useRef(false);
  
  useEffect(() => {
    if (isOpen && project?.id && !initialLoadRef.current) {
      initialLoadRef.current = true;
      
      const index = STAGE_CONFIG.findIndex((s) =>
        (s.aliases as readonly string[]).includes(project.status)
      );
      const safeIndex = index === -1 ? 0 : index;
      const targetMode = STAGE_CONFIG[safeIndex].key;

      if (viewMode !== targetMode) {
        setViewMode(targetMode);
      }

      // 关键逻辑：如果初始状态就是 sold，直接加载 full 数据
      refreshProjectData(targetMode === "sold");
    }
    
    // 当 sheet 关闭时重置 ref
    if (!isOpen) {
      initialLoadRef.current = false;
    }
  }, [isOpen, project?.id, project?.status, viewMode, refreshProjectData]);

  if (!project) return null;

  const currentStatusIndex = STAGE_CONFIG.findIndex((s) =>
    (s.aliases as readonly string[]).includes(project.status)
  );
  const currentProjectStageIndex =
    currentStatusIndex === -1 ? 0 : currentStatusIndex;

  // 处理 signing_materials：后端返回的是附件对象数组
  const attachments = useMemo<import("./types").AttachmentInfo[]>(() => {
    const materials = project.signing_materials;
    if (!materials) return [];

    // 如果是数组（附件对象数组）- 新格式
    if (Array.isArray(materials)) {
      return materials.map((item: unknown) => {
        // 检查是字符串（旧URL格式）还是对象（新格式）
        if (typeof item === 'string') {
          // 旧格式：URL字符串
          const url = item;
          const ext = url.split('.').pop()?.toLowerCase() || '';
          let fileType = 'other';
          if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) fileType = 'image';
          else if (['pdf'].includes(ext)) fileType = 'pdf';
          else if (['xlsx', 'xls', 'csv'].includes(ext)) fileType = 'excel';
          else if (['doc', 'docx'].includes(ext)) fileType = 'word';

          return {
            filename: url.split('/').pop() || 'unknown',
            url: url,
            category: 'other',
            fileType,
          };
        }
        // 新格式：附件对象
        const att = item as import("./types").AttachmentInfo;
        return {
          filename: att.filename || 'unknown',
          url: att.url,
          category: att.category || 'other',
          fileType: att.fileType || 'other',
          size: att.size,
        };
      });
    }
    // 如果是对象（旧格式，包含 attachments 数组）
    if (typeof materials === 'object' && materials !== null && 'attachments' in materials) {
      return (materials as { attachments?: import("./types").AttachmentInfo[] }).attachments || [];
    }
    return [];
  }, [project.signing_materials]);

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
          // 转换为后端期望的格式：附件对象数组
          onUpdateAttachments(newAttachments.map((att) => ({
            filename: att.filename,
            url: att.url,
            category: att.category,
            fileType: att.fileType,
            size: att.size || 0,
          })));
          toast.success("附件已删除");
        }
      : undefined,
  };

  const isSoldMode = viewMode === "sold";
  const viewKey = `${project?.id}-${JSON.stringify(
    project?.signing_materials || ""
  )}-${project?.updated_at}`;

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-3xl flex flex-col p-0 transition-all duration-300">
          <SheetTitle className="sr-only">项目详情 - {project.name}</SheetTitle>
          <SheetDescription className="sr-only">
            查看和管理项目 {project.name} 的详细信息、装修进度及销售状态。
          </SheetDescription>

          {isSoldMode ? (
            <SoldView
              project={project}
              viewMode={viewMode}
              setViewMode={handleViewModeChange}
              currentProjectStageIndex={currentProjectStageIndex}
              // [优化] 不再需要 isLoading，因为核心数据是秒开的
            />
          ) : (
            <>
              <ProjectDetailHeader
                project={project}
                viewMode={viewMode}
                setViewMode={handleViewModeChange}
                currentProjectStageIndex={currentProjectStageIndex}
                onClose={onClose}
                onRefresh={refreshProjectData}
              />
              <div
                className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hide"
                style={{ scrollbarGutter: "stable" }}
              >
                {viewMode === "renovation" && (
                  <RenovationView
                    key={viewKey}
                    project={project}
                    onRefresh={refreshProjectData}
                  />
                )}
                {viewMode === "selling" && (
                  <SellingView
                    key={viewKey}
                    project={project}
                    onRefresh={refreshProjectData}
                  />
                )}
                {(viewMode === "signing" ||
                  !["renovation", "selling"].includes(viewMode)) && (
                  <DefaultView
                    key={viewKey}
                    project={project}
                    attachments={attachments}
                    handlers={handlers}
                    onHandoverSuccess={handleHandoverSuccess}
                  />
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>图片预览</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-4 relative w-full h-[75vh]">
            {previewImage && (
              <Image
                src={previewImage}
                alt="预览"
                fill
                className="object-contain rounded-lg"
                sizes="(max-width: 896px) 100vw, 896px"
                priority
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
