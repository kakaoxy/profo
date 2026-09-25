/**
 * 钥匙管理 · 我可操作的房源列表（profile 页「钥匙管理」内部入口落地页，设计稿 C2）.
 *
 * 数据 GET /keys/properties（/keys/* 走 C 端令牌，request.ts 自动选择），
 * 后端按当前用户身份过滤（管理员=全量，相关人=仅关联房源）。
 * 状态机（loading/error/needLogin/empty/items）与 SWR 缓存参照 viewing 列表范本；
 * 无分页（后端一次返回全部关联房源），点击卡片进房源钥匙详情页。
 */
import { request, getCacheData } from "../../../utils/request";
import { PROJECT_STATUS_TEXT } from "../utils/keys";
import type { KeysPropertyItem, KeysPropertiesResponse } from "../utils/keys";
import { getCAccessToken } from "../../../utils/token";

/** SWR 缓存 key（按 C 端令牌隔离，避免换号后渲染他人数据）. */
const CACHE_KEY_PREFIX = "keys_properties";

/** 列表项展示结构（chip 文案在 TS 侧拼好，wxml 只做渲染）. */
interface DisplayItem {
  projectId: string;
  address: string;
  metaText: string;
  managerOk: boolean;
  managerText: string;
  normalText: string;
  shareCount: number;
  shareText: string;
}

type PageState = "loading" | "error" | "needLogin" | "empty" | "items";

interface PageData {
  state: PageState;
  items: DisplayItem[];
  total: number;
  /** 搜索关键字（按小区/详细地址子串过滤，本地即时）. */
  searchKey: string;
}

interface PageCustom {
  /** 全量列表（搜索过滤的数据源，loadList 刷新时重建）. */
  allItems: DisplayItem[];
  loadList(): Promise<void>;
  /** 用关键字过滤 allItems 并渲染（searchKey 为空渲染全量）. */
  applyFilter(): void;
  onSearch(e: WechatMiniprogram.Input): void;
  onClearSearch(): void;
  onShareRecords(): void;
  onItemTap(e: WechatMiniprogram.BaseEvent): void;
  onRetry(): void;
  onGoLogin(): void;
}

/** KeysPropertyItem → 展示项（地址 + meta + 三 chip 文案）. */
function toDisplay(item: KeysPropertyItem): DisplayItem {
  const statusText = item.status ? PROJECT_STATUS_TEXT[item.status] ?? item.status : "";
  const metaParts = [statusText, item.area ? `${item.area} ㎡` : ""].filter(Boolean);
  // 普通 chip：基础「普通 N 有效」；待录入>0 追加「· N 待录入」；已停用>0 追加「· N 已停用」
  const normalParts = [`普通 ${item.normal_active_count} 有效`];
  if (item.normal_pending_count > 0) {
    normalParts.push(`${item.normal_pending_count} 待录入`);
  }
  if (item.normal_disabled_count > 0) {
    normalParts.push(`${item.normal_disabled_count} 已停用`);
  }
  return {
    projectId: item.project_id,
    address: item.address || item.community_name || "未命名房源",
    metaText: metaParts.join(" · "),
    managerOk: item.manager_key_set,
    managerText: item.manager_key_set ? "管理密码已设" : "管理密码未设",
    normalText: normalParts.join(" · "),
    shareCount: item.active_share_count,
    shareText: `分享中 ${item.active_share_count}`,
  };
}

Page<PageData, PageCustom>({
  allItems: [],
  data: {
    state: "loading",
    items: [],
    total: 0,
    searchKey: "",
  },

  onShow() {
    // 每次进入/返回刷新（详情页增删密码后回列表需同步徽章）
    void this.loadList();
  },

  async loadList() {
    const token = getCAccessToken();
    if (!token) {
      this.setData({ state: "needLogin", items: [] });
      return;
    }
    const cacheKey = `${CACHE_KEY_PREFIX}:${token}`;
    const cached = getCacheData<KeysPropertiesResponse>(cacheKey);
    if (cached) {
      // SWR：先渲染缓存再静默刷新，避免每次进入闪骨架屏
      this.setData({
        state: cached.items.length > 0 ? "items" : "empty",
        total: cached.items.length,
      });
      this.allItems = cached.items.map(toDisplay);
      this.applyFilter();
    } else {
      this.setData({ state: "loading", items: [], total: 0 });
    }
    try {
      const data = await request<KeysPropertiesResponse>({
        url: "/keys/properties",
        cacheKey,
      });
      this.setData({
        state: data.items.length > 0 ? "items" : "empty",
        total: data.items.length,
      });
      this.allItems = data.items.map(toDisplay);
      this.applyFilter();
    } catch (err) {
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      if (statusCode === 401) {
        // /keys/* 需 C 端令牌；仅切登录态，不清令牌（避免误伤仍有效的 admin 令牌）
        this.setData({ state: "needLogin", items: [] });
      } else if (!cached) {
        // 有缓存时静默失败（保留缓存数据不打断浏览）
        this.setData({ state: "error", items: [] });
      }
    }
  },

  /** 按 searchKey 过滤 allItems 渲染（地址已含 community_name 回退）. */
  applyFilter() {
    const all = this.allItems;
    const key = this.data.searchKey.trim();
    const filtered = key ? all.filter((item) => item.address.includes(key)) : all;
    this.setData({ items: filtered, total: filtered.length });
  },

  onSearch(e: WechatMiniprogram.Input) {
    this.setData({ searchKey: e.detail.value || "" });
    this.applyFilter();
  },

  onClearSearch() {
    this.setData({ searchKey: "" });
    this.applyFilter();
  },

  onShareRecords() {
    wx.navigateTo({ url: "/pages/keys/share-records/index" });
  },

  onItemTap(e: WechatMiniprogram.BaseEvent) {
    const projectId = e.currentTarget.dataset.projectId as string;
    const address = e.currentTarget.dataset.address as string;
    wx.navigateTo({
      url: `/pages/keys/detail/index?project_id=${encodeURIComponent(projectId)}&name=${encodeURIComponent(address)}`,
    });
  },

  onRetry() {
    this.setData({ state: "loading" });
    void this.loadList();
  },

  onGoLogin() {
    wx.navigateBack({ delta: 1 });
  },
});
