/** 高德 JS API 最小类型（避免引入额外类型包）。 */

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
  }
}
