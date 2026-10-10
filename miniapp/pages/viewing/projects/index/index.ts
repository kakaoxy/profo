/**
 * 「我负责的项目」落地页（profile 页「带看记录」内部入口的落地页）.
 *
 * 调用 GET /projects?status=selling（主通道，403 回退 my-responsible）拉取项目列表，
 * 点击某项目进入单项目销售记录详情页。401（令牌失效）→ 清空令牌切「登录已失效」；
 * 403（无权限）→ 展示无权限态不清令牌.
 *
 * 页面逻辑由 createProjectListPage 工厂统一处理（主/回退双通道 + 排序 + 状态机），
 * 本文件另提供指标 hero 区扩展（设计稿 docs/2026-10-10）：三指标聚合 + ⓘ 弹层
 * + 「带看记录」明细页链接，hero 数据独立取数独立降级，不阻塞列表。
 */
import type { components } from "../../../../types/api-types";
import { request, getCacheData } from "../../../../utils/request";
import { pad2 } from "../../../../utils/format";
import { createProjectListPage } from "../../utils/project-list-page";
import type { BaseDisplayItem, ProjectListState } from "../../utils/project-list-page";
import { parseSalesRecords } from "../../utils/sales-records";
import { cycleStart, isInCycle } from "../../../../utils/cycle-period";

/** 增量徽标文案：恒显示 +N（含 +0，与项目卡角标同色同字号）；≥100 显示 +99+ 防三列挤压（设计稿 STATES 表）. */
function deltaText(n: number): string {
  return `+${n >= 100 ? "99+" : n}`;
}

/** /projects/sales-summary → hero 渲染模型（徽标/文案在 TS 侧拼好，wxml 只做渲染）. */
interface SummaryDisplay {
  viewingCount: number;
  offerCount: number;
  negotiationCount: number;
  /** 带看周期增量徽标文案（+N，含 +0；≥100 显示 +99+）. */
  viewingDeltaText: string;
  offerDeltaText: string;
  negotiationDeltaText: string;
  /** 周期窗口文案（后端直出，前端不做周期推算）. */
  periodText: string;
}

/** hero 指标聚合 SWR 缓存 key（独立于列表，失败静默隐藏整卡不阻塞列表）. */
const SUMMARY_CACHE_KEY_PREFIX = "viewing_sales_summary";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type RecordType = components["schemas"]["RecordType"];
type SalesSummaryResponse = components["schemas"]["SalesSummaryResponse"];

/** 列表项展示用统一结构. */
interface DisplayItem extends BaseDisplayItem {
  /** 最高出价金额文案（万元），无有效出价时为「暂无」 */
  maxOfferText: string;
  /** 是否存在有效出价（控制第一行是否用强调色，避免「暂无」被强调） */
  hasOffer: boolean;
  /** 最高出价对应时间（YYYY-MM-DD），无有效出价时为 "" */
  offerTimeText: string;
  viewingCount: number;
  offerCount: number;
  negotiationCount: number;
  /** 本周期（周二 00:00 起）新增带看数，角标显示为 +N（含 +0） */
  viewingDelta: number;
  /** 本周期新增出价数 */
  offerDelta: number;
  /** 本周期新增面谈数 */
  negotiationDelta: number;
}

/** 页面 data. */
interface PageData {
  state: ProjectListState;
  items: DisplayItem[];
  page: number;
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  /** 指标 hero 渲染模型；summary 加载失败时为 null（整卡隐藏）. */
  summary: SummaryDisplay | null;
  /** ⓘ 周期说明弹层是否展开. */
  summaryPopOpen: boolean;
}

/** 页面自定义方法. */
interface PageCustom {
  getToken(): string;
  clearToken(): void;
  loadList(): void;
  loadResponsible(token: string): void;
  applyItems(projects: ProjectResponse[], mode: "replace" | "append"): void;
  /** 指标 hero 取数（独立降级：失败静默隐藏整卡，不阻塞列表）. */
  loadSummary(token: string): void;
  /** ⓘ 周期说明弹层开/收. */
  onToggleSummaryPop(): void;
  /** 跳转带看记录明细页（时间降序全部记录明细）. */
  onSalesRecords(): void;
  onItemTap(e: WechatMiniprogram.BaseEvent): void;
  onRetry(): void;
  onGoLogin(): void;
}

/**
 * 按记录类型统计项目销售记录数.
 * @param sinceMs 可选起始毫秒时间戳：只统计 record_date ≥ sinceMs 的记录（周期新增角标用），
 *                缺省统计全量（与卡片主计数同源）。非法 record_date（Date.parse → NaN）
 *                恒不满足 ≥ 比较，天然不计入。
 */
function countByType(project: ProjectResponse, type: RecordType, sinceMs?: number): number {
  return parseSalesRecords(project.sales_records).filter((r) => {
    if (r.record_type !== type) {
      return false;
    }
    return sinceMs === undefined || isInCycle(Date.parse(r.record_date), sinceMs);
  }).length;
}

