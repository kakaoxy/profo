/**
 * 房源单分享 · 创建房源单页（对照高保真屏 B）.
 *
 * 页面职责：
 * - 顶部杏色说明条 + 关键词搜索（300ms 防抖 / 确认触发，均回到第 1 页）
 * - 在售房源列表：GET /public/projects?project_status=在售（公开接口 skipAuth），
 *   触底分页（page/page_size，noMore 由 items.length >= total 判定，同 projects/list）；
 *   epoch 守卫丢弃晚到的旧代响应（搜索/翻页竞态）
 * - 卡片勾选：封面（thumbnail 降级 cover）+ 标题 + 小区·户型·面积 + 总价 + 圆形复选框，
 *   选中态墨色描边 + 墨色实心白勾；上限 10 套，超出 toast 并阻止
 * - 底部固定操作栏：已选 N 套 + 「创建房源单」（0 套置灰）；创建成功 redirectTo 详情页，
 *   失败 toast 后端 message（401 提示先登录，对齐 projects/mine 不清登录态）
 */
import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import type { HttpResponseError } from "../../../utils/request";
import { resolveImageUrl } from "../../../utils/url";

type PublicProjectListItem = components["schemas"]["PublicProjectListItem"];
type PublicProjectListResponse = components["schemas"]["PublicProjectListResponse"];
type PropertySheetResponse = components["schemas"]["PropertySheetResponse"];

/** 未登录/无 C 端身份（401）. */
const HTTP_UNAUTHORIZED = 401;

/** 列表分页每页数量. */
const PAGE_SIZE = 20;

/** 单张房源单最多可选房源数（与后端校验一致）. */
const MAX_SELECTED = 10;

/** 搜索防抖间隔（ms）. */
const SEARCH_DEBOUNCE_MS = 300;

/** 未登录（401）时的创建失败提示. */
const UNAUTHORIZED_TIP = "请先登录后创建房源单";

/** 在售房源列表项展示结构（wxml 渲染用）. */
interface DisplayItem {
  id: number;
  title: string;
  /** 描述：小区名 · 户型 · 面积 拼接（空段跳过）. */
  meta: string;
  totalPrice: number;
  /** 封面图（cover_thumbnail_url 降级 cover_image，空串时不渲染图片）. */
  cover: string;
}

interface PageData {
  /** 搜索框输入值（未生效）. */
  searchValue: string;
  /** 已生效关键词（防抖/确认后写入）. */
  keyword: string;
  items: DisplayItem[];
  page: number;
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  noMore: boolean;
  /** 已选 id → true 映射（wxml 选中态判定用）. */
  selectedMap: Record<string, boolean>;
  /** 已选套数（底栏计数）. */
  selectedCount: number;
  /** 创建请求进行中. */
  submitting: boolean;
}

interface PageCustom {
  loadList(reset?: boolean): Promise<void>;
  toDisplay(item: PublicProjectListItem): DisplayItem;
  onSearchInput(e: WechatMiniprogram.Input): void;
  onSearchConfirm(): void;
  onCardTap(e: WechatMiniprogram.BaseEvent): void;
  onCreate(): Promise<void>;
  onRetry(): void;
  onReachBottom(): void;
  /** 搜索防抖定时器. */
  searchTimer: ReturnType<typeof setTimeout> | null;
  /** 已选房源 id（按勾选顺序，提交时作为 project_ids 保序去重交由后端）. */
  selectedOrder: number[];
  /** 请求时代戳：每次 reset 加载（搜索）+1，用于丢弃晚到的旧代翻页响应（竞态守卫）. */
  _epoch: number;
}

