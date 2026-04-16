"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { FilterBar } from "./filter-bar";
import { PhotoGrid } from "./photo-grid";
import { PickerFooter } from "./picker-footer";
import { toast } from "sonner";
import type { RenovationPhoto } from "./types";
import type { StageOption } from "./types";
import type { L4MarketingMedia } from "../../types";
import { getRenovationPhotosAction } from "@/app/(main)/projects/actions/renovation";

interface PhotoLibraryPickerProps {
  l3ProjectId: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextSortOrderStart: number;
  onPhotosAdded: (photos: L4MarketingMedia[]) => void;
  existingPhotoIds: Set<number>;
}

export function PhotoLibraryPicker({
  l3ProjectId,
  open,
  onOpenChange,
  onPhotosAdded,
  existingPhotoIds,
}: PhotoLibraryPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStage, setActiveStage] = useState<StageOption>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [photos, setPhotos] = useState<RenovationPhoto[]>([]);
  const [loading, setLoading] = useState(false);

  // 获取装修照片列表
  const fetchPhotos = useCallback(async () => {
    if (!l3ProjectId) return;

    setLoading(true);
    try {
      const result = await getRenovationPhotosAction(l3ProjectId);
      if (result.success && result.data) {
        // 转换后端返回的数据格式为 RenovationPhoto 格式
        const formattedPhotos: RenovationPhoto[] = result.data.map((photo: unknown) => {
          const p = photo as Record<string, unknown>;
          return {
            id: p.id ? String(p.id) : String(-Date.now()),
            project_id: String(p.project_id),
            stage: String(p.stage || ""),
            url: String(p.url || ""),
            filename: p.filename ? String(p.filename) : null,
            description: p.description ? String(p.description) : null,
            created_at: String(p.created_at || ""),
          };
        });
        setPhotos(formattedPhotos);
      } else {
        toast.error(result.message || "获取照片失败");
        setPhotos([]);
      }
    } catch (error) {
      console.error("获取照片异常:", error);
      toast.error("获取照片失败");
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [l3ProjectId]);

  // 当弹窗打开时获取照片
  useEffect(() => {
    if (open) {
      fetchPhotos();
    }
  }, [open, fetchPhotos]);

  const handleOpenChange = async (newOpen: boolean) => {
    if (newOpen) {
      setSelectedIds(new Set());
      setSearchQuery("");
      setActiveStage("all");
    }
    onOpenChange(newOpen);
  };

  const filteredPhotos = useMemo(() => {
    return photos.filter((photo) => {
      const matchesStage = activeStage === "all" || photo.stage === activeStage;
      const matchesSearch =
        !searchQuery ||
        photo.id.toString().includes(searchQuery) ||
        (photo.description || "")
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
      return matchesStage && matchesSearch;
    });
  }, [photos, activeStage, searchQuery]);

  const togglePhoto = (photoId: number | string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(photoId)) {
      newSelected.delete(photoId);
    } else {
      newSelected.add(photoId);
    }
    setSelectedIds(newSelected);
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredPhotos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPhotos.map((p) => p.id)));
    }
  };

  const handleSubmit = async () => {
    if (selectedIds.size === 0) {
      toast.error("请至少选择一张照片");
      return;
    }

    setSubmitting(true);
    try {
      // Mock implementation - in real scenario this would call API
      toast.success(`成功选择 ${selectedIds.size} 张照片`);
      onPhotosAdded([]);
      onOpenChange(false);
    } catch (error) {
      console.error("Exception adding photos:", error);
      toast.error("添加照片失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[1200px] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-bold">
                从照片库选择
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                选择照片添加到当前项目
              </p>
            </div>
          </div>
        </DialogHeader>

        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeStage={activeStage}
          onStageChange={setActiveStage}
          selectedCount={selectedIds.size}
          totalCount={filteredPhotos.length}
          onToggleAll={toggleAll}
        />

        <PhotoGrid
          photos={filteredPhotos}
          loading={loading}
          existingPhotoIds={existingPhotoIds}
          selectedIds={selectedIds}
          onTogglePhoto={togglePhoto}
        />

        <DialogFooter className="p-6 pt-4 border-t border-border">
          <PickerFooter
            selectedCount={selectedIds.size}
            submitting={submitting}
            onCancel={() => onOpenChange(false)}
            onSubmit={handleSubmit}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
