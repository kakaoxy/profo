/**
 * 分享记录列表（设计稿 C10）.
 *
 * GET /keys/shares（C 端令牌）一次拉全，状态过滤（全部/进行中/已过期/已回收）
 * 在前端本地完成——顶栏 chip 直接显示各状态计数，切换不重复请求。
 * 卡片展示：创建时间、房源数、有效期（剩 N 天/已过期）、查看进度、查看人。
 * 已过期卡片带软提示条（不阻断经纪人查看），已回收显示「已回收」chip。
 * enablePullDownRefresh 下拉重拉。
 */
import { request } from "../../../utils/request";
import {
  formatStamp,
  remainingDays,
  shareStatusOf,
} from "../utils/keys";
import type { KeyShareListItem, KeyShareListResponse } from "../utils/keys";
import { getCAccessToken } from "../../../utils/token";

type StatusFilter = "all" | "active" | "expired" | "revoked";

/** 状态过滤 chip 定义（顺序即顶栏顺序）. */
const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "active", label: "进行中" },
  { key: "expired", label: "已过期" },
  { key: "revoked", label: "已回收" },
];

/** 记录卡展示结构. */
interface RecordItem {
  id: string;
  status: "active" | "expired" | "revoked";
  statusLabel: string;
  statusClass: string;
  createdText: string;
  itemsText: string;
  /** 有效期副文案：进行中「剩 N 天」/「今日到期」，已过期「已过期」，已回收「已回收」. */
  expireText: string;
  viewedText: string;
  viewersText: string;
}

interface PageData {
  state: "loading" | "error" | "needLogin" | "empty" | "items";
  filters: { key: StatusFilter; label: string; count: number }[];
  activeFilter: StatusFilter;
  /** 全量记录（本地过滤的数据源）. */
  allItems: RecordItem[];
  items: RecordItem[];
}

interface PageCustom {
  loadRecords(): Promise<void>;
  toRecord(item: KeyShareListItem): RecordItem;
  applyFilter(activeFilter: StatusFilter): void;
  onFilterTap(e: WechatMiniprogram.BaseEvent): void;
  onItemTap(e: WechatMiniprogram.BaseEvent): void;
  onRetry(): void;
  onGoLogin(): void;
}

/** 状态 → chip 样式与文案. */
function statusView(status: "active" | "expired" | "revoked"): { label: string; statusClass: string } {
  if (status === "revoked") {
    return { label: "已回收", statusClass: "chip--mute" };
  }
  if (status === "expired") {
    return { label: "已过期", statusClass: "chip--gray" };
  }
  return { label: "进行中", statusClass: "chip--active" };
}

Page<PageData, PageCustom>({
  data: {
    state: "loading",
    filters: FILTERS.map((f) => ({ ...f, count: 0 })),
    activeFilter: "all",
    allItems: [],
    items: [],
  },

  onShow() {
    void this.loadRecords();
  },

  async loadRecords() {
    const token = getCAccessToken();
    if (!token) {
      this.setData({ state: "needLogin", items: [], allItems: [] });
      return;
    }
    try {
      const data = await request<KeyShareListResponse>({ url: "/keys/shares" });
      const all = (data.items ?? []).map((s) => this.toRecord(s));
      const counts: Record<StatusFilter, number> = { all: all.length, active: 0, expired: 0, revoked: 0 };
      all.forEach((s) => {
        counts[s.status] += 1;
      });
      this.setData({
        state: all.length > 0 ? "items" : "empty",
        filters: FILTERS.map((f) => ({ ...f, count: counts[f.key] })),
        allItems: all,
      });
      this.applyFilter(this.data.activeFilter);
    } catch (err) {
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      if (statusCode === 401) {
        this.setData({ state: "needLogin", items: [], allItems: [] });
      } else {
        this.setData({ state: "error", items: [] });
      }
    }
  },

  toRecord(item: KeyShareListItem): RecordItem {
    const status = shareStatusOf(item.status, item.is_expired);
    const view = statusView(status);
    let expireText: string;
    if (status === "revoked") {
      expireText = "已回收";
    } else if (status === "expired") {
      expireText = "已过期";
    } else {
      const days = remainingDays(item.expires_at);
      expireText = days > 0 ? `剩 ${days} 天` : "今日到期";
    }
    return {
      id: item.id,
      status,
      statusLabel: view.label,
      statusClass: view.statusClass,
      createdText: formatStamp(item.created_at),
      itemsText: `${item.items_count} 套房源`,
      expireText,
      viewedText: `已查看 ${item.viewed_count} / ${item.items_count}`,
      viewersText: (item.viewer_names ?? []).filter(Boolean).join("、"),
    };
  },

  /** 按顶栏选择本地过滤（allItems → items）；不改 state——空过滤结果由列表内空提示呈现. */
  applyFilter(activeFilter: StatusFilter) {
    const items =
      activeFilter === "all"
        ? this.data.allItems
        : this.data.allItems.filter((s) => s.status === activeFilter);
    this.setData({ activeFilter, items });
  },

  onFilterTap(e: WechatMiniprogram.BaseEvent) {
    const key = e.currentTarget.dataset.key as StatusFilter;
    if (key !== this.data.activeFilter) {
      this.applyFilter(key);
    }
  },

  onItemTap(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/keys/share-detail/index?id=${encodeURIComponent(id)}` });
  },

  onPullDownRefresh() {
    void this.loadRecords().then(() => wx.stopPullDownRefresh());
  },

  onRetry() {
    this.setData({ state: "loading" });
    void this.loadRecords();
  },

  onGoLogin() {
    wx.navigateBack({ delta: 1 });
  },
});