/** 最高出价（万元数值）与对应 record_date；无有效出价返回 null. */
function topOfferOf(project: ProjectResponse): { price: number; date: string } | null {
  let top: { price: number; date: string } | null = null;
  let topTime = -Infinity;
  for (const r of parseSalesRecords(project.sales_records)) {
    if (r.record_type !== "offer") {
      continue;
    }
    const price = Number(r.price);
    // 与详情页一致：未填/非法/非正数不计入最高出价
    if (!Number.isFinite(price) || price <= 0) {
      continue;
    }
    const t = Date.parse(r.record_date);
    const time = Number.isNaN(t) ? -Infinity : t;
    // 同价取较新的一条（时间不可解析视为最早）
    if (!top || price > top.price || (price === top.price && time > topTime)) {
      top = { price, date: r.record_date };
      topTime = time;
    }
  }
  return top;
}

/** record_date → YYYY-MM-DD（本地时区）；非法时间兜底「—」（对齐详情页）. */
function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "—";
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * 页面配置：共享列表工厂（主/回退双通道 + 状态机）+ hero 区扩展浅合并.
 *
 * hero 扩展不进工厂（renovation 页不用），页面侧对工厂返回对象浅合并：
 * data 追加 summary/summaryPopOpen，onShow 追加 loadSummary，另有 ⓘ 弹层
 * 开/收与「带看记录」跳转（设计稿口径③⑦）。
 */
const listPage = createProjectListPage<DisplayItem>({
  status: "selling",
  detailRoute: "/pages/viewing/detail/index/index",
  toDisplay(project) {
    const top = topOfferOf(project);
    // 周期起点（本周二 00:00；周一为上周二）取一次，同屏卡片口径一致
    const cycleStartMs = cycleStart().getTime();
    return {
      id: project.id,
      name: project.address ?? project.community_name ?? "未命名项目",
      maxOfferText: top ? `${top.price}万` : "暂无",
      hasOffer: top !== null,
      offerTimeText: top ? formatDay(top.date) : "",
      viewingCount: countByType(project, "viewing"),
      offerCount: countByType(project, "offer"),
      negotiationCount: countByType(project, "negotiation"),
      viewingDelta: countByType(project, "viewing", cycleStartMs),
      offerDelta: countByType(project, "offer", cycleStartMs),
      negotiationDelta: countByType(project, "negotiation", cycleStartMs),
    };
  },
});

Page<PageData, PageCustom>({
  ...listPage,
  data: {
    ...listPage.data,
    /** 指标 hero 渲染模型；summary 加载失败时为 null（整卡隐藏）. */
    summary: null,
    /** ⓘ 周期说明弹层是否展开. */
    summaryPopOpen: false,
  },

  onShow() {
    this.loadList();
    // hero 取数与列表并行独立：无令牌时静默跳过（列表态会呈现登录失效）
    const token = this.getToken();
    if (token) {
      this.loadSummary(token);
    }
  },

  /** hero 取数：独立于列表请求，失败静默隐藏整卡（不进列表 error 态）.
   *
   * SWR 同策略：缓存先渲染再静默刷新，避免每次进入闪空.
   * 端点范围收敛在后端（resolve_scope 与列表双通道同口径），前端只透传令牌.
   */
  loadSummary(token) {
    const cacheKey = `${SUMMARY_CACHE_KEY_PREFIX}:${token}`;
    const cached = getCacheData<SalesSummaryResponse>(cacheKey);
    if (cached) {
      this.setData({ summary: toSummaryDisplay(cached) });
    }
    request<SalesSummaryResponse>({
      url: "/projects/sales-summary",
      header: { Authorization: `Bearer ${token}` },
      cacheKey,
    })
      .then((data) => {
        this.setData({ summary: toSummaryDisplay(data), summaryPopOpen: false });
      })
      .catch(() => {
        // 设计稿降级口径：summary 失败 hero 整卡隐藏；无缓存时不再保留旧数据
        if (!cached) {
          this.setData({ summary: null, summaryPopOpen: false });
        }
      });
  },

  /** ⓘ 弹层开/收（catchtap 阻断冒泡；点外部收起由蒙层 catchtap 链路覆盖）. */
  onToggleSummaryPop() {
    this.setData({ summaryPopOpen: !this.data.summaryPopOpen });
  },

  /** 卡底「带看记录」链接 → 时间降序明细页（ARTBOARD 03）. */
  onSalesRecords() {
    wx.navigateTo({ url: "/pages/viewing/records/index" });
  },
});

/** SalesSummaryResponse → hero 渲染模型（模块级纯函数，与 keys/list toSummaryDisplay 同构）. */
function toSummaryDisplay(data: SalesSummaryResponse): SummaryDisplay {
  return {
    viewingCount: data.viewing_total,
    offerCount: data.offer_total,
    negotiationCount: data.negotiation_total,
    viewingDeltaText: deltaText(data.period_new_viewing),
    offerDeltaText: deltaText(data.period_new_offer),
    negotiationDeltaText: deltaText(data.period_new_negotiation),
    periodText: data.period.text,
  };
}
