import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import {
  buildTrendChartData,
  buildTrendLegend,
  drawTrendChart,
  granularityFromRange,
} from "../utils/trend-chart";
import type { TrendGranularity } from "../utils/trend-chart";
import {
  buildDistViews,
  buildKpiViews,
  buildTrendTable,
} from "../utils/report-views";
import type { DistView, KpiView, TrendTableRow } from "../utils/report-views";
import {
  DEFAULT_DIST_MODE,
  DEFAULT_RANGE,
  DEFAULT_TREND_DIM,
  DEFAULT_TREND_MODE,
  DISCLAIMER_TEXT,
  EMPTY_COMMUNITY_TEXT,
  MODE_OPTIONS,
  RANGE_OPTIONS,
  SAMPLE_COMMUNITY_NAME,
  SAMPLE_CTA_DESC,
  SAMPLE_CTA_TITLE,
  SAMPLE_FLOOR_DIST,
  SAMPLE_KPI,
  SAMPLE_MAIN_LAYOUT,
  SAMPLE_PRICE_DIST,
  SAMPLE_ROOMS_DIST,
  SAMPLE_TREND,
  TREND_DIM_OPTIONS,
} from "./constants";
import type { FilterKey } from "./constants";

type KpiData = components["schemas"]["KpiData"];
type TrendDataPoint = components["schemas"]["TrendDataPoint"];
type PriceDistributionResponse = components["schemas"]["PriceDistributionResponse"];
type DistributionResponse = components["schemas"]["DistributionResponse"];
type PublicCommunitySearchItem = components["schemas"]["PublicCommunitySearchItem"];
type PublicCommunityAnalysisResponse = components["schemas"]["PublicCommunityAnalysisResponse"];

/** 鉴权态（C 端仅区分 ok/unauthorized）. */
type AuthState = "ok" | "unauthorized";

/** 范围面板单选视图. */
export interface OptionView {
  value: string;
  label: string;
  selected: boolean;
}

/**
 * 微信 onLoad 的 query 参数不会被框架 URL 解码（实测收到的是 navigateTo 时
 * encodeURIComponent 后的编码串），此处显式解码一次：
 * - 已是中文等无 `%` 序列的串：decodeURIComponent 为 no-op，安全；
 * - 编码串（如 %E9%80%9A...）：解码回原文；
 * - 含非法 `%` 序列：抛错回退原值.
 */
function decodeQueryParam(value: string | undefined): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

/** 范围面板单选视图. */
function buildRangeViews(draft: string): OptionView[] {
  return RANGE_OPTIONS.map((o) => ({ value: o.value, label: o.label, selected: o.value === draft }));
}

/** 页面 data. */
interface PageData {
  // 模式与小区
  mode: string;
  isSample: boolean;
  communityName: string;
  communityId: string;
  mainLayout: string;
  // 状态
  loading: boolean;
  error: boolean;
  authState: AuthState;
  empty: boolean;
  emptyText: string;
  emptyAll: boolean;
  // 已生效筛选
  range: string;
  rangeLabel: string;
  trendDim: string;
  trendMode: string;
  priceMode: string;
  roomsFloorMode: string;
  // 筛选 UI
  activeFilter: FilterKey;
  draftRange: string;
  rangeViews: OptionView[];
  // 选项
  trendDimOptions: { value: string; label: string }[];
  modeOptions: { value: string; label: string }[];
  // 文案
  ctaTitle: string;
  ctaDesc: string;
  disclaimerText: string;
  // 原始数据（视图重建源）
  kpi: KpiData | null;
  trend: TrendDataPoint[];
  priceDist: PriceDistributionResponse | null;
  roomsDist: DistributionResponse | null;
  floorDist: DistributionResponse | null;
  // 趋势展示
  trendGranularity: TrendGranularity;
  trendTableRows: TrendTableRow[];
  trendLegend: { label: string; color: string }[];
  // 分布展示
  priceRows: DistView[];
  priceTotalText: string;
  priceEmpty: boolean;
  roomsRows: DistView[];
  floorRows: DistView[];
  roomsEmpty: boolean;
  floorEmpty: boolean;
  // KPI 视图
  kpiViews: KpiView[];
}

