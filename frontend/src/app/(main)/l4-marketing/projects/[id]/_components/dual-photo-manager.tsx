"use client";

import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { L4MarketingMedia, PhotoCategory } from "../../types";
import { SortablePhotoItem } from "./sortable-photo-item";
import { DroppableStage } from "./droppable-stage";
import { PhotoDragOverlay } from "./photo-drag-overlay";
import { PhotoCategorySelector } from "./photo-category-selector";
import { deleteL4MarketingMediaAction, batchUpdateMediaSortOrderAction, updateL4MarketingMediaAction } from "../../actions";
import { toast } from "sonner";
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

// 容器ID常量
const CONTAINER_MARKETING = "marketing";
const CONTAINER_RENOVATION_PREFIX = "renovation-";

export function DualPhotoManager({
  projectId,
  photos,
  onPhotosChange,
}: DualPhotoManagerProps) {
  const [activeTab, setActiveTab] = useState<UploadTab>("upload");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);

  const [uploadCategory, setUploadCategory] = useState<PhotoCategory>("marketing");
  const [uploadStage, setUploadStage] = useState("other");

  const { uploadingFiles, isUploading, uploadFiles } = useImageUpload({
    projectId,
    uploadCategory,
    uploadStage,
    photos,
    onPhotosChange,
  });

  // 按分类分组照片
  const marketingPhotos = useMemo(
    () => photos.filter((p) => p.photo_category === "marketing").sort((a, b) => a.sort_order - b.sort_order),
    [photos]
  );

  const renovationPhotos = useMemo(
    () => photos.filter((p) => p.photo_category === "renovation").sort((a, b) => a.sort_order - b.sort_order),
    [photos]
  );

  // 按阶段分组改造照片
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
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // 获取所有可拖拽项的ID
  const allPhotoIds = useMemo(() => {
    return photos.map((p) => p.id);
  }, [photos]);

  // 获取营销照片ID列表
  const marketingPhotoIds = useMemo(() => {
    return marketingPhotos.map((p) => p.id);
  }, [marketingPhotos]);

  // 获取改造照片ID列表（按阶段）
  const getRenovationStageIds = useCallback((stage: string) => {
    return (renovationPhotosByStage[stage] || []).map((p) => p.id);
  }, [renovationPhotosByStage]);

  // 获取正在拖拽的照片
  const activePhoto = useMemo(() => {
    if (!activeId) return null;
    return photos.find((p) => p.id === activeId) || null;
  }, [activeId, photos]);

  // 拖拽开始
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  }, []);

  // 拖拽结束 - 处理跨容器拖拽
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activePhoto = photos.find((p) => p.id === active.id);
    if (!activePhoto) return;

    const overId = over.id;
    const activeContainer = getContainerId(activePhoto);
    const overContainer = getContainerIdFromOverId(overId.toString(), photos);

    // 同一容器内排序
    if (activeContainer === overContainer && active.id !== overId) {
      await handleSameContainerSort(activePhoto, overId as number);
      return;
    }

    // 跨容器拖拽
    if (activeContainer !== overContainer) {
      await handleCrossContainerMove(activePhoto, overContainer, overId as number | string);
    }
  }, [photos, projectId, onPhotosChange]);

  // 获取照片所在容器ID
  const getContainerId = (photo: L4MarketingMedia): string => {
    if (photo.photo_category === "marketing") {
      return CONTAINER_MARKETING;
    }
    return `${CONTAINER_RENOVATION_PREFIX}${photo.renovation_stage || "other"}`;
  };

  // 从overId获取容器ID
  const getContainerIdFromOverId = (overId: string, allPhotos: L4MarketingMedia[]): string => {
    // 如果是容器ID本身
    if (overId === CONTAINER_MARKETING) return CONTAINER_MARKETING;
    if (overId.startsWith(CONTAINER_RENOVATION_PREFIX)) return overId;

    // 如果是照片ID，查找照片所在容器
    const photo = allPhotos.find((p) => p.id.toString() === overId);
    if (photo) {
      return getContainerId(photo);
    }

    return CONTAINER_MARKETING;
  };

  // 同一容器内排序
  const handleSameContainerSort = async (activePhoto: L4MarketingMedia, overId: number) => {
    const isMarketing = activePhoto.photo_category === "marketing";
    const currentList = isMarketing ? marketingPhotos : renovationPhotos.filter(
      (p) => p.renovation_stage === activePhoto.renovation_stage
    );

    const oldIndex = currentList.findIndex((p) => p.id === activePhoto.id);
    const newIndex = currentList.findIndex((p) => p.id === overId);

    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(currentList, oldIndex, newIndex);
    const updatedPhotos = reordered.map((p, idx) => ({ ...p, sort_order: idx }));

    // 合并更新
    const newPhotos = photos.map((p) => {
      const updated = updatedPhotos.find((u) => u.id === p.id);
      return updated || p;
    });

    onPhotosChange(newPhotos);

    // 保存排序
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
  };

  // 跨容器移动
  const handleCrossContainerMove = async (
    activePhoto: L4MarketingMedia,
    targetContainer: string,
    overId: number | string
  ) => {
    const isMovingToMarketing = targetContainer === CONTAINER_MARKETING;
    const targetStage = isMovingToMarketing
      ? null
      : targetContainer.replace(CONTAINER_RENOVATION_PREFIX, "");

    // 更新照片的分类和阶段
    const updatedPhoto: L4MarketingMedia = {
      ...activePhoto,
      photo_category: isMovingToMarketing ? "marketing" : "renovation",
      renovation_stage: targetStage,
    };

    // 计算新的排序值
    const targetList = isMovingToMarketing
      ? marketingPhotos
      : renovationPhotos.filter((p) => p.renovation_stage === targetStage);

    const newSortOrder = targetList.length;
    updatedPhoto.sort_order = newSortOrder;

    // 更新本地状态
    const newPhotos = photos.map((p) => (p.id === updatedPhoto.id ? updatedPhoto : p));
    onPhotosChange(newPhotos);

    // 调用API更新
    const updateResult = await updateL4MarketingMediaAction(activePhoto.id, {
      photo_category: updatedPhoto.photo_category,
      renovation_stage: updatedPhoto.renovation_stage,
      sort_order: newSortOrder,
    } as any);

    if (updateResult.success) {
      toast.success(`已移动到${isMovingToMarketing ? "营销照片" : targetStage + "阶段"}`);
    } else {
      toast.error("移动失败");
      // 回滚状态
      onPhotosChange(photos);
    }
  };

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
      {/* 照片管理 - 蓝色配色风格（与价格设置一致） */}
      <section className="bg-[#eff4ff] rounded-2xl p-8">
        <h3 className="text-lg font-bold text-[#0b1c30] mb-6 flex items-center gap-2">
          <span className="w-1.5 h-6 bg-[#005daa] rounded-full"></span>
          照片管理 (Photos)
        </h3>
        <div className="space-y-6">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as UploadTab)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload">手动上传</TabsTrigger>
              <TabsTrigger value="sync">同步照片</TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-4 mt-4">
              <div className="space-y-3">
                <div className="text-xs font-medium text-[#707785]">
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
                      <div className="text-xs font-medium text-[#707785] mb-1">
                        装修阶段
                      </div>
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
                <div className="text-xs font-medium text-[#707785]">
                  从其他项目同步照片
                </div>
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

          {/* 统一的 DndContext 支持跨容器拖拽 */}
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-[#c0c7d6]/20">
              {/* 左侧：营销照片 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[#005daa]">
                    营销照片 ({marketingPhotos.length})
                  </h4>
                  <span className="text-xs text-[#707785]">
                    可拖拽到右侧
                  </span>
                </div>

                <SortableContext
                  items={marketingPhotoIds}
                  strategy={verticalListSortingStrategy}
                >
                  <div
                    id={CONTAINER_MARKETING}
                    className="space-y-2 min-h-[100px] max-h-[400px] overflow-y-auto p-2 bg-white rounded-lg border border-[#c0c7d6]/20"
                  >
                    {marketingPhotos.length === 0 ? (
                      <div className="text-center py-8 text-[#707785] text-sm">
                        暂无营销照片
                        <p className="text-xs mt-1 text-[#707785]/60">
                          可将改造照片拖拽到此处
                        </p>
                      </div>
                    ) : (
                      marketingPhotos.map((photo, index) => (
                        <SortablePhotoItem
                          key={photo.id}
                          photo={photo}
                          index={index}
                          onDelete={handleDeletePhoto}
                        />
                      ))
                    )}
                  </div>
                </SortableContext>
              </div>

              {/* 右侧：改造照片（按阶段分组） */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[#22c55e]">
                    改造照片 ({renovationPhotos.length})
                  </h4>
                  <span className="text-xs text-[#707785]">
                    {activeId ? "拖拽到目标阶段" : "支持跨阶段拖拽"}
                  </span>
                </div>

                <div className="space-y-3 min-h-[100px] max-h-[400px] overflow-y-auto p-2 bg-white rounded-lg border border-[#c0c7d6]/20">
                  {/* 拖拽时显示所有阶段，平常只显示有照片的阶段 */}
                  {activeId ? (
                    // 拖拽模式：显示所有阶段作为放置目标
                    RENOVATION_STAGES.map((stageConfig) => {
                      const stage = stageConfig.value;
                      const stagePhotos = renovationPhotosByStage[stage] || [];
                      const containerId = `${CONTAINER_RENOVATION_PREFIX}${stage}`;

                      return (
                        <div key={stage} className="space-y-1">
                          <div className="text-xs font-medium text-[#707785] px-1 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]"></span>
                            {stageConfig.label} ({stagePhotos.length})
                          </div>
                          <SortableContext
                            items={getRenovationStageIds(stage)}
                            strategy={verticalListSortingStrategy}
                          >
                            <DroppableStage
                              id={containerId}
                              isEmpty={stagePhotos.length === 0}
                              isActive={true}
                            >
                              {stagePhotos.length === 0 && (
                                <div className="text-center text-xs text-[#22c55e]/60">
                                  拖拽到此处
                                </div>
                              )}
                              {stagePhotos.map((photo, index) => (
                                <SortablePhotoItem
                                  key={photo.id}
                                  photo={photo}
                                  index={index}
                                  onDelete={handleDeletePhoto}
                                />
                              ))}
                            </DroppableStage>
                          </SortableContext>
                        </div>
                      );
                    })
                  ) : (
                    // 平常模式：只显示有照片的阶段，但按 RENOVATION_STAGES 顺序
                    RENOVATION_STAGES.map((stageConfig) => {
                      const stage = stageConfig.value;
                      const stagePhotos = renovationPhotosByStage[stage] || [];
                      // 只渲染有照片的阶段
                      if (stagePhotos.length === 0) return null;

                      const containerId = `${CONTAINER_RENOVATION_PREFIX}${stage}`;

                      return (
                        <div key={stage} className="space-y-1">
                          <div className="text-xs font-medium text-[#707785] px-1 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]"></span>
                            {stageConfig.label} ({stagePhotos.length})
                          </div>
                          <SortableContext
                            items={getRenovationStageIds(stage)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div
                              id={containerId}
                              className="space-y-2 min-h-[40px] p-1 rounded border border-dashed border-[#c0c7d6]/30 hover:border-[#22c55e]/50 transition-colors"
                            >
                              {stagePhotos.map((photo, index) => (
                                <SortablePhotoItem
                                  key={photo.id}
                                  photo={photo}
                                  index={index}
                                  onDelete={handleDeletePhoto}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* 拖拽时的浮动预览 */}
            <DragOverlay>
              {activePhoto ? (
                <PhotoDragOverlay photo={activePhoto} />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </section>

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
