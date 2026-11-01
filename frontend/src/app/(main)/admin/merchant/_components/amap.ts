/** 高德 JS API 最小类型（避免引入额外类型包）。 */

/**
 * 读取 DESIGN 令牌的运行时色值。
 * Marker/Polyline 的 content 走 DOM（可用 `var(--color-*)`），但 canvas 描边等只能吃实际色值。
 */
export function tokenColor(name: string, fallback = "#17191c"): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** 地图标记与信息窗体走 innerHTML，门店名等字段来自用户输入，必须转义（存储型 XSS）。 */
export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface AMapMap {
  setCenter(lngLat: [number, number], immediately?: boolean): void;
  add(item: unknown): void;
  remove(item: unknown): void;
  on(event: string, handler: () => void): void;
  getZoom(): number;
  setFitView(items: unknown[]): void;
  destroy(): void;
}

export interface AMapMarker {
  on(event: string, handler: () => void): void;
}

export interface AMapInfoWindow {
  setContent(content: string): void;
  open(map: AMapMap, position: [number, number]): void;
}

export interface AMapPolyline {
  on(event: string, handler: () => void): void;
}

export interface AMapNamespace {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapMap;
  Marker: new (options: Record<string, unknown>) => AMapMarker;
  InfoWindow: new (options: Record<string, unknown>) => AMapInfoWindow;
  Polyline: new (options: Record<string, unknown>) => AMapPolyline;
}

declare global {
  interface Window {
    AMap?: AMapNamespace;
    /** 高德 JS API 安全密钥配置，必须在加载脚本前设置。 */
    _AMapSecurityConfig?: { securityJsCode?: string };
  }
}
