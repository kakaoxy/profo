"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowRight, Bell, BellOff, CheckCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type {
  NotificationListResponse,
  UnreadCountResponse,
} from "@/components/notifications/shared";
import { CATEGORY_LABELS, DISPLAY_CATEGORIES } from "@/components/notifications/shared";
import { NotificationItem } from "@/components/notifications/notification-item";

/**
 * 侧边栏消息铃铛 + 抽屉（设计稿屏 02，SPEC §8.4）。
 *
 * - 角标取 `unread-count.total`；>99 显示 `99+`；**0 时不渲染**（设计稿组件状态）；
 * - 抽屉：最近 10 条 + 分类 tabs（只渲染有消息的分类）+ 全部已读 + 查看全部；
 * - SWR 30s 轮询 + 聚焦刷新（**局部覆盖**，不改全局 SWRConfig——那会影响其他页面）；
 * - 已读乐观更新，失败 `mutate()` 回滚；
 * - K10：不新增侧边栏菜单项，消息中心仅经此铃铛 → 查看全部进入。
 */
export function NotificationBell({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<string>("all");

  const { data: unread, mutate: mutateUnread } = useSWR<UnreadCountResponse>(
    "/api/v1/notifications/unread-count",
    { refreshInterval: 30000, revalidateOnFocus: true, focusThrottleInterval: 30000 },
  );

  const { data: list, mutate } = useSWR<NotificationListResponse>(
    open ? "/api/v1/notifications?page=1&page_size=10" : null,
    { refreshInterval: 30000, revalidateOnFocus: true },
  );

  const total = unread?.total ?? 0;
  const badge = total > 99 ? "99+" : String(total);
  const allItems = list?.items ?? [];
  const rows = tab === "all" ? allItems : allItems.filter((item) => item.category === tab);

  const markRead = async (id: string) => {
    await mutate(
      (current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === id ? { ...item, read_at: new Date().toISOString() } : item,
              ),
              unread_total: Math.max(0, current.unread_total - 1),
            }
          : current,
      false,
    );
    try {
      const res = await fetch(`/api/v1/notifications/${id}/read`, {
        method: "POST",
        headers: { "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
      });
      if (!res.ok) throw new Error(String(res.status));
      await mutateUnread();
      await mutate();
    } catch {
      await mutate();
      await mutateUnread();
    }
  };

  const readAll = async () => {
    const res = await fetch("/api/v1/notifications/read-all", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      credentials: "include",
      body: tab === "all" ? "{}" : JSON.stringify({ category: tab }),
    });
    if (res.ok) {
      await mutate();
      await mutateUnread();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={total > 0 ? `消息，未读 ${total} 条` : "消息"}
          className={`group relative flex items-center rounded-xl py-2 text-[13.5px] text-ink transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            collapsed ? "mx-auto h-8 w-8 justify-center" : "w-full gap-3 px-3"
          }`}
        >
          <span className="relative flex items-center justify-center text-graphite group-hover:text-ink">
            <Bell className="h-4 w-4" aria-hidden="true" />
            {total > 0 && (
              <span
                aria-live="polite"
                className="absolute -right-1.5 -top-1.5 flex min-w-[16px] items-center justify-center rounded-full bg-ink px-1 text-[10px] font-[500] leading-[16px] text-white tabular-nums"
              >
                {badge}
              </span>
            )}
          </span>
          {!collapsed && <span className="flex-1 truncate text-left">消息</span>}
          {!collapsed && total > 0 && (
            <span className="shrink-0 text-[11.5px] text-graphite tabular-nums">{badge}</span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align={collapsed ? "start" : "end"}
        side="right"
        sideOffset={12}
        className="w-[400px] rounded-cards p-0 shadow-steep"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div role="dialog" aria-label="消息" className="flex max-h-[70vh] flex-col">
          <div className="flex items-center gap-2 border-b border-[#f0f0f2] px-4 py-3">
            <span className="text-[14px] font-[480] text-ink">
              消息
              {total > 0 && (
                <span className="ml-2 rounded-pill bg-fog px-2 py-0.5 text-[11.5px] font-normal text-graphite tabular-nums">
                  {total} 条未读
                </span>
              )}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={readAll}
              disabled={total === 0}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[12.5px] text-graphite transition-colors hover:bg-fog hover:text-ink disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
              全部已读
            </button>
          </div>

          {/* 分类 tabs：只渲染有消息的分类（设计稿补充口径 c） */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-[#f0f0f2] px-3 py-2">
            <TabButton active={tab === "all"} onClick={() => setTab("all")} label="全部" />
            {DISPLAY_CATEGORIES.map((cat) => {
              const count = unread?.total_by_category?.[cat] ?? 0;
              if (count === 0) return null;
              return (
                <TabButton
                  key={cat}
                  active={tab === cat}
                  onClick={() => setTab(cat)}
                  label={CATEGORY_LABELS[cat] ?? cat}
                  count={unread?.by_category?.[cat] ?? 0}
                />
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-fog text-graphite">
                  <BellOff className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="mt-2.5 text-[13px] font-[450] text-ink">
                  {tab === "all" ? "暂无消息" : "该分类暂无消息"}
                </p>
                {tab === "all" && (
                  <p className="mt-1 text-[11.5px] text-graphite">
                    有新的线索或告警时会出现在这里
                  </p>
                )}
              </div>
            ) : (
              <ul className="space-y-0.5">
                {rows.map((item) => (
                  <li key={item.id}>
                    <NotificationItem
                      item={item}
                      compact
                      onRead={(target) => {
                        void markRead(target.id);
                        if (target.action_type === "route" && target.action_url) {
                          setOpen(false);
                          router.push(target.action_url);
                        }
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href="/admin/notifications"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1.5 border-t border-[#f0f0f2] px-4 py-3 text-[13px] font-[450] text-ink transition-colors hover:bg-fog focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            查看全部消息
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 抽屉分类 tab（未读 > 0 显示未读数，否则由后端 total_by_category 提供总数） */
function TabButton({
  active,
  onClick,
  label,
  count = 0,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-pill px-2.5 py-1 text-[12px] transition-colors ${
        active ? "bg-ink text-white" : "text-graphite hover:bg-fog hover:text-ink"
      }`}
    >
      {label}
      {count > 0 && <span className="ml-1 tabular-nums opacity-70">{count}</span>}
    </button>
  );
}
