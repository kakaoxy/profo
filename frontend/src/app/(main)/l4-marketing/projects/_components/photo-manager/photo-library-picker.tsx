"use client";

import { useState, useMemo, useEffect, useCallback, useRef, memo } from "react";
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
import type { RenovationPhoto } from "./types";
import type { StageOption } from "./types";
import type { L4MarketingMedia } from "../../types";
import { getRenovationPhotosAction } from "@/app/(main)/projects/actions/renovation";
import { usePerformanceMonitor } from "../common/hooks";

interface PhotoLibraryPickerProps {
  l3ProjectId: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextSortOrderStart: number;
  onPhotosAdded: (photos: L4MarketingMedia[]) => void;
  existingPhotoUrls: Set<string>;
}

// 性能监控配置
const PERFORMANCE_CONFIG = {
  targetOpenTime: 300, // 目标打开时间300ms
  warningThreshold: 500, // 警告阈值500ms
};

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
  const [photos, setPhotos] = useState<RenovationPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const openStartTimeRef = useRef<number>(0);
  const { logMetric, metrics } = usePerformanceMonitor("photo-library-picker", {
    enableFPS: false,
    logToConsole: process.env.NODE_ENV === "development",
  });

  // 延迟加载数据，优先保证弹窗打开响应
  const fetchPhotos = useCallback(async () => {
    if (!l3ProjectId) return;

    // 使用requestIdleCallback延迟非关键数据加载
    const loadData = async () => {
      setLoading(true);
      const fetchStartTime = performance.now();

      try {
        const result = await getRenovationPhotosAction(l3ProjectId);
        const fetchEndTime = performance.now();

        if (result.success && result.data) {
          // 使用requestIdleCallback处理数据转换，避免阻塞主线程
          const processData = () => {
            const formattedPhotos: RenovationPhoto[] = result.data!.map((photo: unknown) => {
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

            // 记录数据获取性能
            logMetric("data_fetch", fetchEndTime - fetchStartTime);
            logMetric("data_process", performance.now() - fetchEndTime);
          };

          if (typeof window !== "undefined" && "requestIdleCallback" in window) {
            window.requestIdleCallback(processData, { timeout: 100 });
          } else {
            setTimeout(processData, 0);
          }
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
    };

    // 延迟数据加载，优先保证UI响应
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      window.requestIdleCallback(loadData, { timeout: 200 });
    } else {
      setTimeout(loadData, 50);
    }
  }, [l3ProjectId, logMetric]);

  // 弹窗打开时记录开始时间并延迟加载数据
  useEffect(() => {
    if (open) {
      openStartTimeRef.current = performance.now();
      setIsVisible(true);
      fetchPhotos();
    } else {
      // 延迟重置状态，等待动画完成
      const timer = setTimeout(() => {
        setIsVisible(false);
        setPhotos([]);
        setSelectedIds(new Set());
        setSearchQuery("");
        setActiveStage("all");
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open, fetchPhotos]);

  // 弹窗内容渲染完成后记录打开时间
  useEffect(() => {
    if (open && isVisible) {
      // 使用requestAnimationFrame确保在渲染完成后记录
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const openTime = performance.now() - openStartTimeRef.current;
          logMetric("dialog_open", openTime);

          // 性能警告
          if (openTime > PERFORMANCE_CONFIG.warningThreshold) {
            console.warn(
              `[PhotoLibraryPicker] 弹窗打开时间过长: ${openTime.toFixed(2)}ms, 目标: ${PERFORMANCE_CONFIG.targetOpenTime}ms`
            );
          }
        });
      });
    }
  }, [open, isVisible, logMetric]);

  const handleOpenChange = useCallback(async (newOpen: boolean) => {
    if (!newOpen) {
      // 打印性能报告
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
        (photo.description || "")
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
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

  // 如果没有打开且不显示，返回null避免不必要的渲染
  if (!open && !isVisible) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-none max-w-[95vw] w-[1400px] h-[85vh] flex flex-col p-0 gap-0"
        // 禁用动画以提升性能
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
