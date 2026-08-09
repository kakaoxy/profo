/**
 * 「我负责的项目」列表页工厂（viewing/renovation 共用）.
 *
 * 抽取两页面高度重复的主/回退双通道加载、排序、状态机与事件处理逻辑，
 * 仅保留 status 过滤、详情路由、展示项转换三个差异点由调用方传入。
 * 见代码审查报告 🟡-7。
 */
import type { components } from "../types/api-types";
import { request } from "./request";
import { getAccessToken } from "./token";

type ProjectResponse = components["schemas"]["ProjectResponse"];

/** 列表项展示基础结构（各页可扩展 statusText/statusColor/计数等字段）. */
export interface BaseDisplayItem {
  id: string;
  name: string;
}

/** 列表页状态机. */
export type ProjectListState =
  | "loading"
  | "error"
  | "needLogin"
  | "noPermission"
  | "empty"
  | "items";

/** 工厂配置：仅 status 过滤、详情路由、展示项转换三个差异点. */
export interface ProjectListPageConfig<TItem extends BaseDisplayItem> {
  /** 主通道筛选的项目状态（selling/renovating）；回退通道同步过滤此状态. */
  status: string;
  /** 详情页路由前缀（如 /pages/viewing/detail/index/index），自动拼接 ?id=&name=. */
  detailRoute: string;
  /** ProjectResponse → 展示项转换. */
  toDisplay(project: ProjectResponse): TItem;
}

/** this 上下文：工厂方法 + 框架注入的 setData. */
interface ProjectListPageThis<TItem extends BaseDisplayItem> {
  setData(data: Partial<{ state: ProjectListState; items: TItem[] }>): void;
  getToken(): string;
  clearToken(): void;
  loadList(): void;
  loadResponsible(token: string): void;
  applyItems(projects: ProjectResponse[]): void;
}

/**
 * 创建「我负责的项目」列表页配置（viewing/renovation 共用）.
 *
 * 统一主/回退双通道：主通道 GET /projects?status=X 拉全量；403 回退
 * GET /projects/my-responsible 过滤同状态。401 清令牌切「登录已失效」，
 * 403 切无权限态不清令牌。排序按 created_at 倒序统一处理。
 */
export function createProjectListPage<TItem extends BaseDisplayItem>(
  config: ProjectListPageConfig<TItem>,
) {
  return {
    data: {
      state: "loading" as ProjectListState,
      items: [] as TItem[],
    },

    getToken() {
      return getAccessToken();
    },

    clearToken() {
      wx.removeStorageSync("access_token");
      wx.removeStorageSync("refresh_token");
      // 内部员工持双令牌（admin + c_access_token），401 时同步清 C 端令牌，
      // 避免 valuation/list 等 C 端页面残留登录态造成 UI 状态不一致
      wx.removeStorageSync("c_access_token");
      wx.removeStorageSync("c_refresh_token");
    },

    onShow(this: ProjectListPageThis<TItem>) {
      this.loadList();
    },

    async loadList(this: ProjectListPageThis<TItem>) {
      const token = this.getToken();
      if (!token) {
        this.setData({ state: "needLogin", items: [] });
        return;
      }
      this.setData({ state: "loading", items: [] });
      try {
        // 主通道：持 project:read（admin/operator）拉取全部目标状态项目
        const data = await request<{ items: ProjectResponse[] }>({
          url: `/projects?status=${config.status}&include_interactions=true&page=1&page_size=200`,
          header: { Authorization: `Bearer ${token}` },
        });
        this.applyItems(data.items ?? []);
      } catch (err) {
        const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
        if (statusCode === 401) {
          this.clearToken();
          this.setData({ state: "needLogin", items: [] });
        } else if (statusCode === 403) {
          // 无 project:read 权限，回退业务身份负责的同状态项目
          this.loadResponsible(token);
        } else {
          this.setData({ state: "error", items: [] });
        }
      }
    },

    async loadResponsible(this: ProjectListPageThis<TItem>, token: string) {
      try {
        const data = await request<ProjectResponse[]>({
          url: "/projects/my-responsible",
          header: { Authorization: `Bearer ${token}` },
        });
        this.applyItems((data ?? []).filter((p) => p.status === config.status));
      } catch (err) {
        const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
        if (statusCode === 401) {
          this.clearToken();
          this.setData({ state: "needLogin", items: [] });
        } else if (statusCode === 403) {
          this.setData({ state: "noPermission", items: [] });
        } else {
          this.setData({ state: "error", items: [] });
        }
      }
    },

    applyItems(this: ProjectListPageThis<TItem>, projects: ProjectResponse[]) {
      const items = projects
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .map((p) => config.toDisplay(p));
      this.setData({
        state: items.length > 0 ? "items" : "empty",
        items,
      });
    },

    onItemTap(e: WechatMiniprogram.BaseEvent) {
      const id = e.currentTarget.dataset.id as string;
      const name = e.currentTarget.dataset.name as string;
      wx.navigateTo({
        url: `${config.detailRoute}?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`,
      });
    },

    onRetry(this: ProjectListPageThis<TItem>) {
      this.loadList();
    },

    onGoLogin() {
      wx.navigateBack({ delta: 1 });
    },
  };
}
