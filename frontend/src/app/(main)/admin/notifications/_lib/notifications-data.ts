/**
 * 消息中心服务端取数（RSC 首屏）
 *
 * 展示类型与分类常量位于 `@/components/notifications/shared`——侧边栏铃铛
 * （`src/components/app-sidebar.tsx` 消费）与本页要用同一套，共享组件不得反向
 * 依赖 app 路由私有目录，故那些常量放中立位置。此处只做再导出 + 服务端加载器。
 */

import { cache } from "react";
import { fetchClient } from "@/lib/api-server";
import { isRedirectError } from "@/lib/auth/server/session";
import { logger } from "@/lib/logger";
import type {
  NotificationListResponse,
  NotificationPreferencesResponse,
  UnreadCountResponse,
} from "@/components/notifications/shared";

export type {
  NotificationListItem,
  NotificationListResponse,
  NotificationPreferencesResponse,
  PreferenceCategory,
  UnreadCountResponse,
} from "@/components/notifications/shared";
export {
  CATEGORY_LABELS,
  DISPLAY_CATEGORIES,
  formatRelativeTime,
} from "@/components/notifications/shared";

interface NotificationQuery {
  page?: number;
  page_size?: number;
  unread?: boolean;
  category?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  days?: number;
}

/** 服务端首屏取数（列表 + 未读数并行，避免请求瀑布） */
export const getNotificationInitialData = cache(
  async (
    query: NotificationQuery = {},
  ): Promise<{
    list: NotificationListResponse | null;
    unread: UnreadCountResponse | null;
  }> => {
    const client = await fetchClient();
    const results = await Promise.allSettled([
      client.GET("/api/v1/notifications", {
        params: {
          query: {
            page: query.page ?? 1,
            page_size: query.page_size ?? 20,
            unread: query.unread,
            category: query.category as
              | "lead"
              | "growth"
              | "project"
              | "key"
              | "marketing"
              | "finance"
              | "system"
              | "security"
              | undefined,
            priority: query.priority,
            days: query.days,
          },
        },
      }),
      client.GET("/api/v1/notifications/unread-count", {}),
    ]);
    for (const r of results) {
      // 401 时 fetchClient 抛 NEXT_REDIRECT，allSettled 会吞成 rejected——必须放行
      if (r.status === "rejected" && isRedirectError(r.reason)) throw r.reason;
    }
    const [listRes, unreadRes] = results;
    if (listRes.status === "rejected") logger.error("[Notifications] 列表获取失败:", listRes.reason);
    if (unreadRes.status === "rejected")
      logger.error("[Notifications] 未读数获取失败:", unreadRes.reason);
    return {
      list: listRes.status === "fulfilled" ? (listRes.value.data ?? null) : null,
      unread: unreadRes.status === "fulfilled" ? (unreadRes.value.data ?? null) : null,
    };
  },
);

/** 服务端取偏好（偏好页首屏） */
export const getNotificationPreferences = cache(
  async (): Promise<NotificationPreferencesResponse | null> => {
    const client = await fetchClient();
    try {
      const { data } = await client.GET("/api/v1/notifications/preferences", {});
      return data ?? null;
    } catch (e) {
      if (isRedirectError(e)) throw e;
      logger.error("[Notifications] 偏好获取失败:", e);
      return null;
    }
  },
);
