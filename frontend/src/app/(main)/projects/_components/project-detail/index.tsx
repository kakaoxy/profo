"use client";

import { useState } from "react";
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

import { ProjectDetailHeader } from "./header";
import { RenovationView } from "./views/renovation";
import { DefaultView } from "./views/default";
import { SellingView } from "./views/selling";
import { SoldView } from "./views/sold";

import { useProjectDetail } from "./hooks/use-project-detail";
import { useProjectAttachments } from "./hooks/use-project-attachments";

import type { ProjectDetailSheetProps } from "./types";

export * from "./types";
export * from "./utils";
export * from "./constants";

export function ProjectDetailSheet({
  project: initialProject,
  isOpen,
  onClose,
  onUpdateAttachments,
}: ProjectDetailSheetProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const {
    project,
    viewMode,
    currentProjectStageIndex,
    refreshProjectData,
    handleViewModeChange,
    handleHandoverSuccess,
    handleListingSuccess,
    handleDealSuccess,
  } = useProjectDetail({ initialProject, isOpen });

  const { attachments, createHandlers } = useProjectAttachments({
    signingMaterials: project?.signing_materials,
    onUpdateAttachments,
  });

  if (!project) return null;

  const handlers = createHandlers(setPreviewImage);
  const isSoldMode = viewMode === "sold";
  const viewKey = `${project.id}-${JSON.stringify(
    project.signing_materials || "",
  )}-${project.updated_at}`;

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
                    onListingSuccess={handleListingSuccess}
                  />
                )}
                {viewMode === "selling" && (
                  <SellingView
                    key={viewKey}
                    project={project}
                    onRefresh={refreshProjectData}
                    onDealSuccess={handleDealSuccess}
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
