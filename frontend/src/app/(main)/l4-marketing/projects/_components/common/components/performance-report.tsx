"use client";

import type { PerformanceMetrics } from "../hooks";

// 性能报告组件 Props
interface PerformanceReportProps {
  componentName: string;
  metrics: Partial<PerformanceMetrics>;
  visible?: boolean;
}

// 性能报告组件
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
