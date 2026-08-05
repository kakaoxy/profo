import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";

/** 在售房源列表项. */
type OnSaleItem = components["schemas"]["PublicProjectListItem"];
/** 已成交房源列表项. */
type SoldItem = components["schemas"]["PublicSoldProjectItem"];
/** 列表项（在售或已成交）. */
type ProjectItem = OnSaleItem | SoldItem;
/** 在售房源列表响应. */
type OnSaleListResponse = components["schemas"]["PublicProjectListResponse"];
/** 已成交房源列表响应. */
type SoldListResponse = components["schemas"]["PublicSoldProjectListResponse"];

/** tab 类型：on_sale=在售，sold=已成交. */
type Tab = "on_sale" | "sold";

/** 每页数量. */
const PAGE_SIZE = 10;

/** 页面 data. */
interface PageData {
  tab: Tab;
  items: ProjectItem[];
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
  onTabChange(e: WechatMiniprogram.BaseEvent): void;
  onItemTap(e: WechatMiniprogram.BaseEvent): void;
  onRetry(): void;
}

Page<PageData, PageCustom>({
  data: {
    tab: "on_sale",
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
  onTabChange(e: WechatMiniprogram.BaseEvent) {
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
      let response: OnSaleListResponse | SoldListResponse;
      if (tab === "on_sale") {
        response = await request<OnSaleListResponse>({
          url: "/public/projects",
          data: { page, page_size: pageSize },
        });
      } else {
        response = await request<SoldListResponse>({
          url: "/public/projects/sold",
          data: { page, page_size: pageSize },
        });
      }
      const newItems: ProjectItem[] = response.items;
      const merged: ProjectItem[] = reset
        ? newItems
        : [...this.data.items, ...newItems];
      this.setData({
        items: merged,
        total: response.total,
        noMore: merged.length >= response.total,
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
    // 限流防抖：加载中直接 return
    if (this.data.loading || this.data.loadingMore) {
      return;
    }
    if (this.data.items.length >= this.data.total) {
      this.setData({ noMore: true });
      return;
    }
    this.setData({ page: this.data.page + 1 });
    this.loadList(false);
  },
  onItemTap(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/projects/detail/index?id=${id}` });
  },
  onRetry() {
    this.loadList(true);
  },
});
