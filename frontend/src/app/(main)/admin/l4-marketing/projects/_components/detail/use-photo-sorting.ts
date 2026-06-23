"use client";

import { useState, useMemo, useCallback } from "react";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { toast } from "sonner";
import type { L4MarketingMedia } from "@/app/(main)/admin/l4-marketing/projects/types";
import {
  deleteL4MarketingMediaAction,
  updateL4MarketingMediaAction,
  batchUpdateMediaSortOrderAction,
} from "../../actions";

const CONTAINER_MARKETING = "marketing";
const CONTAINER_RENOVATION_PREFIX = "renovation-";

interface UsePhotoSortingProps {
  projectId: number | string;
  initialPhotos: L4MarketingMedia[];
}

interface UsePhotoSortingReturn {
  photos: L4MarketingMedia[];
  setPhotos: React.Dispatch<React.SetStateAction<L4MarketingMedia[]>>;
  activeId: number | null;
  marketingPhotos: L4MarketingMedia[];
  renovationPhotos: L4MarketingMedia[];
  renovationPhotosByStage: Record<string, L4MarketingMedia[]>;
  marketingPhotoIds: number[];
  getRenovationStageIds: (stage: string) => number[];
  activePhoto: L4MarketingMedia | null;
  handleDragStart: (event: DragStartEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  handleDeletePhoto: (photoId: number) => Promise<void>;
  handlePhotosAdded: (addedPhotos: L4MarketingMedia[]) => void;
}

export function usePhotoSorting({ projectId, initialPhotos }: UsePhotoSortingProps): UsePhotoSortingReturn {
  const [photos, setPhotos] = useState<L4MarketingMedia[]>(initialPhotos);
  const [activeId, setActiveId] = useState<number | null>(null);

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
    () => marketingPhotos.map((p) => Number(p.id)),
    [marketingPhotos]
  );

  const getRenovationStageIds = useCallback(
    (stage: string) => {
      return (renovationPhotosByStage[stage] || []).map((p) => Number(p.id));
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

      // 拖拽到同一位置时不处理，避免不必要的 API 调用和状态更新
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const reordered = arrayMove(currentList, oldIndex, newIndex);

      // 优化：只更新排序顺序实际发生变化的照片
      const startIndex = Math.min(oldIndex, newIndex);
      const endIndex = Math.max(oldIndex, newIndex);

      // 只生成受影响范围内的照片更新数据
      const sortUpdates = reordered
        .slice(startIndex, endIndex + 1)
        .map((p, idx) => ({
          media_id: Number(p.id),
          sort_order: startIndex + idx,
        }));

      const newPhotos = photos.map((p) => {
        const updated = reordered.find((u) => u.id === p.id);
        return updated || p;
      });

      setPhotos(newPhotos);

      const result = await batchUpdateMediaSortOrderAction(Number(projectId), sortUpdates);
      if (!result.success) {
        toast.error("保存排序失败");
        // 失败时回滚本地状态，使用函数式更新避免闭包引用过时状态
        setPhotos((prev) => prev.map((p) => {
          const original = photos.find((orig) => orig.id === p.id);
          return original !== undefined ? original : p;
        }));
      }
    },
    [marketingPhotos, renovationPhotos, photos, projectId]
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
        Number(activePhoto.id),
        Number(projectId),
        {
          photo_category: updatedPhoto.photo_category,
          renovation_stage: updatedPhoto.renovation_stage,
          sort_order: newSortOrder,
        }
      );

      if (updateResult.success && updateResult.data) {
        // 使用API返回的完整数据更新本地状态，确保数据一致性
        const updatedPhotoFromAPI = updateResult.data as L4MarketingMedia;
        const newPhotosWithAPIUpdate = photos.map((p) =>
          p.id === updatedPhotoFromAPI.id ? updatedPhotoFromAPI : p
        );
        setPhotos(newPhotosWithAPIUpdate);
        toast.success(
          `已移动到${isMovingToMarketing ? "营销照片" : targetStage + "阶段"}`
        );
      } else {
        toast.error("移动失败");
        setPhotos(photos);
      }
    },
    [marketingPhotos, renovationPhotos, photos, projectId]
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
        const result = await deleteL4MarketingMediaAction(photoId, Number(projectId));
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
    [photos, projectId]
  );

  const handlePhotosAdded = useCallback(
    (addedPhotos: L4MarketingMedia[]) => {
      setPhotos((prev) => [...prev, ...addedPhotos]);
      toast.success(`成功添加 ${addedPhotos.length} 张照片`);
    },
    []
  );

  return {
    photos,
    setPhotos,
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
  };
}
