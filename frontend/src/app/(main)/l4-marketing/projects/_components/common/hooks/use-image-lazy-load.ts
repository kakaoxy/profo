"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// 图片加载状态
export type ImageLoadStatus = "idle" | "loading" | "loaded" | "error";

// 懒加载配置选项
export interface LazyLoadOptions {
  /** 根边距，提前多少像素开始加载 */
  rootMargin?: string;
  /** 交叉阈值 */
  threshold?: number;
  /** 加载超时时间（毫秒） */
  timeout?: number;
}

// 图片加载结果
export interface ImageLoadResult {
  /** 加载状态 */
  status: ImageLoadStatus;
  /** 加载耗时（毫秒） */
  loadTime: number;
  /** 是否可见（已进入视口） */
  isVisible: boolean;
}

/**
 * 统一的图片懒加载 Hook
 * 合并了 useLazyLoad 和 useImageLoader 的功能
 * 特性：
 * 1. 使用 Intersection Observer 检测视口
 * 2. 支持加载超时处理
 * 3. 追踪加载时间
 * 4. 自动清理资源
 */
export function useImageLazyLoad(
  src: string | undefined | null,
  options: LazyLoadOptions = {}
): ImageLoadResult {
  const {
    rootMargin = "100px",
    threshold = 0.1,
    timeout = 10000,
  } = options;

  const [status, setStatus] = useState<ImageLoadStatus>("idle");
  const [loadTime, setLoadTime] = useState<number>(0);
  const [isVisible, setIsVisible] = useState<boolean>(false);

  // 使用 ref 跟踪加载是否已完成，避免超时后覆盖成功状态
  const isCompleteRef = useRef(false);
  const startTimeRef = useRef<number>(0);

  // Intersection Observer 检测视口
  useEffect(() => {
    // 如果没有 src，直接返回
    if (!src) {
      setStatus("idle");
      return;
    }

    // 如果已经可见，不需要再监听
    if (isVisible) return;

    // 创建一个占位元素来监听
    const element = document.createElement("div");
    element.style.position = "absolute";
    element.style.visibility = "hidden";
    document.body.appendChild(element);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        rootMargin,
        threshold,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
      document.body.removeChild(element);
    };
  }, [src, isVisible, rootMargin, threshold]);

  // 图片加载逻辑
  useEffect(() => {
    if (!src || !isVisible) {
      setStatus("idle");
      return;
    }

    // 重置完成标记
    isCompleteRef.current = false;
    setStatus("loading");
    startTimeRef.current = performance.now();

    const img = new Image();
    img.src = src;

    img.onload = () => {
      isCompleteRef.current = true;
      setStatus("loaded");
      setLoadTime(Math.round(performance.now() - startTimeRef.current));
    };

    img.onerror = () => {
      isCompleteRef.current = true;
      setStatus("error");
    };

    // 超时处理
    const timeoutId = setTimeout(() => {
      if (!isCompleteRef.current) {
        setStatus("error");
      }
    }, timeout);

    return () => {
      clearTimeout(timeoutId);
      img.onload = null;
      img.onerror = null;
    };
  }, [src, isVisible, timeout]);

  return { status, loadTime, isVisible };
}

/**
 * 用于元素级别的视口检测 Hook
 * 返回 ref 和 isVisible 状态
 */
export function useElementVisibility<T extends HTMLElement>(
  options: Omit<LazyLoadOptions, "timeout"> = {}
): { ref: React.RefObject<T | null>; isVisible: boolean } {
  const { rootMargin = "100px", threshold = 0.1 } = options;
  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        rootMargin,
        threshold,
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  return { ref, isVisible };
}

/**
 * 简化的图片懒加载 Hook（仅返回加载状态）
 * 适用于不需要视口检测的场景
 */
export function useSimpleImageLoader(
  src: string | undefined | null,
  timeout: number = 10000
): Omit<ImageLoadResult, "isVisible"> {
  const [status, setStatus] = useState<ImageLoadStatus>("idle");
  const [loadTime, setLoadTime] = useState<number>(0);
  const isCompleteRef = useRef(false);

  useEffect(() => {
    if (!src) {
      setStatus("idle");
      return;
    }

    isCompleteRef.current = false;
    setStatus("loading");
    const startTime = performance.now();

    const img = new Image();
    img.src = src;

    img.onload = () => {
      isCompleteRef.current = true;
      setStatus("loaded");
      setLoadTime(Math.round(performance.now() - startTime));
    };

    img.onerror = () => {
      isCompleteRef.current = true;
      setStatus("error");
    };

    const timeoutId = setTimeout(() => {
      if (!isCompleteRef.current) {
        setStatus("error");
      }
    }, timeout);

    return () => {
      clearTimeout(timeoutId);
      img.onload = null;
      img.onerror = null;
    };
  }, [src, timeout]);

  return { status, loadTime };
}
