"use client";

import React, { memo, useState, useMemo, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImageIcon, FolderOpen } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// 开发环境检测常量（在所有 import 之后定义）
const IS_DEVELOPMENT = process.env.NODE_ENV === "development";
import { toast } from "sonner";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
} from "@dnd-kit/sortable";

import { RENOVATION_STAGES } from "../../types";
import type { L4MarketingMedia, PhotoCategory } from "../../types";
import type { PhotosSectionProps } from "./types";
import {
  deleteL4MarketingMediaAction,
  updateL4MarketingMediaAction,
  batchUpdateMediaSortOrderAction,
} from "../../actions";

import { ImageUploader } from "../photo-manager/image-uploader";
import { useImageUpload } from "../photo-manager/use-image-upload";
import { PhotoCategorySelector } from "../photo-manager/photo-category-selector";
import { PhotoLibraryPicker } from "../photo-manager/photo-library-picker";
import { MarketingPhotoList } from "./marketing-photo-list";
import { RenovationPhotoList } from "./renovation-photo-list";
import { usePerformanceMonitor, PerformanceReport } from "./performance-monitor";

// 动态导入拖拽相关组件以减少初始 bundle 大小
const DndProvider = dynamic(
  () => import("./dnd-provider").then((mod) => mod.DndProvider),
  { ssr: false }
);
const DragOverlay = dynamic(
  () => import("@dnd-kit/core").then((mod) => mod.DragOverlay),
  { ssr: false }
);
const PhotoDragOverlay = dynamic(
  () => import("../photo-manager/photo-drag-overlay").then((mod) => mod.PhotoDragOverlay),
  { ssr: false }
);

const CONTAINER_MARKETING = "marketing";
const CONTAINER_RENOVATION_PREFIX = "renovation-";

type UploadTab = "sync" | "upload";

