"use client";

import { useState, useMemo, useCallback } from "react";
import {
  DragEndEvent,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { L4MarketingMedia } from "../../types";
import {
  batchUpdateMediaSortOrderAction,
  updateL4MarketingMediaAction,
} from "../../actions";
import { toast } from "sonner";

// 容器ID常量
const CONTAINER_MARKETING = "marketing";
const CONTAINER_RENOVATION_PREFIX = "renovation-";

interface UsePhotoDragAndDropOptions {
  projectId: number;
  photos: L4MarketingMedia[];
  onPhotosChange: (photos: L4MarketingMedia[]) => void;
  marketingPhotos: L4MarketingMedia[];
  renovationPhotos: L4MarketingMedia[];
}

interface UsePhotoDragAndDropReturn {
  activeId: number | null;
  sensors: ReturnType<typeof useSensors>;
  marketingPhotoIds: number[];
  getRenovationStageIds: (stage: string) => number[];
  activePhoto: L4MarketingMedia | null;
  handleDragStart: (event: DragStartEvent) => void;
  handleDragEnd: (event: DragEndEvent) => Promise<void>;
}

export function usePhotoDragAndDrop({
  projectId,
  photos,
  onPhotosChange,
  marketingPhotos,
  renovationPhotos,
}: UsePhotoDragAndDropOptions): UsePhotoDragAndDropReturn {
  const [activeId, setActiveId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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

  // 获取营销照片ID列表
  const marketingPhotoIds = useMemo(() => {
    return marketingPhotos.map((p) => p.id);
  }, [marketingPhotos]);

  // 获取改造照片ID列表（按阶段）
  const getRenovationStageIds = useCallback(
    (stage: string) => {
      return (renovationPhotosByStage[stage] || []).map((p) => p.id);
    },
    [renovationPhotosByStage]
  );

  // 获取正在拖拽的照片
  const activePhoto = useMemo(() => {
    if (!activeId) return null;
    return photos.find((p) => p.id === activeId) || null;
  }, [activeId, photos]);

  // 获取照片所在容器ID
  const getContainerId = useCallback((photo: L4MarketingMedia): string => {
    if (photo.photo_category === "marketing") {
      return CONTAINER_MARKETING;
    }
    return `${CONTAINER_RENOVATION_PREFIX}${photo.renovation_stage || "other"}`;
  }, []);

  // 从overId获取容器ID
  const getContainerIdFromOverId = useCallback(
    (overId: string, allPhotos: L4MarketingMedia[]): string => {
      // 如果是容器ID本身
      if (overId === CONTAINER_MARKETING) return CONTAINER_MARKETING;
      if (overId.startsWith(CONTAINER_RENOVATION_PREFIX)) return overId;

      // 如果是照片ID，查找照片所在容器
      const photo = allPhotos.find((p) => p.id.toString() === overId);
      if (photo) {
        return getContainerId(photo);
      }

      return CONTAINER_MARKETING;
    },
    [getContainerId]
  );

  // 同一容器内排序
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
    },
    [marketingPhotos, renovationPhotos, photos, projectId, onPhotosChange]
  );

  // 跨容器移动
  const handleCrossContainerMove = useCallback(
    async (
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
      const newPhotos = photos.map((p) =>
        p.id === updatedPhoto.id ? updatedPhoto : p
      );
      onPhotosChange(newPhotos);

      // 调用API更新
      const updateResult = await updateL4MarketingMediaAction(
        activePhoto.id,
        {
          photo_category: updatedPhoto.photo_category,
          renovation_stage: updatedPhoto.renovation_stage,
          sort_order: newSortOrder,
        } as any
      );

      if (updateResult.success) {
        toast.success(
          `已移动到${isMovingToMarketing ? "营销照片" : targetStage + "阶段"}`
        );
      } else {
        toast.error("移动失败");
        // 回滚状态
        onPhotosChange(photos);
      }
    },
    [marketingPhotos, renovationPhotos, photos, onPhotosChange]
  );

  // 拖拽开始
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  }, []);

  // 拖拽结束 - 处理跨容器拖拽
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

      // 同一容器内排序
      if (activeContainer === overContainer && active.id !== overId) {
        await handleSameContainerSort(activePhoto, overId as number);
        return;
      }

      // 跨容器拖拽
      if (activeContainer !== overContainer) {
        await handleCrossContainerMove(activePhoto, overContainer, overId as number | string);
      }
    },
    [photos, getContainerId, getContainerIdFromOverId, handleSameContainerSort, handleCrossContainerMove]
  );

  return {
    activeId,
    sensors,
    marketingPhotoIds,
    getRenovationStageIds,
    activePhoto,
    handleDragStart,
    handleDragEnd,
  };
}