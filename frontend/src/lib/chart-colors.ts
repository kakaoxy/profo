import { useSyncExternalStore } from "react";

/**
 * 图表颜色工具函数
 * 用于在客户端运行时读取 CSS 变量，支持暗色模式自动切换
 */

export interface ChartColors {
  positive: string;
  negative: string;
  grid: string;
  gridSubtle: string;
  label: string;
  linePrimary: string;
  lineSecondary: string;
  barBg: string;
  cursor: string;
  white: string;
}

/**
 * 获取默认图表颜色（亮色模式）
 * 用于 SSR 或无法访问 window 的场景
 */
export function getDefaultChartColors(): ChartColors {
  return {
    positive: "#ef4444",
    negative: "#10b981",
    grid: "#e2e8f0",
    gridSubtle: "#f1f5f9",
    label: "#64748b",
    linePrimary: "#6366f1",
    lineSecondary: "#10b981",
    barBg: "#e2e8f0",
    cursor: "#e2e8f0",
    white: "#ffffff",
  };
}

/**
 * 从 CSS 变量读取图表颜色
 * 应在客户端组件中使用（例如 useEffect 或动态导入）
 */
export function getChartColors(): ChartColors {
  if (typeof window === "undefined") {
    return getDefaultChartColors();
  }

  const style = getComputedStyle(document.documentElement);

  return {
    positive: style.getPropertyValue("--chart-positive").trim() || "#ef4444",
    negative: style.getPropertyValue("--chart-negative").trim() || "#10b981",
    grid: style.getPropertyValue("--chart-grid").trim() || "#e2e8f0",
    gridSubtle: style.getPropertyValue("--chart-grid-subtle").trim() || "#f1f5f9",
    label: style.getPropertyValue("--chart-label").trim() || "#64748b",
    linePrimary: style.getPropertyValue("--chart-line-primary").trim() || "#6366f1",
    lineSecondary: style.getPropertyValue("--chart-line-secondary").trim() || "#10b981",
    barBg: style.getPropertyValue("--chart-bar-bg").trim() || "#e2e8f0",
    cursor: style.getPropertyValue("--chart-cursor").trim() || "#e2e8f0",
    white: style.getPropertyValue("--chart-white").trim() || "#ffffff",
  };
}

/**
 * React Hook: 获取图表颜色并监听主题变化
 * 当暗色模式切换时自动更新颜色
 */
export function useChartColors(): ChartColors {
  return useSyncExternalStore(
    // subscribe
    (callback) => {
      const observer = new MutationObserver(callback);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
      return () => observer.disconnect();
    },
    // getSnapshot
    getChartColors,
    // getServerSnapshot (for SSR)
    getDefaultChartColors
  );
}
