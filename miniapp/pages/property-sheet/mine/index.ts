/**
 * 房源单分享 · 我的房源单页.
 *
 * 页面职责：
 * - 统计卡：今日/累计两行漏斗 × 分享次数/打开 PV/访客 UV/留资
 *   （留资列以 Rust 强调，数据源 /public/property-sheets/my/share-stats）
 * - 房源单列表：名称「精选房源单」/ 创建时间（相对格式）/ 共 N 套 / 分享短码胶囊；
 *   数据源 GET /public/property-sheets/mine；点击进详情，长按确认删除（软删）后刷新
 * - 未登录不发请求；401（令牌失效）统一空态兜底（不清登录态、不报错）
 * - 空态判定：累计漏斗全零且列表为空才整页空态；
 *   有分享数据但暂无房源单 → 保留统计卡 + 列表区空文案引导创建
 */
import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import type { HttpResponseError } from "../../../utils/request";
import { getAccessToken, getCAccessToken } from "../../../utils/token";
import { formatLeadTime } from "../../../utils/recruit-logic";

type PublicShareStatsResponse = components["schemas"]["PublicShareStatsResponse"];
type PropertySheetMineItemResponse = components["schemas"]["PropertySheetMineItemResponse"];
type PropertySheetMineListResponse = components["schemas"]["PropertySheetMineListResponse"];

/** 未登录/无 C 端身份（401）：统一空态兜底，不清登录态、不报错. */
const HTTP_UNAUTHORIZED = 401;

/** 分享漏斗统计展示结构（累计 + 今日两行；空态判定仅用累计字段）. */
interface ShareStatsDisplay {
  shareCount: number;
  pv: number;
  uv: number;
  leadCount: number;
  todayShareCount: number;
  todayPv: number;
  todayUv: number;
  todayLeadCount: number;
}

/** 房源单列表项展示结构（wxml 渲染用）. */
interface SheetDisplay {
  /** 房源单 ID（列表 key / 详情与删除参数）. */
  id: number;
  /** 8 位分享短码（等宽胶囊展示）. */
  code: string;
  /** 房源明细数. */
  itemCount: number;
  /** 创建时间（相对格式：今天/昨天/MM-DD HH:mm）. */
  timeText: string;
}

interface PageData {
  stats: ShareStatsDisplay;
  sheets: SheetDisplay[];
  loading: boolean;
  /** 游客/暂无任何数据：统一空态展示（统计卡与列表均不渲染）. */
  empty: boolean;
  /** 删除请求进行中（防重复触发）. */
  deleting: boolean;
}

interface PageCustom {
  hasToken(): boolean;
  loadAll(silent?: boolean): Promise<void>;
  loadStats(): Promise<void>;
  loadSheets(silent?: boolean): Promise<void>;
  toDisplay(item: PropertySheetMineItemResponse): SheetDisplay;
  onSheetTap(e: WechatMiniprogram.BaseEvent): void;
  onSheetLongPress(e: WechatMiniprogram.BaseEvent): void;
  onSheetDelete(e: WechatMiniprogram.BaseEvent): void;
  confirmDelete(id: number): void;
  deleteSheet(id: number): Promise<void>;
  onGoCreate(): void;
  onPullDownRefresh(): void;
  /** 首次加载完成标志（避免 onShow 重复首载；返回本页时走静默刷新）. */
  initialLoaded?: boolean;
}

