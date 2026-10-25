"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { BellOff, CheckCheck, Sliders } from "lucide-react";
import type {
  NotificationListItem,
  NotificationListResponse,
  UnreadCountResponse,
} from "@/components/notifications/shared";
import { CATEGORY_LABELS, DISPLAY_CATEGORIES } from "@/components/notifications/shared";
import { NotificationItem } from "@/components/notifications/notification-item";

const PAGE_SIZE = 20;

interface NotificationListProps {
  initialList: NotificationListResponse | null;
  initialUnread: UnreadCountResponse | null;
}

type Tab = "all" | "unread" | string;

/**
 * 消息中心列表（client）：分类 tabs + 优先级筛选 + 近 30 天 + 分页 +
 * 单条已读（乐观更新）+ 全部已读。
 *
 * SWR 局部覆盖轮询配置（不改全局 SWRConfig）。
 */
export function NotificationList({ initialList, initialUnread }: NotificationListProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [priority, setPriority] = useState<string>("");
  const [days, setDays] = useState<number>(0);
  const [page, setPage] = useState(1);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const query = {
    page,
    page_size: PAGE_SIZE,
    unread: tab === "unread" ? true : undefined,
    category: tab !== "all" && tab !== "unread" ? tab : undefined,
    priority: (priority || undefined) as "low" | "normal" | "high" | "urgent" | undefined,
    days: days > 0 ? days : undefined,
  };

  const search = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  });

  const { data, mutate, isValidating } = useSWR<NotificationListResponse>(
    `/api/v1/notifications?${search.toString()}`,
    {
      fallbackData: page === 1 && !priority && days === 0 ? (initialList ?? undefined) : undefined,
      refreshInterval: 30000,
      revalidateOnFocus: true,
      focusThrottleInterval: 30000,
      keepPreviousData: true,
    },
  );
  const { data: unread, mutate: mutateUnread } = useSWR<UnreadCountResponse>(
    "/api/v1/notifications/unread-count",
    { fallbackData: initialUnread ?? undefined, refreshInterval: 30000 },
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const unreadTotal = unread?.total ?? data?.unread_total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const markRead = useCallback(
    async (item: NotificationListItem) => {
      if (!item.read_at) {
        // 乐观更新：先改本地，失败回滚
        setPendingId(item.id);
        await mutate(
          (current) =>
            current
              ? {
                  ...current,
                  items: current.items.map((i) =>
                    i.id === item.id ? { ...i, read_at: new Date().toISOString() } : i,
                  ),
                  unread_total: Math.max(0, current.unread_total - 1),
                  unread_in_filter: Math.max(0, current.unread_in_filter - 1),
                }
              : current,
          false,
        );
        try {
          const res = await fetch(`/api/v1/notifications/${item.id}/read`, {
            method: "POST",
            headers: { "X-Requested-With": "XMLHttpRequest" },
            credentials: "include",
          });
          if (!res.ok) throw new Error(String(res.status));
          await mutateUnread();
          await mutate();
        } catch {
          // 回滚
          await mutate();
          await mutateUnread();
        } finally {
          setPendingId(null);
        }
      }
      // 按 action_type 跳转（route 类型才有地址）
      if (item.action_type === "route" && item.action_url) {
        router.push(item.action_url);
      }
    },
    [mutate, mutateUnread, router],
  );

  const readAll = useCallback(async () => {
    const body = tab !== "all" && tab !== "unread" ? JSON.stringify({ category: tab }) : "{}";
    const res = await fetch("/api/v1/notifications/read-all", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      credentials: "include",
      body,
    });
    if (res.ok) {
      await mutate();
      await mutateUnread();
    }
  }, [mutate, mutateUnread, tab]);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "all", label: "全部", count: total },
    { id: "unread", label: "未读", count: unreadTotal },
    ...DISPLAY_CATEGORIES.map((cat) => ({
      id: cat as Tab,
      label: CATEGORY_LABELS[cat] ?? cat,
      count: unread?.by_category?.[cat] ?? 0,
    })),
  ];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setPage(1);
              }}
              className={`rounded-pill px-3.5 py-1.5 text-[13px] transition-colors ${
                tab === t.id
                  ? "bg-ink text-white"
                  : "bg-white text-graphite shadow-steep-sm hover:text-ink"
              }`}
            >
              {t.label}
              {t.count > 0 && <span className="ml-1.5 tabular-nums opacity-70">{t.count}</span>}
            </button>
          ))}
        </div>

        <span className="flex-1" />

        <select
          value={priority}
          onChange={(e) => {
            setPriority(e.target.value);
            setPage(1);
          }}
          aria-label="优先级筛选"
          className="rounded-inputs bg-white px-3 py-1.5 text-[13px] text-ink shadow-steep-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">优先级：全部</option>
          <option value="urgent">紧急</option>
          <option value="high">重要</option>
          <option value="normal">普通</option>
          <option value="low">低</option>
        </select>

        <select
          value={days}
          onChange={(e) => {
            setDays(Number(e.target.value));
            setPage(1);
          }}
          aria-label="时间范围筛选"
          className="rounded-inputs bg-white px-3 py-1.5 text-[13px] text-ink shadow-steep-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value={0}>全部时间</option>
          <option value={7}>近 7 天</option>
          <option value={30}>近 30 天</option>
          <option value={90}>近 90 天</option>
        </select>

        <button
          type="button"
          onClick={readAll}
          disabled={unreadTotal === 0}
          className="inline-flex items-center gap-1.5 rounded-pill bg-ink px-3.5 py-1.5 text-[13px] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
          全部已读
        </button>
      </div>

      <div className="rounded-cards bg-white px-2 py-1.5 shadow-steep-sm">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-fog text-graphite">
              <BellOff className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-3 text-[14px] font-[450] text-ink">暂无消息</p>
            <p className="mt-1 text-[12.5px] text-graphite">该筛选条件下没有通知</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#f0f0f2]">
            {items.map((item) => (
              <li key={item.id} className={pendingId === item.id ? "opacity-60" : ""}>
                <NotificationItem item={item} onRead={markRead} />
              </li>
            ))}
          </ul>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 text-[12.5px] text-graphite">
            <span>
              共 {total} 条{isValidating ? " · 刷新中" : ""}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded px-2 py-1 transition-colors hover:bg-fog disabled:opacity-40"
                aria-label="上一页"
              >
                ‹
              </button>
              <span className="tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded px-2 py-1 transition-colors hover:bg-fog disabled:opacity-40"
                aria-label="下一页"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[12px] text-graphite">
        <Sliders className="h-3 w-3" aria-hidden="true" />
        站内信是唯一事实源；微信为 best-effort 渠道，失败不影响站内信。
      </p>
    </>
  );
}
