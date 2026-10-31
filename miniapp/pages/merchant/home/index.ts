/**
 * 商户拓展首页：我的门店列表 + 搜索 + 新增门店入口.
 *
 * 数据 GET /public/merchant/stores（C 端员工令牌 + merchant:read），
 * 后端按数据范围过滤（员工仅本人拓展/本人拜访门店）。
 */
import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import { getCAccessToken } from "../../../utils/token";

type StoreListResponse = components["schemas"]["MerchantStoreListResponse"];
type StoreItem = components["schemas"]["MerchantStoreListItem"];

type PageState = "loading" | "error" | "needLogin" | "empty" | "items";

interface DisplayStore {
  id: string;
  store_name: string;
  company_name: string;
  district: string;
  business_circle: string;
  address: string;
  cooperation_status_label: string;
  review_status: string;
  lastVisitText: string;
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "暂无拜访";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDisplay(item: StoreItem): DisplayStore {
  return {
    id: item.id,
    store_name: item.store_name,
    company_name: item.company_name,
    district: item.district,
    business_circle: item.business_circle,
    address: item.address,
    cooperation_status_label: item.cooperation_status_label,
    review_status: item.review_status,
    lastVisitText: formatDate(item.last_visit_at),
  };
}

Page({
  data: {
    state: "loading" as PageState,
    keyword: "",
    stores: [] as DisplayStore[],
    total: 0,
  },

  onShow() {
    this.loadStores();
  },

  onPullDownRefresh() {
    this.loadStores().finally(() => wx.stopPullDownRefresh());
  },

  async loadStores(): Promise<void> {
    if (!getCAccessToken()) {
      this.setData({ state: "needLogin" });
      return;
    }
    this.setData({ state: "loading" });
    try {
      const data = await request<StoreListResponse>({
        url: "/public/merchant/stores",
        data: { page: 1, page_size: 50, keyword: this.data.keyword.trim() },
      });
      const stores = (data.items || []).map(toDisplay);
      this.setData({
        stores,
        total: data.total,
        state: stores.length ? "items" : "empty",
      });
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      this.setData({ state: statusCode === 401 || statusCode === 403 ? "needLogin" : "error" });
    }
  },

  onKeywordInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.loadStores();
  },

  onRetry() {
    this.loadStores();
  },

  onGoLogin() {
    wx.navigateTo({ url: "/pages/login/index/index" });
  },

  onCreate() {
    wx.navigateTo({ url: "/pages/merchant/store/create/index" });
  },

  onStoreTap(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/merchant/store/detail/index?store_id=${id}` });
  },
});
