"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";

import type { L4MarketingProject, L4MarketingMedia } from "../types";
import {
  getL4MarketingProjectAction,
  getL4MarketingMediaAction,
} from "../actions";

import { MarketingDetailHeader } from "./detail/marketing-detail-header";
import { MarketingInfoSection } from "./detail/marketing-info-section";
import { PhysicalInfoSection } from "./detail/physical-info-section";
import { BasicConfigSection } from "./detail/basic-config-section";
import { PhotosSection } from "./detail/photos-section";
import { ImagePreviewDialog } from "./detail/image-preview-dialog";

interface MarketingDetailSheetProps {
  project: L4MarketingProject | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export function MarketingDetailSheet({
  project: initialProject,
  isOpen,
  onClose,
  onRefresh,
}: MarketingDetailSheetProps) {
  const isFetchingRef = useRef(false);

  const [project, setProject] = useState<L4MarketingProject | null>(initialProject);
  const [photos, setPhotos] = useState<L4MarketingMedia[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 初始化数据
  useEffect(() => {
    if (initialProject) {
      setProject(initialProject);
    }
  }, [initialProject]);

  // 加载详情数据
  const loadDetailData = useCallback(async (projectId: number) => {
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;
    setIsLoading(true);

    try {
      const [projectRes, photosRes] = await Promise.all([
        getL4MarketingProjectAction(projectId),
        getL4MarketingMediaAction(projectId, 1, 100),
      ]);

      if (projectRes.success && projectRes.data) {
        setProject(projectRes.data as L4MarketingProject);
      }

      if (photosRes.success && photosRes.data) {
        setPhotos((photosRes.data.items as L4MarketingMedia[]) || []);
      }
    } catch (error) {
      console.error("Failed to load detail data:", error);
      toast.error("加载详情数据失败");
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  // 当模态框打开时加载数据
  useEffect(() => {
    if (isOpen && project?.id) {
      loadDetailData(project.id);
    }
  }, [isOpen, project?.id, loadDetailData]);

  if (!project) return null;

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-3xl flex flex-col p-0 transition-all duration-300">
          <SheetTitle className="sr-only">营销项目详情 - {project.title}</SheetTitle>
          <SheetDescription className="sr-only">
            查看和管理营销项目 {project.title} 的详细信息
          </SheetDescription>

          <MarketingDetailHeader
            project={project}
            onClose={onClose}
          />

          <div
            className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hide"
            style={{ scrollbarGutter: "stable" }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 space-y-6">
                  <MarketingInfoSection
                    project={project}
                    onPreviewImage={setPreviewImage}
                  />
                  <PhysicalInfoSection project={project} />
                </div>

                <div className="lg:col-span-5 space-y-6">
                  <BasicConfigSection
                    project={project}
                    onPreviewImage={setPreviewImage}
                  />
                  <PhotosSection project={project} photos={photos} />
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ImagePreviewDialog
        imageUrl={previewImage}
        onClose={() => setPreviewImage(null)}
      />
    </>
  );
}
