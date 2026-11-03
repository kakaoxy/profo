/**
 * 商户拓展首页：我的门店列表 + 搜索 + 新增门店入口.
 *
 * 数据 GET /public/merchant/stores（C 端员工令牌 + merchant:read），
 * 后端按数据范围过滤（员工仅本人拓展/本人拜访门店）。
 * REQ-IT4-02：首次进入与「刷新」会重新定位，并把定位传给后端按距离由近到远排序。
 */
import type { components } from "../../../types/api-types";
import { getCurrentLocation } from "../../../utils/location";
import { describeRequestError } from "../../../utils/merchant-errors";
import { type StatusTone, storeStatusLabel, storeStatusTone } from "../../../utils/merchant-status";
import { MP_ICONS } from "../../../utils/mp-icons";
import { request } from "../../../utils/request";
import { getCAccessToken } from "../../../utils/token";

type StoreListResponse = components["schemas"]["MerchantStoreListResponse"];
type StoreItem = components["schemas"]["MerchantStoreListItem"];

type PageState = "loading" | "error" | "needLogin" | "empty" | "items";

/** 列表排序原点（GCJ-02）；定位失败时为 null，后端回退默认排序. */
let origin: { lng: number; lat: number } | null = null;

interface DisplayStore {
  id: string;
  store_name: string;
  company_name: string;
  district: string;
  business_circle: string;
  address: string;
  statusLabel: string;
  statusTone: StatusTone;
  lastVisitText: string;
  distanceText: string;
}

/** 距离文案统一用「米 / 公里」，不再裸写 m/km（审查报告 T8）. */
function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) {
    return "";
  }
  if (meters < 1000) {
    return `距离 ${Math.round(meters)} 米`;
  }
  return `距离 ${(meters / 1000).toFixed(1)} 公里`;
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
    statusLabel: storeStatusLabel(item.review_status, item.cooperation_status_label),
    statusTone: storeStatusTone(item.review_status, item.cooperation_status),
    lastVisitText: formatDate(item.last_visit_at),
    distanceText: formatDistance(item.distance_m),
  };
}

/** 从 scene 提取邀请短码（裸短码或 "code=xxx" 键值对，兼容带路径前缀形态）. */
function parseSceneCode(scene: string): string {
  if (!scene) {
    return "";
  }
  const query = scene.includes("?") ? scene.slice(scene.indexOf("?") + 1) : scene;
  const pair = query.split("&").find((item) => item.startsWith("code="));
  if (pair) {
    return pair.slice("code=".length);
  }
  // 裸短码：门店邀请码为 8-64 位 URL-safe 字符串，避免把其他 scene 误判为邀请码
  return /^[A-Za-z0-9_-]{8,64}$/.test(scene) ? scene : "";
}

/** 已处理过的扫码短码：避免 onShow 反复跳转同一张码（REQ-IT7-09）. */
let lastHandledSceneCode = "";

/** 从页面 query / 小程序进入参数中提取邀请短码（REQ-IT7-09）. */
function extractSceneCode(query: Record<string, string | undefined>): string {
  const rawScene = query.scene ? decodeURIComponent(query.scene) : "";
  return query.code || parseSceneCode(rawScene);
}

/** 跳转经纪人中心完成认证 / 绑定（REQ-M06-006 / REQ-IT7-09）. */
function goBrokerBind(code: string, referrer?: string): void {
  if (!code || code === lastHandledSceneCode) {
    return;
  }
  lastHandledSceneCode = code;
  const referrerQuery = referrer ? `&referrer=${encodeURIComponent(referrer)}` : "";
  wx.redirectTo({ url: `/pages/merchant/broker/index?code=${encodeURIComponent(code)}${referrerQuery}` });
}

Page({
  data: {
    state: "loading" as PageState,
    errorText: "",
    keyword: "",
    stores: [] as DisplayStore[],
    total: 0,
    icons: {
      chevronRight: MP_ICONS.chevronRight,
      plus: MP_ICONS.plus,
    },
  },

  /**
   * 扫码进入：兼容旧版门店邀请二维码（旧版 QR_PAGE 指向本页）。
   *
   * 新版二维码统一走主包落地页 pages/merchant-invite/index（REQ-IT7-09），
   * 本页保留 scene 解析以兼容已打印/已保存的旧码：解析到短码后转到经纪人中心
   * 完成认证 + 自动绑定（REQ-M06-006）。
   */
  onLoad(options: Record<string, string | undefined>) {
    // 冷启动扫码：scene 在页面 query 上（referrer 用于注册归属 AC-024）
    goBrokerBind(extractSceneCode(options), options.referrer);
  },

  onShow() {
    // 小程序已在运行时扫码只会触发 onShow，不会重新执行 onLoad（REQ-IT7-09）。
    // getEnterOptionsSync 返回最近一次进入时的 scene/query，冷启动与热启动都可用。
    const enter = wx.getEnterOptionsSync ? wx.getEnterOptionsSync() : wx.getLaunchOptionsSync();
    const query = (enter.query || {}) as Record<string, string | undefined>;
    goBrokerBind(extractSceneCode(query), query.referrer);
    void this.refreshLocationAndLoad();
  },

  onPullDownRefresh() {
    void this.refreshLocationAndLoad().finally(() => wx.stopPullDownRefresh());
  },

  /** 重新定位后加载列表（首次进入 / 下拉刷新 / 点「刷新」）. */
  async refreshLocationAndLoad(): Promise<void> {
    if (!getCAccessToken()) {
      // 未登录不请求定位：避免在登录前弹权限询问
      this.setData({ state: "needLogin" });
      return;
    }
    const located = await getCurrentLocation();
    origin = located ? { lng: located.longitude, lat: located.latitude } : null;
    await this.loadStores();
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
        data: {
          page: 1,
          page_size: 50,
          keyword: this.data.keyword.trim(),
          origin_lng: origin?.lng,
          origin_lat: origin?.lat,
        },
      });
      const stores = (data.items || []).map(toDisplay);
      this.setData({
        stores,
        total: data.total,
        errorText: "",
        state: stores.length ? "items" : "empty",
      });
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 401) {
        this.setData({ state: "needLogin" });
        return;
      }
      this.setData({ state: "error", errorText: describeRequestError(err, "门店列表加载失败") });
    }
  },

  onKeywordInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    void this.loadStores();
  },

  /** 「刷新」：重新定位（REQ-IT4-02）. */
  onRefresh() {
    void this.refreshLocationAndLoad();
  },

  onRetry() {
    void this.refreshLocationAndLoad();
  },

  onGoLogin() {
    wx.navigateTo({ url: "/pages/login/index/index?from=merchant" });
  },

  onCreate() {
    wx.navigateTo({ url: "/pages/merchant/store/create/index" });
  },

  onStoreTap(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/merchant/store/detail/index?store_id=${id}` });
  },

  /** REQ-IT6-01：卡片右侧「拜访」直达拜访录入，省去先进详情再点登记 */
  onVisitTap(e: WechatMiniprogram.BaseEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/merchant/visit/create/index?store_id=${id}` });
  },
});
