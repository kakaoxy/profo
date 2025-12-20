"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
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
              renovation_photos: prev.renovation_photos,
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

    // 如果切换到"签约"视图，且当前项目没有签约材料 (说明可能是一个已售项目，数据被阉割了)
    if (mode === "signing" && !project?.signing_materials) {
      // 强制拉取完整数据
      refreshProjectData(true);
    }
  };

  // [极速版] 只需获取照片，财务数据已在 project 对象中
  const fetchSoldViewData = useCallback(async () => {
    if (!project?.id) return;

    const currentId = project.id;

    try {
      // 只请求照片
      const photosRes = await fetch(
        `/api/v1/projects/${currentId}/renovation/photos`
      );

      let photosData = { data: [] };
      if (photosRes.ok) {
        photosData = await photosRes.json();
      } else if (photosRes.status !== 404) {
        // 404 是正常的（无照片），其他错误才打印
        console.warn("Fetch photos failed:", photosRes.status);
      }

      setProject((prev) => {
        if (!prev || prev.id !== currentId) return prev;

        return {
          ...prev,
          // 更新照片数据
          renovation_photos: photosData?.data || prev.renovation_photos || [],
        };
      });
    } catch (error) {
      console.error("Failed to fetch photos:", error);
    }
  }, [project?.id]);

  const handleHandoverSuccess = async () => {
    router.refresh();
    await refreshProjectData();
    setViewMode("renovation");
  };

  // 视图切换与数据加载监听
  useEffect(() => {
    if (isOpen && project?.id) {
      const index = STAGE_CONFIG.findIndex((s) =>
        (s.aliases as readonly string[]).includes(project.status)
      );
      const safeIndex = index === -1 ? 0 : index;
      const targetMode = STAGE_CONFIG[safeIndex].key;

      if (viewMode !== targetMode) {
        setViewMode(targetMode);
      }

      refreshProjectData();

      // 进入已售视图时，加载照片
      if (targetMode === "sold") {
        fetchSoldViewData();
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
