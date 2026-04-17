"use client";

// 从 common/hooks 重新导出性能监控相关功能
// 保持向后兼容的同时使用统一的实现
export {
  usePerformanceMonitor,
  useImagePerformanceMonitor,
  useVirtualListMonitor,
} from "../common/hooks/use-performance-monitor";

// 从 common/components 导出 PerformanceReport 组件
export { PerformanceReport } from "../common/components";

// 为了向后兼容，保留原有类型定义
export type {
  PerformanceMetrics,
  PerformanceMonitorOptions,
} from "../common/hooks/use-performance-monitor";
