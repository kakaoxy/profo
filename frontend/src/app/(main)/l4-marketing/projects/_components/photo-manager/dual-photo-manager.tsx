"use client";

import { useState, useCallback, useMemo, Suspense, lazy } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { L4MarketingMedia, PhotoCategory, RENOVATION_STAGES } from "@/app/(main)/l4-marketing/projects/types";
import { customCollisionDetection } from "./collision-detection";
import { PhotoDragOverlay } from "./photo-drag-overlay";
import { PhotoCategorySelector } from "./photo-category-selector";
import { deleteL4MarketingMediaAction } from "../../actions";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImageUploader } from "./image-uploader";
import { useImageUpload } from "./use-image-upload";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePhotoDragAndDrop } from "./use-photo-drag-and-drop";
import { MarketingPhotoList } from "./marketing-photo-list";
import { RenovationPhotoList } from "./renovation-photo-list";

const PhotoLibraryPicker = lazy(() => import("./photo-library-picker").then(mod => ({ default: mod.PhotoLibraryPicker })));

interface DualPhotoManagerProps {
  l3ProjectId?: string | null;
  l4ProjectId?: number;
  photos: L4MarketingMedia[];
  onPhotosChange: (photos: L4MarketingMedia[]) => void;
}

type UploadTab = "sync" | "upload";

export function DualPhotoManager({
  l3ProjectId,
  l4ProjectId,
  photos,
  onPhotosChange,
}: DualPhotoManagerProps) {
  const [activeTab, setActiveTab] = useState<UploadTab>("upload");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<PhotoCategory>("marketing");
  const [uploadStage, setUploadStage] = useState("other");

  // 统一项目ID解析逻辑：l3ProjectId需为有效正整数
  const parsedL3Id = l3ProjectId ? parseInt(l3ProjectId) : NaN;
  const effectiveProjectId = l4ProjectId ?? (parsedL3Id > 0 ? parsedL3Id : undefined);

  const { uploadingFiles, isUploading, uploadFiles } = useImageUpload({
    // 优先使用 l4ProjectId（L4营销项目ID），如果不存在则使用 l3ProjectId
    projectId: effectiveProjectId,
    uploadCategory,
    uploadStage,
    photos,
    onPhotosChange,
  });

  const marketingPhotos = useMemo(
    () => photos.filter((p) => p.photo_category === "marketing").sort((a, b) => a.sort_order - b.sort_order),
    [photos]
  );

  const renovationPhotos = useMemo(
    () => photos.filter((p) => p.photo_category === "renovation").sort((a, b) => a.sort_order - b.sort_order),
    [photos]
  );

  const {
    activeId,
    sensors,
    marketingPhotoIds,
    getRenovationStageIds,
    activePhoto,
    handleDragStart,
    handleDragEnd,
  } = usePhotoDragAndDrop({
    // 优先使用 l4ProjectId（L4营销项目ID），如果不存在则使用 l3ProjectId
    projectId: effectiveProjectId,
    photos,
    onPhotosChange,
    marketingPhotos,
    renovationPhotos,
  });

  const handleDeletePhoto = useCallback(async (photoId: number) => {
    if (!confirm("确定删除这张照片吗？")) return;

    // 如果没有项目ID（创建模式），直接更新本地状态
    const deleteProjectId = effectiveProjectId ?? 0;
    if (!deleteProjectId) {
      onPhotosChange(photos.filter((p) => p.id !== photoId));
      toast.success("照片已删除");
      return;
    }

    try {
      const result = await deleteL4MarketingMediaAction(photoId, deleteProjectId);
      if (result.success) {
        onPhotosChange(photos.filter((p) => p.id !== photoId));
        toast.success("照片已删除");
      } else {
        toast.error(result.error || "删除照片失败");
      }
    } catch {
      toast.error("删除照片失败");
    }
  }, [photos, onPhotosChange, effectiveProjectId]);

  return (
    <>
      <section className="bg-[#eff4ff] rounded-2xl p-8">
        <h3 className="text-lg font-bold text-[#0b1c30] mb-6 flex items-center gap-2">
          <span className="w-1.5 h-6 bg-[#005daa] rounded-full"></span>
          照片管理 (Photos)
        </h3>
        <div className="space-y-6">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as UploadTab)}>
            <TabsList className={l3ProjectId ? "grid w-full grid-cols-2" : "grid w-full"}>
              <TabsTrigger value="upload">手动上传</TabsTrigger>
              {l3ProjectId ? <TabsTrigger value="sync">同步照片</TabsTrigger> : null}
            </TabsList>

            <TabsContent value="upload" className="space-y-4 mt-4">
              <div className="space-y-3">
                <div className="text-xs font-medium text-[#707785]">选择照片类别</div>
                <PhotoCategorySelector
                  value={uploadCategory}
                  onChange={setUploadCategory}
                  disabled={isUploading}
                />

                {uploadCategory === "renovation" ? (
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-6 lg:col-span-4">
                      <div className="text-xs font-medium text-[#707785] mb-1">装修阶段</div>
                      <Select
                        value={uploadStage}
                        onValueChange={setUploadStage}
                        disabled={isUploading}
                      >
                        <SelectTrigger className="bg-white border-[#c0c7d6]/50">
                          <SelectValue placeholder="选择阶段" />
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
                ) : null}
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
                <div className="text-xs font-medium text-[#707785]">从其他项目同步照片</div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                  className="bg-white border-[#c0c7d6]/50 hover:bg-[#e5eeff]"
                >
                  <FolderOpen className="h-4 w-4 mr-1" />
                  从照片库选择
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <DndContext
            sensors={sensors}
            collisionDetection={customCollisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-[#c0c7d6]/20">
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
          </DndContext>
        </div>
      </section>

      {l3ProjectId ? (
        <Suspense fallback={null}>
          <PhotoLibraryPicker
            l3ProjectId={l3ProjectId}
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            nextSortOrderStart={photos.length}
            onPhotosAdded={(addedPhotos) => onPhotosChange([...photos, ...addedPhotos])}
            existingPhotoUrls={new Set(photos.map((p) => p.file_url))}
          />
        </Suspense>
      ) : null}
    </>
  );
}