export const PhotosSection = memo(function PhotosSection({
  project,
  photos: initialPhotos,
}: PhotosSectionProps) {
  const l4ProjectId = project.id;
  const l3ProjectId = project.project_id;
  const [photos, setPhotos] = useState<L4MarketingMedia[]>(initialPhotos);
  const [activeTab, setActiveTab] = useState<UploadTab>("upload");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<PhotoCategory>("marketing");
  const [uploadStage, setUploadStage] = useState("other");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [showPerfReport, setShowPerfReport] = useState(false);

  // 性能监控
  const { metrics } = usePerformanceMonitor("PhotosSection", {
    enableFPS: true,
    fpsSampleInterval: 2000,
    logToConsole: IS_DEVELOPMENT,
    thresholds: {
      loadTime: 1000,
      fcp: 1800,
      lcp: 2500,
      cls: 0.1,
      fps: 30,
    },
  });

  React.useEffect(() => {
    setPhotos(initialPhotos);
  }, [initialPhotos]);

  // 开发环境下显示性能报告快捷键
  React.useEffect(() => {
    if (!IS_DEVELOPMENT) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Shift + P 切换性能报告
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
        e.preventDefault();
        setShowPerfReport((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const { uploadingFiles, isUploading, uploadFiles } = useImageUpload({
    projectId: l3ProjectId ? parseInt(l3ProjectId) : undefined,
    uploadCategory,
    uploadStage,
    photos,
    onPhotosChange: setPhotos,
  });

  const marketingPhotos = useMemo(
    () =>
      photos
        .filter((p) => p.photo_category === "marketing")
        .sort((a, b) => a.sort_order - b.sort_order),
    [photos]
  );

  const renovationPhotos = useMemo(
    () =>
      photos
        .filter((p) => p.photo_category === "renovation")
        .sort((a, b) => a.sort_order - b.sort_order),
    [photos]
  );

  const renovationPhotosByStage = useMemo(() => {
    const grouped: Record<string, L4MarketingMedia[]> = {};
    renovationPhotos.forEach((photo) => {
      const stage = photo.renovation_stage || "other";
      if (!grouped[stage]) grouped[stage] = [];
      grouped[stage].push(photo);
    });
    return grouped;
  }, [renovationPhotos]);

  const marketingPhotoIds = useMemo(
    () => marketingPhotos.map((p) => p.id),
    [marketingPhotos]
  );

  const getRenovationStageIds = useCallback(
    (stage: string) => {
      return (renovationPhotosByStage[stage] || []).map((p) => p.id);
    },
    [renovationPhotosByStage]
  );

  const activePhoto = useMemo(() => {
    if (!activeId) return null;
    return photos.find((p) => p.id === activeId) || null;
  }, [activeId, photos]);

  const getContainerId = useCallback((photo: L4MarketingMedia): string => {
    if (photo.photo_category === "marketing") {
      return CONTAINER_MARKETING;
    }
    return `${CONTAINER_RENOVATION_PREFIX}${photo.renovation_stage || "other"}`;
  }, []);

  const getContainerIdFromOverId = useCallback(
    (overId: string, allPhotos: L4MarketingMedia[]): string => {
      if (overId === CONTAINER_MARKETING) return CONTAINER_MARKETING;
      if (overId.startsWith(CONTAINER_RENOVATION_PREFIX)) return overId;

      const photo = allPhotos.find((p) => p.id.toString() === overId);
      if (photo) {
        return getContainerId(photo);
      }

      return CONTAINER_MARKETING;
    },
    [getContainerId]
  );

  const handleSameContainerSort = useCallback(
    async (activePhoto: L4MarketingMedia, overId: number) => {
      const isMarketing = activePhoto.photo_category === "marketing";
      const currentList = isMarketing
        ? marketingPhotos
        : renovationPhotos.filter(
            (p) => p.renovation_stage === activePhoto.renovation_stage
          );

      const oldIndex = currentList.findIndex((p) => p.id === activePhoto.id);
      const newIndex = currentList.findIndex((p) => p.id === overId);

      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(currentList, oldIndex, newIndex);
      const updatedPhotos = reordered.map((p, idx) => ({ ...p, sort_order: idx }));

      const newPhotos = photos.map((p) => {
        const updated = updatedPhotos.find((u) => u.id === p.id);
        return updated || p;
      });

      setPhotos(newPhotos);

      const sortUpdates = updatedPhotos.map((p, idx) => ({
        media_id: p.id,
        sort_order: idx,
      }));

      const result = await batchUpdateMediaSortOrderAction(l4ProjectId, sortUpdates);
      if (!result.success) {
        toast.error("保存排序失败");
      }
    },
    [marketingPhotos, renovationPhotos, photos, l4ProjectId]
  );

  const handleCrossContainerMove = useCallback(
    async (activePhoto: L4MarketingMedia, targetContainer: string) => {
      const isMovingToMarketing = targetContainer === CONTAINER_MARKETING;
      const targetStage = isMovingToMarketing
        ? null
        : targetContainer.replace(CONTAINER_RENOVATION_PREFIX, "");

      const updatedPhoto: L4MarketingMedia = {
        ...activePhoto,
        photo_category: isMovingToMarketing ? "marketing" : "renovation",
        renovation_stage: targetStage,
      };

      const targetList = isMovingToMarketing
        ? marketingPhotos
        : renovationPhotos.filter((p) => p.renovation_stage === targetStage);

      const newSortOrder = targetList.length;
      updatedPhoto.sort_order = newSortOrder;

      const newPhotos = photos.map((p) =>
        p.id === updatedPhoto.id ? updatedPhoto : p
      );
      setPhotos(newPhotos);

      const updateResult = await updateL4MarketingMediaAction(
        activePhoto.id,
        l4ProjectId,
        {
          photo_category: updatedPhoto.photo_category,
          renovation_stage: updatedPhoto.renovation_stage,
          sort_order: newSortOrder,
        }
      );

      if (updateResult.success) {
        toast.success(
          `已移动到${isMovingToMarketing ? "营销照片" : targetStage + "阶段"}`
        );
      } else {
        toast.error("移动失败");
        setPhotos(photos);
      }
    },
    [marketingPhotos, renovationPhotos, photos]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over) return;

      const activePhoto = photos.find((p) => p.id === active.id);
      if (!activePhoto) return;

      const overId = over.id;
      const activeContainer = getContainerId(activePhoto);
      const overContainer = getContainerIdFromOverId(overId.toString(), photos);

      if (activeContainer === overContainer && active.id !== overId) {
        await handleSameContainerSort(activePhoto, overId as number);
        return;
      }

      if (activeContainer !== overContainer) {
        await handleCrossContainerMove(activePhoto, overContainer);
      }
    },
    [photos, getContainerId, getContainerIdFromOverId, handleSameContainerSort, handleCrossContainerMove]
  );

  const handleDeletePhoto = useCallback(
    async (photoId: number) => {
      if (!confirm("确定删除这张照片吗？")) return;

      try {
        const result = await deleteL4MarketingMediaAction(photoId, l4ProjectId);
        if (result.success) {
          setPhotos(photos.filter((p) => p.id !== photoId));
          toast.success("照片已删除");
        } else {
          toast.error(result.error || "删除照片失败");
        }
      } catch {
        toast.error("删除照片失败");
      }
    },
    [photos, l4ProjectId]
  );

  const handlePhotosAdded = useCallback(
    (addedPhotos: L4MarketingMedia[]) => {
      setPhotos((prev) => [...prev, ...addedPhotos]);
      toast.success(`成功添加 ${addedPhotos.length} 张照片`);
    },
    []
  );

  const handleOpenPicker = useCallback(() => {
    setPickerOpen(true);
  }, []);

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">媒体资源</span>
          <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-500">
            共 {photos.length} 张
          </Badge>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as UploadTab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload">手动上传</TabsTrigger>
            <TabsTrigger value="sync">同步照片</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4 mt-4">
            <div className="space-y-3">
              <div className="text-xs font-medium text-slate-500">
                选择照片类别
              </div>
              <PhotoCategorySelector
                value={uploadCategory}
                onChange={setUploadCategory}
                disabled={isUploading}
              />

              {uploadCategory === "renovation" && (
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-6 lg:col-span-4">
                    <div className="text-xs font-medium text-slate-500 mb-1">
                      装修阶段
                    </div>
                    <Select
                      value={uploadStage}
                      onValueChange={setUploadStage}
                      disabled={isUploading}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RENOVATION_STAGES.map((stage) => (
                          <SelectItem key={stage.value} value={stage.value}>
                            {stage.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            <ImageUploader
              uploadingFiles={uploadingFiles}
              isUploading={isUploading}
              onUpload={uploadFiles}
              disabled={isUploading}
            />
          </TabsContent>

          <TabsContent value="sync" className="space-y-4 mt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-medium text-slate-500">
                从其他项目同步照片
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenPicker}
                className="bg-white border-slate-200 hover:bg-slate-50"
              >
                <FolderOpen className="h-4 w-4 mr-1" />
                从照片库选择
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {photos.length > 0 && (
          <DndProvider onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
              <MarketingPhotoList
                photos={marketingPhotos}
                photoIds={marketingPhotoIds}
                onDelete={handleDeletePhoto}
              />

              <RenovationPhotoList
                photos={renovationPhotos}
                activeId={activeId}
                getStageIds={getRenovationStageIds}
                onDelete={handleDeletePhoto}
              />
            </div>

            <DragOverlay>
              {activePhoto ? <PhotoDragOverlay photo={activePhoto} /> : null}
            </DragOverlay>
          </DndProvider>
        )}

        {photos.length === 0 && !isUploading && (
          <div className="text-center py-8 text-slate-400">
            <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无照片</p>
            <p className="text-xs mt-1">请上传或关联照片</p>
          </div>
        )}
      </div>

      <PhotoLibraryPicker
        l3ProjectId={l3ProjectId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        nextSortOrderStart={photos.length}
        onPhotosAdded={handlePhotosAdded}
        existingPhotoUrls={new Set(photos.map((p) => p.file_url))}
      />

      {/* 性能报告（仅开发环境） */}
      <PerformanceReport
        componentName="PhotosSection"
        metrics={metrics}
        visible={showPerfReport}
      />
    </div>
  );
});
