"use client";

import { useEffect, useRef, useCallback, useState } from "react";

// 性能指标接口
interface PerformanceMetrics {
  // 加载时间
  loadTime: number;
  // 首屏时间
  fcp: number;
  // 最大内容绘制
  lcp: number;
  // 累积布局偏移
  cls: number;
  // 帧率
  fps: number;
  // 内存使用 (MB)
  memory?: number;
}

// 性能监控配置
interface PerformanceMonitorOptions {
  // 是否启用 FPS 监控
  enableFPS?: boolean;
  // FPS 采样间隔 (ms)
  fpsSampleInterval?: number;
  // 是否记录到控制台
  logToConsole?: boolean;
  // 性能阈值警告
  thresholds?: {
    loadTime?: number;
    fcp?: number;
    lcp?: number;
    cls?: number;
    fps?: number;
  };
}

// 性能监控 Hook
export function usePerformanceMonitor(
  componentName: string,
  options: PerformanceMonitorOptions = {}
) {
  const {
    enableFPS = true,
    fpsSampleInterval = 1000,
    logToConsole = process.env.NODE_ENV === "development",
    thresholds = {
      loadTime: 1000,
      fcp: 1800,
      lcp: 2500,
      cls: 0.1,
      fps: 30,
    },
  } = options;

  // 使用 ref 存储配置，避免依赖变化导致重渲染
  const configRef = useRef({ componentName, logToConsole, thresholds });
  configRef.current = { componentName, logToConsole, thresholds };

  const metricsRef = useRef<Partial<PerformanceMetrics>>({});
  const fpsRef = useRef({ frames: 0, lastTime: performance.now() });
  const rafIdRef = useRef<number | null>(null);
  const [metrics, setMetrics] = useState<Partial<PerformanceMetrics>>({});
  // 标记是否已初始化，避免重复执行
  const initializedRef = useRef(false);

  // 记录性能指标 - 使用 ref 获取最新配置，避免依赖问题
  const logMetric = useCallback(
    (name: string, value: number, unit: string = "ms") => {
      const { thresholds, logToConsole, componentName } = configRef.current;
      const threshold = thresholds[name as keyof typeof thresholds];
      const isWarning = threshold !== undefined && value > threshold;

      if (logToConsole) {
        const style = isWarning
          ? "color: #ef4444; font-weight: bold;"
          : "color: #22c55e;";
        console.log(
          `%c[Performance] ${componentName} - ${name}: ${value.toFixed(2)}${unit}`,
          style
        );
      }

      // 如果超过阈值，可以发送给监控系统
      if (isWarning && typeof window !== "undefined") {
        if (window.performance && "mark" in window.performance) {
          performance.mark(`${componentName}-${name}-warning`);
        }
      }
    },
    [] // 无依赖，使用 ref 获取最新值
  );

  // FPS 监控
  const measureFPS = useCallback(() => {
    const now = performance.now();
    fpsRef.current.frames++;

    if (now - fpsRef.current.lastTime >= fpsSampleInterval) {
      const fps = Math.round(
        (fpsRef.current.frames * 1000) / (now - fpsRef.current.lastTime)
      );
      fpsRef.current = { frames: 0, lastTime: now };

      metricsRef.current.fps = fps;
      logMetric("fps", fps, "");

      // 低帧率警告
      const { thresholds, componentName } = configRef.current;
      if (fps < (thresholds.fps || 30)) {
        console.warn(
          `[Performance] ${componentName} - Low FPS detected: ${fps}`
        );
      }

      setMetrics((prev) => ({ ...prev, fps }));
    }

    rafIdRef.current = requestAnimationFrame(measureFPS);
  }, [fpsSampleInterval, logMetric]);

  // 测量加载性能 - 只在组件挂载时执行一次
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (initializedRef.current) return;
    initializedRef.current = true;

    // 等待页面完全加载
    const measureLoadPerformance = () => {
      const navigation = performance.getEntriesByType(
        "navigation"
      )[0] as PerformanceNavigationTiming;

      if (navigation) {
        const loadTime = navigation.loadEventEnd - navigation.startTime;
        metricsRef.current.loadTime = loadTime;
        logMetric("loadTime", loadTime);
      }

      // 获取 FCP
      const paintEntries = performance.getEntriesByType("paint");
      const fcpEntry = paintEntries.find((entry) => entry.name === "first-contentful-paint");
      if (fcpEntry) {
        metricsRef.current.fcp = fcpEntry.startTime;
        logMetric("fcp", fcpEntry.startTime);
      }

      // 获取 LCP
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        metricsRef.current.lcp = lastEntry.startTime;
        logMetric("lcp", lastEntry.startTime);
      });

      try {
        lcpObserver.observe({ entryTypes: ["largest-contentful-paint"] });
      } catch {
        // 浏览器不支持
      }

      // 获取 CLS
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
          }
        }
        metricsRef.current.cls = clsValue;
        logMetric("cls", clsValue, "");
      });

      try {
        clsObserver.observe({ entryTypes: ["layout-shift"] });
      } catch {
        // 浏览器不支持
      }

      // 获取内存使用
      if ("memory" in performance) {
        const memory = (performance as any).memory;
        if (memory) {
          const usedMB = Math.round(memory.usedJSHeapSize / 1048576);
          metricsRef.current.memory = usedMB;
          if (configRef.current.logToConsole) {
            console.log(
              `%c[Performance] ${configRef.current.componentName} - Memory: ${usedMB}MB`,
              "color: #3b82f6;"
            );
          }
        }
      }

      setMetrics({ ...metricsRef.current });
    };

    // 延迟执行以确保数据可用
    if (document.readyState === "complete") {
      measureLoadPerformance();
    } else {
      window.addEventListener("load", measureLoadPerformance);
      return () => window.removeEventListener("load", measureLoadPerformance);
    }
  }, []); // 空依赖数组，只在挂载时执行

  // 启动 FPS 监控
  useEffect(() => {
    if (!enableFPS) return;

    rafIdRef.current = requestAnimationFrame(measureFPS);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [enableFPS, measureFPS]);

  // 测量渲染时间
  const measureRenderTime = useCallback(
    <T extends (...args: any[]) => any>(fn: T, ...args: Parameters<T>): ReturnType<T> => {
      const start = performance.now();
      const result = fn(...args);
      const duration = performance.now() - start;

      if (duration > 16) {
        console.warn(
          `[Performance] ${configRef.current.componentName} - Slow render: ${duration.toFixed(2)}ms`
        );
      }

      return result;
    },
    []
  );

  return {
    metrics,
    measureRenderTime,
    logMetric,
  };
}

