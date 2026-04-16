"use client";

import { useState, useMemo } from "react";
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

interface PhotoLibraryPickerProps {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextSortOrderStart: number;
  onPhotosAdded: (photos: L4MarketingMedia[]) => void;
  existingPhotoIds: Set<number>;
}

export function PhotoLibraryPicker({
  projectId,
  open,
  onOpenChange,
  onPhotosAdded,
  existingPhotoIds,
}: PhotoLibraryPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStage, setActiveStage] = useState<StageOption>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Mock photos for now - in real implementation this would fetch from API
  const photos: RenovationPhoto[] = [];
  const loading = false;

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

  const togglePhoto = (photoId: number) => {
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
