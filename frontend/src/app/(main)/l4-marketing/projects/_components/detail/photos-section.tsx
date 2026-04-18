"use client";

import React, { memo, useState, useCallback, Suspense } from "react";
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
import { toast } from "sonner";

import { RENOVATION_STAGES } from "../../types";
import type { PhotoCategory } from "../../types";
import type { PhotosSectionProps } from "./types";

import { ImageUploader } from "../photo-manager/image-uploader";
import { useImageUpload } from "../photo-manager/use-image-upload";
import { PhotoCategorySelector } from "../photo-manager/photo-category-selector";
import { MarketingPhotoList } from "./marketing-photo-list";
import { RenovationPhotoList } from "./renovation-photo-list";
import { usePhotoSorting } from "./use-photo-sorting";

// 动态导入拖拽相关组件
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
const PhotoLibraryPicker = dynamic(
  () => import("../photo-manager/photo-library-picker").then((mod) => mod.PhotoLibraryPicker),
  { ssr: false }
);

type UploadTab = "sync" | "upload";

export const PhotosSection = memo(function PhotosSection({
  project,
  photos: initialPhotos,
}: PhotosSectionProps) {
  const l4ProjectId = project.id;
  const l3ProjectId = project.project_id;
  const [activeTab, setActiveTab] = useState<UploadTab>("upload");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<PhotoCategory>("marketing");
  const [uploadStage, setUploadStage] = useState("other");

  const {
    photos,
    activeId,
    marketingPhotos,
    renovationPhotos,
    renovationPhotosByStage,
    marketingPhotoIds,
    getRenovationStageIds,
    activePhoto,
    handleDragStart,
    handleDragEnd,
    handleDeletePhoto,
    handlePhotosAdded,
  } = usePhotoSorting({
    projectId: l4ProjectId,
    initialPhotos,
  });

  const { uploadingFiles, isUploading, uploadFiles } = useImageUpload({
    projectId: l3ProjectId ? parseInt(l3ProjectId) : undefined,
    uploadCategory,
    uploadStage,
    photos,
    onPhotosChange: () => {}, // Handled by parent
  });

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

      <Suspense fallback={null}>
        <PhotoLibraryPicker
          l3ProjectId={l3ProjectId}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          nextSortOrderStart={photos.length}
          onPhotosAdded={handlePhotosAdded}
          existingPhotoUrls={new Set(photos.map((p) => p.file_url))}
        />
      </Suspense>
    </div>
  );
});
