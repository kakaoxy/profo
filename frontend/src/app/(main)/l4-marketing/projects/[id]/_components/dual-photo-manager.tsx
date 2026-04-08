"use client";

import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { L4MarketingMedia, PhotoCategory } from "../../types";
import { DraggablePhotoItem } from "./draggable-photo-item";
import { PhotoCategorySelector } from "./photo-category-selector";
import { deleteL4MarketingMediaAction, batchUpdateMediaSortOrderAction } from "../../actions";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImageUploader } from "./image-uploader";
import { useImageUpload } from "./use-image-upload";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RENOVATION_STAGES } from "../../types";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoLibraryPicker } from "./photo-library-picker";

interface DualPhotoManagerProps {
  projectId: number;
  photos: L4MarketingMedia[];
  onPhotosChange: (photos: L4MarketingMedia[]) => void;
}

type UploadTab = "sync" | "upload";

export function DualPhotoManager({
  projectId,
  photos,
  onPhotosChange,
}: DualPhotoManagerProps) {
  const [activeTab, setActiveTab] = useState<UploadTab>("upload");
  const [pickerOpen, setPickerOpen] = useState(false);

  const [uploadCategory, setUploadCategory] = useState<PhotoCategory>("marketing");
  const [uploadStage, setUploadStage] = useState("other");

  const { uploadingFiles, isUploading, uploadFiles } = useImageUpload({
    projectId,
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

  const renovationPhotosByStage = useMemo(() => {
    const grouped: Record<string, L4MarketingMedia[]> = {};
    renovationPhotos.forEach((photo) => {
      const stage = photo.renovation_stage || "other";
      if (!grouped[stage]) grouped[stage] = [];
      grouped[stage].push(photo);
    });
    return grouped;
  }, [renovationPhotos]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleMarketingDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = marketingPhotos.findIndex((p) => p.id === active.id);
    const newIndex = marketingPhotos.findIndex((p) => p.id === over.id);

    const reordered = arrayMove(marketingPhotos, oldIndex, newIndex);

    const updatedPhotos = reordered.map((p, idx) => ({
      ...p,
      sort_order: idx,
    }));

    const newPhotos = [
      ...updatedPhotos,
      ...renovationPhotos,
    ];

    onPhotosChange(newPhotos);

    const sortUpdates = updatedPhotos.map((p, idx) => ({
      media_id: p.id,
      sort_order: idx,
    }));

    const result = await batchUpdateMediaSortOrderAction(projectId, sortUpdates);
    if (result.success) {
      toast.success("排序已保存");
    } else {
      toast.error("保存排序失败");
    }
  }, [marketingPhotos, renovationPhotos, onPhotosChange, projectId]);

  const handleDeletePhoto = useCallback(async (photoId: number) => {
    if (!confirm("确定删除这张照片吗？")) return;
    try {
      const result = await deleteL4MarketingMediaAction(photoId);
      if (result.success) {
        onPhotosChange(photos.filter((p) => p.id !== photoId));
        toast.success("照片已删除");
      } else {
        toast.error(result.error || "删除照片失败");
      }
    } catch {
      toast.error("删除照片失败");
    }
  }, [photos, onPhotosChange]);

  return (
    <>
      <Card className="py-0 gap-0">
        <CardHeader className="border-b py-4">
          <CardTitle className="text-sm">照片管理</CardTitle>
        </CardHeader>
        <CardContent className="py-6 space-y-6">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as UploadTab)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload">手动上传</TabsTrigger>
              <TabsTrigger value="sync">同步照片</TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-4 mt-4">
              <div className="space-y-3">
                <div className="text-xs font-medium text-muted-foreground">
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
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        装修阶段
                      </div>
                      <Select
                        value={uploadStage}
                        onValueChange={setUploadStage}
                        disabled={isUploading}
                      >
                        <SelectTrigger>
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
                <div className="text-xs font-medium text-muted-foreground">
                  从其他项目同步照片
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                >
                  <FolderOpen className="h-4 w-4 mr-1" />
                  从照片库选择
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[#005daa]">
                  营销照片 ({marketingPhotos.length})
                </h4>
                <span className="text-xs text-muted-foreground">
                  拖拽调整顺序
                </span>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleMarketingDragEnd}
              >
                <SortableContext
                  items={marketingPhotos.map((p) => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2 min-h-[100px] max-h-[400px] overflow-y-auto p-2 bg-gray-50 rounded-lg">
                    {marketingPhotos.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        暂无营销照片
                      </div>
                    ) : (
                      marketingPhotos.map((photo, index) => (
                        <DraggablePhotoItem
                          key={photo.id}
                          photo={photo}
                          index={index}
                          onDelete={handleDeletePhoto}
                        />
                      ))
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[#22c55e]">
                  改造照片 ({renovationPhotos.length})
                </h4>
                <span className="text-xs text-muted-foreground">
                  按阶段分组展示
                </span>
              </div>

              <div className="space-y-4 min-h-[100px] max-h-[400px] overflow-y-auto p-2 bg-gray-50 rounded-lg">
                {renovationPhotos.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    暂无改造照片
                  </div>
                ) : (
                  Object.entries(renovationPhotosByStage).map(([stage, stagePhotos]) => {
                    const stageLabel = RENOVATION_STAGES.find(
                      (s) => s.value === stage
                    )?.label || "其他";

                    return (
                      <div key={stage} className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground px-1">
                          {stageLabel} ({stagePhotos.length})
                        </div>
                        <div className="space-y-2">
                          {stagePhotos.map((photo, index) => (
                            <DraggablePhotoItem
                              key={photo.id}
                              photo={photo}
                              index={index}
                              onDelete={handleDeletePhoto}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <PhotoLibraryPicker
        projectId={projectId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        nextSortOrderStart={photos.length}
        onPhotosAdded={(addedPhotos) => {
          onPhotosChange([...photos, ...addedPhotos]);
        }}
        existingPhotoIds={new Set(photos.map((p) => p.id))}
      />
    </>
  );
}
