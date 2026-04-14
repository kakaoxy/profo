"use client";

import React, { useState, useEffect, useCallback, useRef, memo, lazy, Suspense } from "react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import type { L4MarketingProject, L4MarketingMedia } from "../types";
import {
  getL4MarketingProjectAction,
  getL4MarketingMediaAction,
  deleteL4MarketingProjectAction,
} from "../actions";

import { MarketingInfoSection } from "./detail/marketing-info-section";
import { BasicConfigSection } from "./detail/basic-config-section";
import { PhotosSection } from "./detail/photos-section";

// 懒加载图片预览对话框
const ImagePreviewDialog = lazy(() => import("./detail/image-preview-dialog").then(m => ({ default: m.ImagePreviewDialog })));

// 图片预览对话框加载占位符
function ImagePreviewDialogFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <div className="animate-pulse bg-white/20 w-full max-w-5xl h-[80vh] rounded-lg" />
    </div>
  );
}

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
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleDelete = async () => {
    if (!project) return;
    setIsDeleting(true);
    try {
      const res = await deleteL4MarketingProjectAction(project.id);
      if (res.success) {
        toast.success("项目已删除");
        onClose();
      } else {
        toast.error(res.error || "删除失败");
      }
    } catch {
      toast.error("删除失败");
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("zh-CN");
  };

  if (!project) return null;

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-3xl flex flex-col p-0 transition-all duration-300">
          <SheetTitle className="sr-only">营销项目详情 - {project.title}</SheetTitle>
          <SheetDescription className="sr-only">
            查看和管理营销项目 {project.title} 的详细信息
          </SheetDescription>

          {/* Header */}
          <div className="px-6 py-4 border-b sticky top-0 bg-background z-10 shrink-0">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-slate-900">
                    {project.title}
                  </h2>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Clock className="h-3 w-3" />
                  <span>创建于 {formatDate(project.created_at)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Link
                  href={`/l4-marketing/projects/${project.id}/edit`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button variant="outline" size="sm">
                    <Pencil className="mr-2 h-4 w-4" />
                    编辑
                  </Button>
                </Link>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      删除
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认删除项目？</AlertDialogTitle>
                      <AlertDialogDescription>
                        此操作将删除营销项目 &quot;{project.title}&quot;。该操作不可撤销。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => {
                          e.preventDefault();
                          handleDelete();
                        }}
                        disabled={isDeleting}
                        className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                      >
                        {isDeleting ? "删除中..." : "确认删除"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>

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
                {/* 1. 基础信息 - 核心信息展示 */}
                <MarketingInfoSection project={project} />

                {/* 2. 状态信息 */}
                <BasicConfigSection project={project} />

                {/* 3. 图片信息 */}
                <PhotosSection project={project} photos={photos} />
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Suspense fallback={<ImagePreviewDialogFallback />}>
        <ImagePreviewDialog
          imageUrl={previewImage}
          onClose={() => setPreviewImage(null)}
        />
      </Suspense>
    </>
  );
});