/** 页面自定义成员（方法 + 实例字段）. */
interface PageCustom {
  loadData(): void;
  loadSampleData(): void;
  loadAnalysis(silent?: boolean): void;
  handleLoadError(err: unknown): void;
  applyDisplays(): void;
  applyTrendViews(): void;
  applyDistViews(): void;
  scheduleTrendDraw(): void;
  drawTrend(): void;
  onFilterChipTap(e: WechatMiniprogram.BaseEvent): void;
  onMaskTap(): void;
  onRangeOptionTap(e: WechatMiniprogram.BaseEvent): void;
  onRangeReset(): void;
  onRangeConfirm(): void;
  onTrendDimChange(e: WechatMiniprogram.BaseEvent): void;
  onTrendModeChange(e: WechatMiniprogram.BaseEvent): void;
  onPriceModeChange(e: WechatMiniprogram.BaseEvent): void;
  onRoomsFloorModeChange(e: WechatMiniprogram.BaseEvent): void;
  onRetry(): void;
  onGoBack(): void;
  onCtaTap(): void;
}

/** canvas 节点信息（fields 回调的 node/size 子集）. */
interface CanvasNodeInfo {
  width: number;
  height: number;
  node: WechatMiniprogram.Canvas;
}

// 页面编排留在本文件：data 默认值 + Page 生命周期/事件方法为 Page 结构要求的回调绑定，
// 无法再拆分；纯逻辑已拆至 ../utils/report-views.ts（视图构建）与 ../utils/trend-chart.ts（canvas 绘制），
// 常量在 constants.ts。index.ts + constants.ts 略超 500 行，理由见上（不拆）。
Page<PageData, PageCustom>({
  data: {
    mode: "real",
    isSample: false,
    communityName: "",
    communityId: "",
    mainLayout: "",
    loading: false,
    error: false,
    authState: "ok",
    empty: false,
    emptyText: "",
    emptyAll: false,
    range: DEFAULT_RANGE,
    rangeLabel: "近12个月",
    trendDim: DEFAULT_TREND_DIM,
    trendMode: DEFAULT_TREND_MODE,
    priceMode: DEFAULT_DIST_MODE,
    roomsFloorMode: DEFAULT_DIST_MODE,
    activeFilter: "",
    draftRange: DEFAULT_RANGE,
    rangeViews: buildRangeViews(DEFAULT_RANGE),
    trendDimOptions: TREND_DIM_OPTIONS,
    modeOptions: MODE_OPTIONS,
    ctaTitle: SAMPLE_CTA_TITLE,
    ctaDesc: SAMPLE_CTA_DESC,
    disclaimerText: DISCLAIMER_TEXT,
    kpi: null,
    trend: [],
    priceDist: null,
    roomsDist: null,
    floorDist: null,
    trendGranularity: "month",
    trendTableRows: [],
    trendLegend: [],
    priceRows: [],
    priceTotalText: "0",
    priceEmpty: false,
    roomsRows: [],
    floorRows: [],
    roomsEmpty: false,
    floorEmpty: false,
    kpiViews: [],
  },

  onLoad(query: Record<string, string | undefined>) {
    const mode = query.mode || "real";
    const communityName = decodeQueryParam(query.community_name);
    this.setData({ mode, isSample: mode === "sample", communityName });
    this.loadData();
  },

  onReady() {
    this.scheduleTrendDraw();
  },

  loadData() {
    if (this.data.isSample) {
      this.loadSampleData();
      return;
    }
    this.setData({ loading: true, error: false, authState: "ok", empty: false, emptyAll: false });
    request<PublicCommunitySearchItem[]>({
      url: "/public/communities/search",
      data: { q: this.data.communityName, limit: 20 },
      skipAuth: true,
    })
      .then((items) => {
        const name = this.data.communityName;
        const item = items.find((it) => it.name === name) ?? items[0];
        if (!item) {
          // 无结果 → 空态「暂不支持该小区市场分析」
          this.setData({ loading: false, empty: true, emptyText: EMPTY_COMMUNITY_TEXT });
          return;
        }
        this.setData({ communityId: item.id, communityName: item.name });
        this.loadAnalysis();
      })
      .catch((err: unknown) => {
        this.setData({ loading: false });
        this.handleLoadError(err);
      });
  },

  loadSampleData() {
    // 不触发任何后端请求、不校验登录：直接渲染内置静态示例数据
    this.setData({
      communityId: "",
      communityName: SAMPLE_COMMUNITY_NAME,
      mainLayout: SAMPLE_MAIN_LAYOUT,
      kpi: SAMPLE_KPI,
      trend: SAMPLE_TREND,
      priceDist: SAMPLE_PRICE_DIST,
      roomsDist: SAMPLE_ROOMS_DIST,
      floorDist: SAMPLE_FLOOR_DIST,
      loading: false,
      error: false,
      authState: "ok",
      empty: false,
      emptyAll: false,
    });
    this.applyDisplays();
    this.setData({ loading: false }, () => {
      if (this.data.trendMode === "chart" && !this.data.emptyAll) {
        this.scheduleTrendDraw();
      }
    });
  },

  async loadAnalysis(silent?: boolean) {
    const id = this.data.communityId;
    if (!id) return;
    if (!silent) {
      // 范围变化/首次加载：显示骨架屏；趋势维度切换静默重拉（保持内容可见，与 analysis 页一致）
      this.setData({ loading: true, error: false, authState: "ok", empty: false, emptyAll: false });
    }
    try {
      // /public/* 自动注入 c_access_token，勿 skipAuth
      const res = await request<PublicCommunityAnalysisResponse>({
        url: `/public/communities/${id}/analysis`,
        data: { range: this.data.range, trend_dim: this.data.trendDim },
      });
      this.setData({
        kpi: res.kpi,
        trend: res.trend,
        priceDist: res.price_distribution,
        roomsDist: res.rooms_distribution,
        floorDist: res.floor_distribution,
        mainLayout: res.main_layout ?? "",
      });
      this.applyDisplays();
    } catch (err) {
      this.handleLoadError(err);
    } finally {
      // loading 置 false 后 canvas 才渲染，需在渲染完成后重绘
      this.setData({ loading: false }, () => {
        if (this.data.trendMode === "chart" && !this.data.emptyAll) {
          this.scheduleTrendDraw();
        }
      });
    }
  },

  handleLoadError(err: unknown) {
    const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
    if (statusCode === 401) {
      // 登录失效：清除 C 端令牌 + 登录失效态
      wx.removeStorageSync("c_access_token");
      wx.removeStorageSync("c_refresh_token");
      this.setData({ authState: "unauthorized", error: false });
    } else {
      this.setData({ error: true, authState: "ok" });
    }
  },

  applyDisplays() {
    const priceDist = this.data.priceDist;
    const emptyAll = !priceDist || priceDist.total === 0;
    this.setData({
      kpiViews: this.data.kpi ? buildKpiViews(this.data.kpi) : [],
      emptyAll,
    });
    this.applyTrendViews();
    this.applyDistViews();
  },

  applyTrendViews() {
    const granularity = granularityFromRange(this.data.range);
    const chartData = buildTrendChartData(this.data.trend, granularity, this.data.trendDim);
    this.setData({
      trendGranularity: granularity,
      trendTableRows: buildTrendTable(this.data.trend, granularity, this.data.trendDim),
      trendLegend: buildTrendLegend(chartData),
    });
  },

  applyDistViews() {
    const price = this.data.priceDist;
    const rooms = this.data.roomsDist;
    const floor = this.data.floorDist;
    const priceView = buildDistViews(price?.buckets ?? [], price?.total ?? 0);
    const roomsView = buildDistViews(rooms?.buckets ?? [], rooms?.total ?? 0);
    const floorView = buildDistViews(floor?.buckets ?? [], floor?.total ?? 0);
    this.setData({
      priceRows: priceView.rows,
      priceTotalText: priceView.totalText,
      priceEmpty: priceView.empty,
      roomsRows: roomsView.rows,
      floorRows: floorView.rows,
      roomsEmpty: roomsView.empty,
      floorEmpty: floorView.empty,
    });
  },

  scheduleTrendDraw() {
    wx.nextTick(() => this.drawTrend());
  },

  drawTrend() {
    const query = wx.createSelectorQuery().in(this);
    query.select("#trendCanvas").fields({ node: true, size: true }).exec((res) => {
      const info = (res && res[0]) as CanvasNodeInfo | undefined;
      if (!info || !info.node || !info.width || !info.height) return;
      const canvas = info.node;
      const ctx = canvas.getContext("2d") as WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
      const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio) || 2;
      canvas.width = info.width * dpr;
      canvas.height = info.height * dpr;
      ctx.scale(dpr, dpr);
      const chartData = buildTrendChartData(this.data.trend, this.data.trendGranularity, this.data.trendDim);
      drawTrendChart(ctx, info.width, info.height, chartData);
    });
  },

  onFilterChipTap(e: WechatMiniprogram.BaseEvent) {
    const key = e.currentTarget.dataset.key as FilterKey;
    if (!key) return;
    if (this.data.activeFilter === key) {
      this.setData({ activeFilter: "" });
      return;
    }
    this.setData({
      activeFilter: key,
      draftRange: this.data.range,
      rangeViews: buildRangeViews(this.data.range),
    });
  },

  onMaskTap() {
    this.setData({ activeFilter: "" });
  },

  onRangeOptionTap(e: WechatMiniprogram.BaseEvent) {
    const value = e.currentTarget.dataset.value as string;
    this.setData({ draftRange: value, rangeViews: buildRangeViews(value) });
  },

  onRangeReset() {
    this.setData({ draftRange: DEFAULT_RANGE, rangeViews: buildRangeViews(DEFAULT_RANGE) });
  },

  onRangeConfirm() {
    const range = this.data.draftRange;
    if (range === this.data.range) {
      this.setData({ activeFilter: "" });
      return;
    }
    const label = RANGE_OPTIONS.find((o) => o.value === range)?.label ?? "近12个月";
    this.setData({
      range,
      rangeLabel: label,
      activeFilter: "",
      emptyAll: false,
      error: false,
      authState: "ok",
    });
    // 范围变化 → 仅重拉分析端点
    this.loadAnalysis();
  },

  onTrendDimChange(e: WechatMiniprogram.BaseEvent) {
    const value = e.currentTarget.dataset.value as string;
    if (value === this.data.trendDim) return;
    this.setData({ trendDim: value });
    if (this.data.isSample) {
      // 示例数据内置 dim_breakdown：本地重建视图即可
      this.applyTrendViews();
      if (this.data.trendMode === "chart") {
        this.scheduleTrendDraw();
      }
    } else {
      // real 模式：趋势维度是分析端点参数，仅重拉该端点（静默，保持内容可见）
      this.loadAnalysis(true);
    }
  },

  onTrendModeChange(e: WechatMiniprogram.BaseEvent) {
    const value = e.currentTarget.dataset.value as string;
    if (value === this.data.trendMode) return;
    this.setData({ trendMode: value }, () => {
      if (value === "chart") this.scheduleTrendDraw();
    });
  },

  onPriceModeChange(e: WechatMiniprogram.BaseEvent) {
    const value = e.currentTarget.dataset.value as string;
    if (value === this.data.priceMode) return;
    this.setData({ priceMode: value });
  },

  onRoomsFloorModeChange(e: WechatMiniprogram.BaseEvent) {
    const value = e.currentTarget.dataset.value as string;
    if (value === this.data.roomsFloorMode) return;
    this.setData({ roomsFloorMode: value });
  },

  onRetry() {
    this.setData({ authState: "ok", error: false });
    this.loadData();
  },

  onGoBack() {
    wx.navigateBack();
  },

  onCtaTap() {
    wx.switchTab({ url: "/pages/valuation/submit/index" });
  },
});
