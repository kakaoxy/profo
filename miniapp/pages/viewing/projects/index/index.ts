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
import {
  createProjectListPage,
  type BaseDisplayItem,
  type ProjectListState,
} from "../../utils/project-list-page";
import { parseSalesRecords } from "../../utils/sales-records";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type RecordType = components["schemas"]["RecordType"];

/** 项目状态 → 展示中文 + 状态色（对齐后台 status-colors 语义）. */
const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  signing: { label: "已签约", color: "#005daa" },
  renovating: { label: "装修中", color: "#f97316" },
  selling: { label: "在售", color: "#10b981" },
  sold: { label: "已售", color: "#64748b" },
  ended: { label: "已下架", color: "#78716c" },
  deleted: { label: "已删除", color: "#a3a6af" },
};

/** 列表项展示用统一结构. */
interface DisplayItem extends BaseDisplayItem {
  statusText: string;
  statusColor: string;
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

Page<PageData, PageCustom>(
  createProjectListPage<DisplayItem>({
    status: "selling",
    detailRoute: "/pages/viewing/detail/index/index",
    toDisplay(project) {
      const status = project.status ?? "signing";
      const statusCfg =
        STATUS_DISPLAY[status] ?? { label: status, color: "#a3a6af" };
      return {
        id: project.id,
        name: project.community_name ?? project.name ?? "未命名项目",
        statusText: statusCfg.label,
        statusColor: statusCfg.color,
        viewingCount: countByType(project, "viewing"),
        offerCount: countByType(project, "offer"),
        negotiationCount: countByType(project, "negotiation"),
      };
    },
  }),
);
