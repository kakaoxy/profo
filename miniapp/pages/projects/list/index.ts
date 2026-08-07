import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";

/** 在售房源列表项. */
type OnSaleItem = components["schemas"]["PublicProjectListItem"];
/** 已成交房源列表项. */
type SoldItem = components["schemas"]["PublicSoldProjectItem"];
/** 状态 tab. */
type Tab = "all" | "on_sale" | "renovating" | "sold";

/** 列表项展示用统一结构. */
interface DisplayItem {
  id: number;
  title: string;
  desc: string;
  total_price: number;
  cover_thumbnail_url?: string | null;
  cover_image?: string | null;
  tags?: string[];
  badgeText: string;
  badgeClass: string;
}

/** 每页数量. */
const PAGE_SIZE = 10;

/** 列表响应. */
interface ListResponse {
  items: OnSaleItem[] | SoldItem[];
  total: number;
  page: number;
  page_size: number;
}

/** 页面 data. */
interface PageData {
  tab: Tab;
  items: DisplayItem[];
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  noMore: boolean;
}

/** 页面自定义方法. */
interface PageCustom {
  loadList(reset?: boolean): void;
  toDisplay(item: OnSaleItem | SoldItem, tab: Tab): DisplayItem;
  onStatusTabChange(e: WechatMiniprogram.BaseEvent): void;
  onFilterTap(): void;
  onSearchTap(): void;
  onItemTap(e: WechatMiniprogram.BaseEvent): void;
  onRetry(): void;
}

Page<PageData, PageCustom>({
  data: {
    tab: "all",
    items: [],
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    loading: false,
    loadingMore: false,
    error: false,
    noMore: false,
  },
  onLoad() {
    this.loadList(true);
  },
  onStatusTabChange(e: WechatMiniprogram.BaseEvent) {
    const tab = e.currentTarget.dataset.tab as Tab;
    if (!tab || tab === this.data.tab) {
      return;
    }
    this.setData({
      tab,
      items: [],
      page: 1,
      total: 0,
      error: false,
      noMore: false,
    });
    this.loadList(true);
  },
  toDisplay(item: OnSaleItem | SoldItem, tab: Tab): DisplayItem {
    const community = item.community_name || "";
    const layout = item.layout;
    if (tab === "sold") {
      return {
        id: item.id,
        title: item.title,
        desc: `${community} · ${layout}`,
        total_price: item.total_price,
        cover_thumbnail_url: item.cover_thumbnail_url,
        cover_image: item.cover_image,
        tags: [],
        badgeText: "过往案例",
        badgeClass: "badge-fog",
      };
    }
    // on_sale / renovating / all 共用描述格式
    const onSale = item as OnSaleItem;
    const desc = `${community} · ${layout} · ${onSale.orientation} · ${onSale.floor_info}`;
    let badgeText = "";
    let badgeClass = "";
    if (tab === "on_sale") {
      badgeText = "在售";
      badgeClass = "badge-apricot";
    } else if (tab === "renovating") {
      badgeText = "装修中";
      badgeClass = "badge-sky";
    } else {
      // all：按 project_status 映射
      const status = onSale.project_status;
      if (status === "在售") {
        badgeText = "在售";
        badgeClass = "badge-apricot";
      } else if (status === "在途") {
        badgeText = "装修中";
        badgeClass = "badge-sky";
      } else if (status === "已售") {
        badgeText = "过往案例";
        badgeClass = "badge-fog";
      }
    }
    return {
      id: onSale.id,
      title: onSale.title,
      desc,
      total_price: onSale.total_price,
      cover_thumbnail_url: onSale.cover_thumbnail_url,
      cover_image: onSale.cover_image,
      tags: onSale.tags,
      badgeText,
      badgeClass,
    };
  },
  async loadList(reset = false) {
    const tab = this.data.tab;
    const pageSize = this.data.pageSize;
    const page = reset ? 1 : this.data.page;
    if (reset) {
      this.setData({ loading: true, error: false, noMore: false });
    } else {
      this.setData({ loadingMore: true });
    }
    try {
      let response: ListResponse;
      if (tab === "sold") {
        response = await request<{ items: SoldItem[]; total: number; page: number; page_size: number }>({
          url: "/public/projects/sold",
          data: { page, page_size: pageSize },
        });
      } else {
        response = await request<{ items: OnSaleItem[]; total: number; page: number; page_size: number }>({
          url: "/public/projects",
          data: { page, page_size: pageSize },
        });
      }
      let rawItems: OnSaleItem[] | SoldItem[] = response.items;
      let total = response.total;
      if (tab === "renovating") {
        // ⚠️ TODO 后端暂无 project_status 筛选参数，客户端按在途过滤；分页场景下结果不精确，待后端补筛选参数
        // ⚠️ TODO 此 tab 分页不精确：客户端过滤会破坏分页计数，total 用过滤后长度
        const onSaleItems = rawItems as OnSaleItem[];
        const filtered = onSaleItems.filter((it) => it.project_status === "在途");
        rawItems = filtered;
        total = filtered.length;
      }
      const newItems: DisplayItem[] = rawItems.map((it) =>
        this.toDisplay(it as OnSaleItem | SoldItem, tab)
      );
      const merged: DisplayItem[] = reset ? newItems : [...this.data.items, ...newItems];
      this.setData({
        items: merged,
        total,
        noMore: merged.length >= total,
      });
    } catch {
      if (reset) {
        this.setData({ error: true, items: [] });
      }
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },
  onReachBottom() {
    // 限流防抖：加载中或无更多直接 return
    if (this.data.loading || this.data.loadingMore) {
      return;
    }
    if (this.data.noMore) {
      return;
    }
    this.setData({ page: this.data.page + 1 });
    this.loadList(false);
  },
  onItemTap(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: "/pages/projects/detail/index?id=" + id });
  },
  onSearchTap() {
    wx.showToast({ title: "功能开发中", icon: "none" });
  },
  onFilterTap() {
    wx.showToast({ title: "功能开发中", icon: "none" });
  },
  onRetry() {
    this.loadList(true);
  },
});
