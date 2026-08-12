/**
 * 累计服务人数（平台 total_sold）加载与缓动动画：供 about / projects/list 等多页面复用.
 * 复用方式：页面方法内以 `this` 作为 ServedCountContext 传入，保持接口类型不变.
 */
import type { components } from "../types/api-types";
import { request } from "./request";
import { formatThousands } from "./format";

/** 平台统计（取 total_sold 作为累计服务人数）. */
type PublicPlatformStats = components["schemas"]["PublicPlatformStats"];

/** 使用本模块功能的页面实例所需具备的字段与方法. */
export interface ServedCountContext {
  servedCountTimer: ReturnType<typeof setInterval> | null;
  setData(data: Record<string, unknown>): void;
  clearServedCountTimer(): void;
  animateServedCount(target: number): void;
}

/** 拉取平台统计 total_sold（公开接口，skipAuth），成功后从 0 缓动. */
export async function loadServedCount(ctx: ServedCountContext): Promise<void> {
  ctx.clearServedCountTimer();
  ctx.setData({
    servedCountVisible: true,
    servedCountLoading: true,
    servedCountTotal: 0,
    servedCountDisplay: "0",
  });
  try {
    const res = await request<PublicPlatformStats>({
      url: "/public/stats/platform",
      skipAuth: true,
    });
    const total = Math.max(0, Math.floor(res.total_sold || 0));
    ctx.setData({ servedCountTotal: total, servedCountLoading: false });
    ctx.animateServedCount(total);
  } catch {
    ctx.setData({ servedCountVisible: false, servedCountLoading: false });
  }
}

/** 从 0 缓动到 target（约 1.2s ease-out）. */
export function animateServedCount(ctx: ServedCountContext, target: number): void {
  ctx.clearServedCountTimer();
  if (target <= 0) {
    ctx.setData({ servedCountDisplay: "0" });
    return;
  }
  const duration = 1200;
  const start = Date.now();
  ctx.servedCountTimer = setInterval(() => {
    const elapsed = Date.now() - start;
    const t = Math.min(1, elapsed / duration);
    const progress = 1 - (1 - t) * (1 - t);
    const current = Math.floor(target * progress);
    ctx.setData({ servedCountDisplay: formatThousands(current) });
    if (t >= 1) {
      ctx.setData({ servedCountDisplay: formatThousands(target) });
      ctx.clearServedCountTimer();
    }
  }, 16);
}

/** 清理计数缓动定时器. */
export function clearServedCountTimer(ctx: ServedCountContext): void {
  if (ctx.servedCountTimer) {
    clearInterval(ctx.servedCountTimer);
    ctx.servedCountTimer = null;
  }
}