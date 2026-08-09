/**
 * 「装修记录」列表页（profile「装修记录」内部入口的落地页）.
 *
 * 对齐后台工作台「装修进度上传」的项目筛选标准：仅展示装修中（renovating）项目。
 * 主通道 GET /projects?status=renovating 拉取；403 回退 GET /projects/my-responsible
 * 过滤 status==="renovating"。401 → 清令牌切「登录已失效」；403 → 无权限态不清令牌.
 *
 * 页面逻辑由 createProjectListPage 工厂统一处理（主/回退双通道 + 排序 + 状态机），
 * 本文件仅提供 status 过滤、详情路由与展示项转换三个差异点。
 */
import type { components } from "../../../../types/api-types";
import {
  createProjectListPage,
  type BaseDisplayItem,
  type ProjectListState,
} from "../../../../utils/project-list-page";

type ProjectResponse = components["schemas"]["ProjectResponse"];

/** 装修子阶段顺序（对齐后台 constants.ts RENOVATION_STAGES 的 value）. */
const RENOVATION_STAGE_VALUES = ["拆除", "设计", "水电", "木瓦", "油漆", "交付"];

/** 列表项展示用统一结构. */
interface DisplayItem extends BaseDisplayItem {
  statusText: string;
  statusColor: string;
  stageText: string;
  progressText: string;
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

Page<PageData, PageCustom>(
  createProjectListPage<DisplayItem>({
    status: "renovating",
    detailRoute: "/pages/renovation/detail/index/index",
    toDisplay(project) {
      const stage = project.renovation_stage;
      let stageText = "未开始";
      if (stage) {
        if (RENOVATION_STAGE_VALUES.includes(stage)) {
          stageText = stage;
        } else if (stage === "已完成") {
          stageText = "已完成";
        }
      }
      const dates = project.renovationStageDates ?? {};
      const completed = RENOVATION_STAGE_VALUES.filter((s) => dates[s]).length;
      const percent = Math.round(
        (completed / RENOVATION_STAGE_VALUES.length) * 100,
      );
      return {
        id: project.id,
        name: project.community_name ?? project.name ?? "未命名项目",
        statusText: "装修中",
        statusColor: "#f97316",
        stageText,
        progressText: `${percent}%`,
      };
    },
  }),
);
