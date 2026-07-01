"use client";

import { useState, useCallback, useMemo, Suspense, lazy } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { L4MarketingMedia, PhotoCategory, RENOVATION_STAGES } from "@/app/(main)/admin/l4-marketing/projects/types";
import { customCollisionDetection } from "./collision-detection";
import { PhotoDragOverlay } from "./photo-drag-overlay";
import { PhotoCategorySelector } from "./photo-category-selector";
import { deleteL4MarketingMediaAction } from "../../actions";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadArea } from "@/components/common/image-upload";
import { useImageUpload } from "./use-image-upload";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { FolderOpen, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_UPLOAD_FILES } from "@/lib/constants";
import { usePhotoDragAndDrop } from "./use-photo-drag-and-drop";
import { MarketingPhotoList } from "./marketing-photo-list";
import { RenovationPhotoList } from "./renovation-photo-list";
import { useProjectId } from "./use-project-id";

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

  const { effectiveProjectId } = useProjectId({ l4ProjectId, l3ProjectId });

  const {
    uploadingFiles,
    isUploading,
    uploadFiles,
    failedUploads,
    retryFailed,
    clearFailed,
  } = useImageUpload({
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
      <section className="bg-primary/5 rounded-2xl p-8">
        <h3 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
          <span className="w-1.5 h-6 bg-primary rounded-full"></span>
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
                <div className="text-xs font-medium text-muted-foreground">选择照片类别</div>
                <PhotoCategorySelector
                  value={uploadCategory}
                  onChange={setUploadCategory}
                  disabled={isUploading}
                />

                {uploadCategory === "renovation" ? (
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-6 lg:col-span-4">
                      <div className="text-xs font-medium text-muted-foreground mb-1">装修阶段</div>
                      <Select
                        value={uploadStage}
                        onValueChange={setUploadStage}
                        disabled={isUploading}
                      >
                        <SelectTrigger className="bg-card border-[--border]/50">
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

              <UploadArea
                isUploading={isUploading}
                disabled={isUploading}
                title="点击或拖拽图片到此处上传"
                description={`支持 JPG, PNG, GIF, WebP 格式，单文件最大 10MB，单次最多 ${MAX_UPLOAD_FILES} 张`}
                accept=".jpg,.jpeg,.png,.gif,.webp"
                multiple
                onUpload={uploadFiles}
              />

              {uploadingFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在上传 {uploadingFiles.length} 个文件...
                  </div>
                  {uploadingFiles.map((file, index) => (
                    <div key={index} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="truncate max-w-[200px]">{file.filename}</span>
                        <span>{file.progress}%</span>
                      </div>
                      <Progress value={file.progress} className="h-1" />
                    </div>
                  ))}
                </div>
              )}

              {failedUploads.length > 0 && (
                <div className="rounded-md border border-error/20 bg-error/5 p-3 space-y-2">
                  <div className="text-sm font-medium text-error">
                    以下 {failedUploads.length} 个文件上传失败
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {failedUploads.map((file, index) => (
                      <li key={index} className="truncate">{file.filename}</li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={retryFailed}
                      disabled={isUploading}
                      className="h-8 text-xs"
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                      重试
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearFailed}
                      disabled={isUploading}
                      className="h-8 text-xs"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      清除
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="sync" className="space-y-4 mt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-medium text-muted-foreground">从其他项目同步照片</div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                  className="bg-card border-[--border]/50 hover:bg-primary"
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-[--border]/20">
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
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          }
        >
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
