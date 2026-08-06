"use client";

import { logger } from "@/lib/logger";
import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import type { RenovationPhoto } from "./types";
import { getRenovationPhotosAction } from "@/app/(main)/admin/projects/actions/renovation";
import { usePerformanceMonitor } from "../common/hooks";

// 性能监控配置
const PERFORMANCE_CONFIG = {
  targetOpenTime: 300,
  warningThreshold: 500,
};

interface UsePhotoLibraryProps {
  l3ProjectId: string | null | undefined;
  open: boolean;
}

interface UsePhotoLibraryReturn {
  photos: RenovationPhoto[];
  loading: boolean;
  isVisible: boolean;
  fetchPhotos: () => Promise<void>;
  setIsVisible: (visible: boolean) => void;
  setPhotos: (photos: RenovationPhoto[]) => void;
  setLoading: (loading: boolean) => void;
  logMetric: (name: string, value: number) => void;
  metrics: Record<string, number>;
  checkPerformance: (openTime: number) => void;
}

export function usePhotoLibrary({ l3ProjectId, open }: UsePhotoLibraryProps): UsePhotoLibraryReturn {
  const [photos, setPhotos] = useState<RenovationPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const openStartTimeRef = useRef<number>(0);
  const idleHandleRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { logMetric, metrics } = usePerformanceMonitor("photo-library-picker", {
    enableFPS: false,
    logToConsole: process.env.NODE_ENV === "development",
  });

  const checkPerformance = useCallback((openTime: number) => {
    if (openTime > PERFORMANCE_CONFIG.warningThreshold) {
      logger.warn(
        `[PhotoLibraryPicker] 弹窗打开时间过长: ${openTime.toFixed(2)}ms, 目标: ${PERFORMANCE_CONFIG.targetOpenTime}ms`
      );
    }
  }, []);

  const fetchPhotos = useCallback(async () => {
    if (!l3ProjectId) return;

    const loadData = async () => {
      idleHandleRef.current = null;
      timerRef.current = null;
      setLoading(true);
      const fetchStartTime = performance.now();

      try {
        const result = await getRenovationPhotosAction(l3ProjectId);
        const fetchEndTime = performance.now();

        if (result.success && result.data) {
          const formattedPhotos: RenovationPhoto[] = result.data.map((photo: unknown) => {
            const p = photo as Record<string, unknown>;
            return {
              id: p.id ? String(p.id) : String(-Date.now()),
              project_id: String(p.project_id),
              stage: String(p.stage || ""),
              url: String(p.url || ""),
              thumbnail_url: p.thumbnail_url ? String(p.thumbnail_url) : null,
              filename: p.filename ? String(p.filename) : null,
              description: p.description ? String(p.description) : null,
              created_at: String(p.created_at || ""),
            };
          });
          setPhotos(formattedPhotos);
          logMetric("data_fetch", fetchEndTime - fetchStartTime);
          logMetric("data_process", performance.now() - fetchEndTime);
        } else {
          toast.error(result.message || "获取照片失败");
          setPhotos([]);
        }
      } catch (error) {
        logger.error("获取照片异常:", error);
        toast.error("获取照片失败");
        setPhotos([]);
      } finally {
        setLoading(false);
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleHandleRef.current = window.requestIdleCallback(loadData, { timeout: 200 });
    } else if (typeof window !== "undefined") {
      timerRef.current = setTimeout(loadData, 50);
    } else {
      // SSR 安全 fallback:直接执行
      void loadData();
    }
  }, [l3ProjectId, logMetric]);

  // 卸载时取消待执行的 idle callback / setTimeout,避免 setPhotos/setLoading 触发警告
  useEffect(() => {
    return () => {
      if (
        idleHandleRef.current != null &&
        typeof window !== "undefined" &&
        "cancelIdleCallback" in window
      ) {
        window.cancelIdleCallback(idleHandleRef.current);
        idleHandleRef.current = null;
      }
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (open) {
      openStartTimeRef.current = performance.now();
      setIsVisible(true);
      fetchPhotos();
    } else {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setPhotos([]);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open, fetchPhotos]);

  useEffect(() => {
    if (open && isVisible) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const openTime = performance.now() - openStartTimeRef.current;
          logMetric("dialog_open", openTime);
          checkPerformance(openTime);
        });
      });
    }
  }, [open, isVisible, logMetric, checkPerformance]);

  return {
    photos,
    loading,
    isVisible,
    fetchPhotos,
    setIsVisible,
    setPhotos,
    setLoading,
    logMetric,
    metrics,
    checkPerformance,
  };
}
