/**
 * 「我负责的项目」落地页（profile 页「带看记录」内部入口的落地页）.
 *
 * 仅内部员工（admin 令牌）可访问：调用 GET /projects/my-responsible 拉取
 * 当前用户负责的项目列表，点击某项目进入单项目销售记录详情页。
 * 401（令牌失效）→ 清空令牌切「登录已失效」；403（无权限）→ 展示无权限态不清令牌.
 *
 * 页面逻辑由 createProjectListPage 工厂统一处理（主/回退双通道 + 排序 + 状态机），
 * 本文件仅提供 status 过滤、详情路由与展示项转换三个差异点。
 */
import type { components } from "../../../../types/api-types";
import { pad2 } from "../../../../utils/format";
import { createProjectListPage } from "../../utils/project-list-page";
import type { BaseDisplayItem, ProjectListState } from "../../utils/project-list-page";
import { parseSalesRecords } from "../../utils/sales-records";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type RecordType = components["schemas"]["RecordType"];

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
}

/** 页面 data. */
interface PageData {
  state: ProjectListState;
  items: DisplayItem[];
  page: number;
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
}

/** 页面自定义方法. */
interface PageCustom {
  getToken(): string;
  clearToken(): void;
  loadList(): void;
  loadResponsible(token: string): void;
  applyItems(projects: ProjectResponse[], mode: "replace" | "append"): void;
  onItemTap(e: WechatMiniprogram.BaseEvent): void;
  onRetry(): void;
  onGoLogin(): void;
}

/** 按记录类型统计项目销售记录数. */
function countByType(project: ProjectResponse, type: RecordType): number {
  return parseSalesRecords(project.sales_records).filter(
    (r) => r.record_type === type,
  ).length;
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

Page<PageData, PageCustom>(
  createProjectListPage<DisplayItem>({
    status: "selling",
    detailRoute: "/pages/viewing/detail/index/index",
    toDisplay(project) {
      const top = topOfferOf(project);
      return {
        id: project.id,
        name: project.community_name ?? project.name ?? "未命名项目",
        maxOfferText: top ? `${top.price}万` : "暂无",
        hasOffer: top !== null,
        offerTimeText: top ? formatDay(top.date) : "",
        viewingCount: countByType(project, "viewing"),
        offerCount: countByType(project, "offer"),
        negotiationCount: countByType(project, "negotiation"),
      };
    },
  }),
);
