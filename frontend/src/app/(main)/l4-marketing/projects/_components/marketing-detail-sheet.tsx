"use client";

import React, { useState, useEffect, useCallback, useRef, memo, lazy, Suspense } from "react";
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
import { BasicConfigSection } from "./detail/basic-config-section";
import { PhotosSection } from "./detail/photos-section";

interface MarketingDetailSheetProps {
  project: L4MarketingProject | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

// 请求缓存，用于防止重复请求相同项目的数据
const requestCache = new Map<number, Promise<{ project: L4MarketingProject | null; photos: L4MarketingMedia[] }>>();

// 使用 memo 避免不必要的重渲染
export const MarketingDetailSheet = memo(function MarketingDetailSheet({
  project: initialProject,
  isOpen,
  onClose,
}: MarketingDetailSheetProps) {
  const isFetchingRef = useRef(false);
  const fetchedProjectIdRef = useRef<number | null>(null);

  const [project, setProject] = useState<L4MarketingProject | null>(initialProject);
  const [photos, setPhotos] = useState<L4MarketingMedia[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 初始化数据 - 只在 initialProject 变化时更新
  useEffect(() => {
    if (initialProject) {
      setProject(initialProject);
    }
  }, [initialProject?.id]);

  // 加载详情数据（带请求去重）
  const loadDetailData = useCallback(async (projectId: number) => {
    if (isFetchingRef.current) return;
    if (fetchedProjectIdRef.current === projectId && photos.length > 0) return;

    isFetchingRef.current = true;
    setIsLoading(true);

    try {
      let requestPromise = requestCache.get(projectId);

      if (!requestPromise) {
        requestPromise = (async () => {
          const [projectRes, photosRes] = await Promise.all([
            getL4MarketingProjectAction(projectId),
            getL4MarketingMediaAction(projectId, 1, 100),
          ]);

          const projectData = projectRes.success && projectRes.data
            ? (projectRes.data as L4MarketingProject)
            : null;
          const photosData = photosRes.success && photosRes.data
            ? ((photosRes.data.items as L4MarketingMedia[]) || [])
            : [];

          return { project: projectData, photos: photosData };
        })();

        requestCache.set(projectId, requestPromise);

        requestPromise.finally(() => {
          requestCache.delete(projectId);
        });
      }

      const { project: projectData, photos: photosData } = await requestPromise;

      if (projectData) {
        setProject(projectData);
      }
      setPhotos(photosData);
      fetchedProjectIdRef.current = projectId;
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

  // 重置状态当模态框关闭时
  useEffect(() => {
    if (!isOpen) {
      setPhotos([]);
      fetchedProjectIdRef.current = null;
    }
  }, [isOpen]);

  if (!project) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-3xl flex flex-col p-0 transition-all duration-300">
        <SheetTitle className="sr-only">营销项目详情 - {project.title}</SheetTitle>
        <SheetDescription className="sr-only">
          查看和管理营销项目 {project.title} 的详细信息
        </SheetDescription>

        {/* Header */}
        <MarketingDetailHeader project={project} onClose={onClose} />

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hide"
          style={{ scrollbarGutter: "stable" }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* 1. 房源信息 - 左右布局（主图+信息） */}
              <MarketingInfoSection project={project} photos={photos} />

              {/* 2. 房源状态 + 管理配置 */}
              <BasicConfigSection project={project} />

              {/* 3. 媒体资源 */}
              <PhotosSection project={project} photos={photos} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
});
