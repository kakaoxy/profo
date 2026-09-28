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
    grid: "#e7e9ec",
    gridSubtle: "#eef0f3",
    label: "#777b86",
    linePrimary: "#5d2a1a",
    lineSecondary: "#4a90e2",
    barBg: "#4a90e2",
    cursor: "#e7e9ec",
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
    grid: style.getPropertyValue("--chart-grid").trim() || "#e7e9ec",
    gridSubtle: style.getPropertyValue("--chart-grid-subtle").trim() || "#eef0f3",
    label: style.getPropertyValue("--chart-label").trim() || "#777b86",
    linePrimary: style.getPropertyValue("--chart-line-primary").trim() || "#5d2a1a",
    lineSecondary: style.getPropertyValue("--chart-line-secondary").trim() || "#4a90e2",
    barBg: style.getPropertyValue("--chart-bar-bg").trim() || "#4a90e2",
    cursor: style.getPropertyValue("--chart-cursor").trim() || "#e7e9ec",
    white: style.getPropertyValue("--chart-white").trim() || "#ffffff",
  };
}

/**
 * React Hook: 获取图表颜色并监听主题变化
 * 当暗色模式切换时自动更新颜色
 *
 * 注意：useSyncExternalStore 要求 getSnapshot 在未变化时返回引用相等的值，
 * 否则 React 会陷入无限循环。这里通过模块级缓存 + 主题变更时失效实现。
 */
let cachedChartColors: ChartColors | null = null;

/** 清除缓存的主题颜色快照（主题切换时调用） */
function invalidateChartColorsCache(): void {
  cachedChartColors = null;
}

/** 获取（缓存的）图表颜色快照，供 useSyncExternalStore 使用 */
function getChartColorsSnapshot(): ChartColors {
  if (cachedChartColors) {
    return cachedChartColors;
  }
  cachedChartColors = getChartColors();
  return cachedChartColors;
}

/** 订阅 documentElement class 变化（暗色模式切换） */
function subscribeChartColors(callback: () => void): () => void {
  const observer = new MutationObserver(() => {
    invalidateChartColorsCache();
    callback();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

export function useChartColors(): ChartColors {
  return useSyncExternalStore(subscribeChartColors, getChartColorsSnapshot, getDefaultChartColors);
}