// 图片加载性能监控 Hook
export function useImagePerformanceMonitor(imageId: string) {
  const [loadTime, setLoadTime] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const startTimeRef = useRef<number>(0);

  const onLoadStart = useCallback(() => {
    startTimeRef.current = performance.now();
    setStatus("loading");
  }, []);

  const onLoad = useCallback(() => {
    const duration = performance.now() - startTimeRef.current;
    setLoadTime(duration);
    setStatus("loaded");

    if (process.env.NODE_ENV === "development" && duration > 500) {
      console.warn(
        `[Performance] Image ${imageId} loaded slowly: ${duration.toFixed(2)}ms`
      );
    }
  }, [imageId]);

  const onError = useCallback(() => {
    setStatus("error");
    console.error(`[Performance] Image ${imageId} failed to load`);
  }, [imageId]);

  return {
    loadTime,
    status,
    onLoadStart,
    onLoad,
    onError,
  };
}

// 虚拟列表性能监控
export function useVirtualListMonitor(listName: string) {
  const renderCountRef = useRef(0);
  const itemRenderTimesRef = useRef<Map<string, number>>(new Map());
  const listNameRef = useRef(listName);
  listNameRef.current = listName;

  const recordItemRender = useCallback((itemId: string, duration: number) => {
    itemRenderTimesRef.current.set(itemId, duration);

    if (process.env.NODE_ENV === "development" && duration > 8) {
      console.warn(
        `[Performance] ${listNameRef.current} - Slow item render ${itemId}: ${duration.toFixed(2)}ms`
      );
    }
  }, []);

  const recordListRender = useCallback(() => {
    renderCountRef.current++;

    if (process.env.NODE_ENV === "development" && renderCountRef.current % 10 === 0) {
      const avgRenderTime =
        Array.from(itemRenderTimesRef.current.values()).reduce((a, b) => a + b, 0) /
        itemRenderTimesRef.current.size;
      console.log(
        `[Performance] ${listNameRef.current} - Render #${renderCountRef.current}, Avg item time: ${avgRenderTime.toFixed(2)}ms`
      );
    }
  }, []);

  return {
    recordItemRender,
    recordListRender,
    getRenderCount: () => renderCountRef.current,
  };
}

// 性能报告组件
interface PerformanceReportProps {
  componentName: string;
  metrics: Partial<PerformanceMetrics>;
  visible?: boolean;
}

export function PerformanceReport({
  componentName,
  metrics,
  visible = process.env.NODE_ENV === "development",
}: PerformanceReportProps) {
  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-slate-900 text-white p-4 rounded-lg shadow-lg text-xs font-mono z-50 max-w-xs">
      <div className="font-bold mb-2 text-emerald-400">{componentName} Performance</div>
      <div className="space-y-1">
        {metrics.loadTime !== undefined && (
          <div className="flex justify-between">
            <span>Load Time:</span>
            <span className={metrics.loadTime > 1000 ? "text-red-400" : "text-green-400"}>
              {metrics.loadTime.toFixed(0)}ms
            </span>
          </div>
        )}
        {metrics.fcp !== undefined && (
          <div className="flex justify-between">
            <span>FCP:</span>
            <span className={metrics.fcp > 1800 ? "text-red-400" : "text-green-400"}>
              {metrics.fcp.toFixed(0)}ms
            </span>
          </div>
        )}
        {metrics.lcp !== undefined && (
          <div className="flex justify-between">
            <span>LCP:</span>
            <span className={metrics.lcp > 2500 ? "text-red-400" : "text-green-400"}>
              {metrics.lcp.toFixed(0)}ms
            </span>
          </div>
        )}
        {metrics.cls !== undefined && (
          <div className="flex justify-between">
            <span>CLS:</span>
            <span className={metrics.cls > 0.1 ? "text-red-400" : "text-green-400"}>
              {metrics.cls.toFixed(3)}
            </span>
          </div>
        )}
        {metrics.fps !== undefined && (
          <div className="flex justify-between">
            <span>FPS:</span>
            <span className={metrics.fps < 30 ? "text-red-400" : "text-green-400"}>
              {metrics.fps}
            </span>
          </div>
        )}
        {metrics.memory !== undefined && (
          <div className="flex justify-between">
            <span>Memory:</span>
            <span className="text-blue-400">{metrics.memory}MB</span>
          </div>
        )}
      </div>
    </div>
  );
}