Page<PageData, PageCustom>({
  data: {
    searchValue: "",
    keyword: "",
    items: [],
    page: 1,
    total: 0,
    loading: false,
    loadingMore: false,
    error: false,
    noMore: false,
    selectedMap: {},
    selectedCount: 0,
    submitting: false,
  },

  searchTimer: null,
  selectedOrder: [],
  _epoch: 0,

  onLoad() {
    this.loadList(true);
  },

  onUnload() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  },

  /** 拉取在售房源列表（reset=回到第 1 页：首次/搜索/重试）. */
  async loadList(reset = false) {
    if (reset) {
      this._epoch += 1;
    }
    const myEpoch = this._epoch;
    if (reset) {
      this.setData({ loading: true, error: false, noMore: false });
    } else {
      this.setData({ loadingMore: true });
    }
    const page = reset ? 1 : this.data.page;
    try {
      const params: Record<string, string | number> = {
        page,
        page_size: PAGE_SIZE,
        project_status: "在售",
      };
      if (this.data.keyword) {
        params.keyword = this.data.keyword;
      }
      // 公开接口无需登录（与 projects/list 一致 skipAuth）
      const res = await request<PublicProjectListResponse>({
        url: "/public/projects",
        data: params,
        skipAuth: true,
      });
      if (myEpoch !== this._epoch) {
        // 请求已过期（期间发生了新的 reset 加载），整体丢弃，不触碰当前状态
        return;
      }
      const newItems = res.items.map((it) => this.toDisplay(it));
      if (reset) {
        this.setData({
          items: newItems,
          total: res.total,
          page,
          noMore: newItems.length >= res.total,
        });
      } else {
        // 翻页追加：索引路径局部 setData，payload 不随累计页数增长（同 projects/list）
        const patch: Record<string, unknown> = {
          total: res.total,
          page,
          noMore: this.data.items.length + newItems.length >= res.total,
        };
        const base = this.data.items.length;
        newItems.forEach((it, i) => {
          patch[`items[${base + i}]`] = it;
        });
        this.setData(patch);
      }
    } catch {
      if (myEpoch !== this._epoch) {
        // 过期请求的失败不回滚页码、不弹 toast
        return;
      }
      if (reset) {
        this.setData({ error: true, items: [] });
      } else {
        // 翻页失败：回滚页码并重置 noMore，避免下次触底被 noMore 拦截（同 projects/list）
        this.setData({ page: Math.max(1, page - 1), noMore: false });
        wx.showToast({ title: "加载失败，请重试", icon: "none" });
      }
    } finally {
      if (myEpoch === this._epoch) {
        this.setData({ loading: false, loadingMore: false });
      }
    }
  },

  /** 列表项 → 展示结构（封面降级 + 描述拼接）. */
  toDisplay(item: PublicProjectListItem): DisplayItem {
    return {
      id: item.id,
      title: item.title,
      meta: [item.community_name || "", item.layout, `${item.area}㎡`]
        .filter(Boolean)
        .join(" · "),
      totalPrice: item.total_price,
      cover: resolveImageUrl(item.cover_thumbnail_url || item.cover_image),
    };
  },

  // ===== 搜索 =====

  /** 输入即更新展示值；300ms 防抖后生效关键词并重载第 1 页. */
  onSearchInput(e: WechatMiniprogram.Input) {
    this.setData({ searchValue: e.detail.value });
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      const kw = this.data.searchValue.trim();
      if (kw === this.data.keyword) {
        // 关键词未变化（如清空回原态）：不重复请求
        return;
      }
      this.setData({ keyword: kw });
      this.loadList(true);
    }, SEARCH_DEBOUNCE_MS);
  },

  /** 键盘确认：立即生效关键词（取消未触发的防抖）. */
  onSearchConfirm() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    const kw = this.data.searchValue.trim();
    this.setData({ keyword: kw });
    this.loadList(true);
  },

  // ===== 勾选 =====

  /** 点击卡片切换选中（保序记录 id）；超出上限 toast 并阻止. */
  onCardTap(e: WechatMiniprogram.BaseEvent) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id) {
      return;
    }
    const idx = this.selectedOrder.indexOf(id);
    if (idx >= 0) {
      // 取消选中：移除记录与映射
      this.selectedOrder.splice(idx, 1);
      const selectedMap = { ...this.data.selectedMap };
      delete selectedMap[String(id)];
      this.setData({ selectedMap, selectedCount: this.selectedOrder.length });
      return;
    }
    if (this.selectedOrder.length >= MAX_SELECTED) {
      wx.showToast({ title: `最多选择 ${MAX_SELECTED} 套`, icon: "none" });
      return;
    }
    this.selectedOrder.push(id);
    this.setData({
      selectedMap: { ...this.data.selectedMap, [String(id)]: true },
      selectedCount: this.selectedOrder.length,
    });
  },

  // ===== 创建 =====

  /** 创建房源单：POST project_ids（按勾选顺序），成功 redirectTo 详情页. */
  async onCreate() {
    if (this.data.submitting || this.selectedOrder.length === 0) {
      return;
    }
    this.setData({ submitting: true });
    try {
      const res = await request<PropertySheetResponse>({
        url: "/public/property-sheets",
        method: "POST",
        data: { project_ids: this.selectedOrder },
      });
      wx.redirectTo({ url: `/pages/property-sheet/detail/index?sheet_id=${res.id}` });
    } catch (err) {
      const statusCode = (err as HttpResponseError).statusCode;
      const body = (err as HttpResponseError).body as
        | { message?: string; detail?: string }
        | null
        | undefined;
      let msg = "创建失败，请重试";
      if (statusCode === HTTP_UNAUTHORIZED) {
        // 401（未登录/令牌失效）：提示先登录，不清登录态（对齐 projects/mine 兜底口径）
        msg = UNAUTHORIZED_TIP;
      } else if (body?.message) {
        // 后端业务校验错误（如含非在售房源）：透出后端 message
        msg = body.message;
      } else if (typeof body?.detail === "string") {
        msg = body.detail;
      }
      wx.showToast({ title: msg, icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },

  /** 错误态重试. */
  onRetry() {
    this.loadList(true);
  },

  /** 触底加载下一页. */
  onReachBottom() {
    if (this.data.loading || this.data.loadingMore || this.data.noMore || this.data.error) {
      return;
    }
    this.setData({ page: this.data.page + 1 });
    this.loadList(false);
  },
});
