"use client";

import { useState, useMemo, useCallback, memo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { FilterBar } from "./filter-bar";
import { VirtualizedPhotoGrid } from "./virtualized-photo-grid";
import { PickerFooter } from "./picker-footer";
import { toast } from "sonner";
import type { StageOption } from "./types";
import type { L4MarketingMedia } from "../../types";
import { usePhotoLibrary } from "./use-photo-library";

interface PhotoLibraryPickerProps {
  l3ProjectId: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextSortOrderStart: number;
  onPhotosAdded: (photos: L4MarketingMedia[]) => void;
  existingPhotoUrls: Set<string>;
}

export const PhotoLibraryPicker = memo(function PhotoLibraryPicker({
  l3ProjectId,
  open,
  onOpenChange,
  onPhotosAdded,
  existingPhotoUrls,
}: PhotoLibraryPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStage, setActiveStage] = useState<StageOption>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const { photos, loading, isVisible, logMetric, metrics } = usePhotoLibrary({
    l3ProjectId,
    open,
  });

  const handleOpenChange = useCallback(async (newOpen: boolean) => {
    if (!newOpen) {
      console.log("[PhotoLibraryPicker] 性能报告:", metrics);
    }
    onOpenChange(newOpen);
  }, [onOpenChange, metrics]);

  const filteredPhotos = useMemo(() => {
    if (!searchQuery && activeStage === "all") {
      return photos;
    }
    return photos.filter((photo) => {
      const matchesStage = activeStage === "all" || photo.stage === activeStage;
      const matchesSearch =
        !searchQuery ||
        photo.id.toString().includes(searchQuery) ||
        (photo.description || "").toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStage && matchesSearch;
    });
  }, [photos, activeStage, searchQuery]);

  const togglePhoto = useCallback((photoId: number | string) => {
    setSelectedIds((prev) => {
      const newSelected = new Set(prev);
      if (newSelected.has(photoId)) {
        newSelected.delete(photoId);
      } else {
        newSelected.add(photoId);
      }
      return newSelected;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filteredPhotos.length) {
        return new Set();
      } else {
        return new Set(filteredPhotos.map((p) => p.id));
      }
    });
  }, [filteredPhotos]);

  const handleSubmit = useCallback(async () => {
    if (selectedIds.size === 0) {
      toast.error("请至少选择一张照片");
      return;
    }

    setSubmitting(true);
    const submitStartTime = performance.now();

    try {
      toast.success(`成功选择 ${selectedIds.size} 张照片`);
      onPhotosAdded([]);
      onOpenChange(false);
      logMetric("submit", performance.now() - submitStartTime);
    } catch (error) {
      console.error("Exception adding photos:", error);
      toast.error("添加照片失败");
    } finally {
      setSubmitting(false);
    }
  }, [selectedIds, onPhotosAdded, onOpenChange, logMetric]);

  if (!open && !isVisible) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-none max-w-[95vw] w-[1400px] h-[85vh] flex flex-col p-0 gap-0"
        style={{
          animation: "none",
          transition: "none",
        }}
      >
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

        <VirtualizedPhotoGrid
          photos={filteredPhotos}
          loading={loading}
          existingPhotoUrls={existingPhotoUrls}
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
});