Page<PageData, PageCustom>({
  data: {
    stats: {
      shareCount: 0,
      pv: 0,
      uv: 0,
      leadCount: 0,
      todayShareCount: 0,
      todayPv: 0,
      todayUv: 0,
      todayLeadCount: 0,
    },
    sheets: [],
    loading: false,
    empty: false,
    deleting: false,
  },

  hasToken() {
    return !!getCAccessToken() || !!getAccessToken();
  },

  onShow() {
    if (this.initialLoaded) {
      // 返回本页（如从详情/创建页返回）：静默刷新统计与列表
      this.loadAll(true);
      return;
    }
    this.initialLoaded = true;
    if (!this.hasToken()) {
      // 游客：不发请求，直接展示空态
      this.setData({ empty: true });
      return;
    }
    this.loadAll();
  },

  /** 并行加载统计与房源单列表（互不依赖，消除请求瀑布），并统一判定空态. */
  async loadAll(silent = false) {
    if (!this.hasToken()) {
      this.setData({ sheets: [], empty: true, loading: false });
      return;
    }
    if (!silent && this.data.sheets.length === 0) {
      this.setData({ loading: true });
    }
    await Promise.all([this.loadStats(), this.loadSheets(silent)]);
    const { stats, sheets } = this.data;
    // 空态判定基于累计漏斗字段
    const allZero =
      stats.shareCount === 0 && stats.pv === 0 && stats.uv === 0 && stats.leadCount === 0;
    this.setData({
      loading: false,
      empty: allZero && sheets.length === 0,
    });
  },

  /** 分享漏斗统计（今日 + 累计）；失败（401/网络）保持 0，由 loadAll 统一判定空态. */
  async loadStats() {
    try {
      const res = await request<PublicShareStatsResponse>({
        url: "/public/property-sheets/my/share-stats",
      });
      this.setData({
        stats: {
          shareCount: res.share_count || 0,
          pv: res.pv || 0,
          uv: res.uv || 0,
          leadCount: res.lead_count || 0,
          todayShareCount: res.today_share_count || 0,
          todayPv: res.today_pv || 0,
          todayUv: res.today_uv || 0,
          todayLeadCount: res.today_lead_count || 0,
        },
      });
    } catch {
      // 401（无 C 端身份）/网络异常：静默
    }
  },

  /**
   * 拉取我的房源单列表（后端一次返回全量，创建时间倒序）.
   * silent=静默刷新（失败不弹 toast，避免刷新打断浏览）.
   */
  async loadSheets(silent = false) {
    try {
      const res = await request<PropertySheetMineListResponse>({
        url: "/public/property-sheets/mine",
      });
      this.setData({
        sheets: (res.items || []).map((it) => this.toDisplay(it)),
      });
    } catch (err) {
      const statusCode = (err as HttpResponseError).statusCode;
      if (statusCode === HTTP_UNAUTHORIZED) {
        // 401（未登录/令牌失效，request 已自动尝试刷新仍失败）：
        // 清空列表走空态兜底，不清登录态、不报「加载失败」
        this.setData({ sheets: [] });
        return;
      }
      if (!silent) {
        wx.showToast({ title: "加载失败，请重试", icon: "none" });
      }
    }
  },

  /** 房源单列表项 → 展示结构（相对时间格式化）. */
  toDisplay(item: PropertySheetMineItemResponse): SheetDisplay {
    return {
      id: item.id,
      code: item.code,
      itemCount: item.item_count,
      timeText: formatLeadTime(item.created_at),
    };
  },

  /** 点击列表项进入房源单详情页. */
  onSheetTap(e: WechatMiniprogram.BaseEvent) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id) {
      return;
    }
    wx.navigateTo({ url: `/pages/property-sheet/detail/index?sheet_id=${id}` });
  },

  /** 长按列表项：进入删除确认（与删除按钮共用）. */
  onSheetLongPress(e: WechatMiniprogram.BaseEvent) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id || this.data.deleting) {
      return;
    }
    this.confirmDelete(id);
  },

  /** 点击卡片上的「删除」按钮：进入删除确认（与长按共用）. */
  onSheetDelete(e: WechatMiniprogram.BaseEvent) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id || this.data.deleting) {
      return;
    }
    this.confirmDelete(id);
  },

  /** 删除确认弹窗，确认后软删该房源单. */
  confirmDelete(id: number) {
    wx.showModal({
      title: "删除房源单",
      content: "删除后该房源单的二维码将失效，确认删除？",
      confirmText: "删除",
      confirmColor: "#17191c",
      success: (res) => {
        if (res.confirm) {
          this.deleteSheet(id);
        }
      },
    });
  },

  /** 删除房源单（DELETE 返回 204 无响应体）：成功 toast 后静默刷新统计与列表. */
  async deleteSheet(id: number) {
    if (this.data.deleting) {
      return;
    }
    this.setData({ deleting: true });
    wx.showLoading({ title: "删除中…", mask: true });
    try {
      await request<void>({
        url: `/public/property-sheets/${id}`,
        method: "DELETE",
      });
      wx.hideLoading();
      wx.showToast({ title: "已删除", icon: "success" });
      await this.loadAll(true);
    } catch {
      wx.hideLoading();
      wx.showToast({ title: "删除失败，请重试", icon: "none" });
    } finally {
      this.setData({ deleting: false });
    }
  },

  /** 底部「新建房源单」：进入创建页. */
  onGoCreate() {
    wx.navigateTo({ url: "/pages/property-sheet/create/index" });
  },

  /** 下拉刷新：静默重拉统计与列表，完成后停止刷新动画. */
  async onPullDownRefresh() {
    await this.loadAll(true);
    wx.stopPullDownRefresh();
  },
});
