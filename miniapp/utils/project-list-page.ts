/**
 * 「我负责的项目」列表页工厂（viewing/renovation 共用）.
 *
 * 抽取两页面高度重复的主/回退双通道加载、排序、状态机与事件处理逻辑，
 * 仅保留 status 过滤、详情路由、展示项转换三个差异点由调用方传入。
 *
 * 主通道 GET /projects 支持分页（page/page_size），响应 PaginatedResponse 返回 total：
 * 首屏拉第 1 页，触底 onReachBottom 追加下一页，按 created_at 倒序合并去重；
 * 回退通道 GET /projects/my-responsible 返回全量列表（无分页），一次拉全并置 hasMore=false。
 * 见代码审查报告 🟡-7。
 */
import type { components } from "../types/api-types";
import { request } from "./request";
import { getAccessToken } from "./token";

type ProjectResponse = components["schemas"]["ProjectResponse"];

/**
 * 主通道每页条数（后端 max_page_size=200）。取适中页大小以启用触底分页，
 * 避免固定拉取 200 条将超量项目静默截断。
 */
const PAGE_SIZE = 20;

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

/** this 上下文：工厂方法 + 框架注入的 setData + 分页字段. */
interface ProjectListPageThis<TItem extends BaseDisplayItem> {
  /** 跨页累计的原始项目（按 id 去重），用于追加后统一排序转换. */
  _rawItems: ProjectResponse[];
  data: {
    state: ProjectListState;
    items: TItem[];
    page: number;
    total: number;
    hasMore: boolean;
    loadingMore: boolean;
  };
  setData(
    data: Partial<{
      state: ProjectListState;
      items: TItem[];
      page: number;
      total: number;
      hasMore: boolean;
      loadingMore: boolean;
    }>,
  ): void;
  getToken(): string;
  clearToken(): void;
  loadList(): void;
  loadResponsible(token: string): void;
  applyItems(projects: ProjectResponse[], mode: "replace" | "append"): void;
  onReachBottom(): void;
}

/** 防止 onShow 与触底/重试并发触发时出现重复的全量请求. */
let inFlight = false;

/**
 * 创建「我负责的项目」列表页配置（viewing/renovation 共用）.
 *
 * 统一主/回退双通道：主通道 GET /projects?status=X 分页拉取；403 回退
 * GET /projects/my-responsible 过滤同状态。401 清令牌切「登录已失效」，
 * 403 切无权限态不清令牌。排序按 created_at 倒序统一处理。
 */
export function createProjectListPage<TItem extends BaseDisplayItem>(
  config: ProjectListPageConfig<TItem>,
) {
  return {
    _rawItems: [] as ProjectResponse[],

    data: {
      state: "loading" as ProjectListState,
      items: [] as TItem[],
      page: 1,
      total: 0,
      hasMore: false,
      loadingMore: false,
    },

    getToken() {
      return getAccessToken();
    },

    clearToken() {
      // 401 说明后台会话失效，仅清除后台令牌（access_token/refresh_token）。
      // C 端令牌由独立生命周期管理（/public/* 401 时 request.ts 自动续期），
      // 不在此一并清除，避免破坏仍有效的 C 端登录态；与 viewing/renovation 详情页一致。
      wx.removeStorageSync("access_token");
      wx.removeStorageSync("refresh_token");
    },

    onShow(this: ProjectListPageThis<TItem>) {
      this.loadList();
    },

    async loadList(this: ProjectListPageThis<TItem>) {
      if (inFlight) {
        return;
      }
      inFlight = true;
      try {
        const token = this.getToken();
        if (!token) {
          this.setData({ state: "needLogin", items: [] });
          return;
        }
        this.setData({
          state: "loading",
          items: [],
          page: 1,
          hasMore: false,
          loadingMore: false,
        });
        try {
          // 主通道：持 project:read（admin/operator）分页拉取目标状态项目
          const data = await request<{
            items: ProjectResponse[];
            total: number;
            page: number;
            page_size: number;
          }>({
            url: `/projects?status=${config.status}&include_interactions=true&page=1&page_size=${PAGE_SIZE}`,
            header: { Authorization: `Bearer ${token}` },
          });
          const items = data.items ?? [];
          const total = data.total ?? 0;
          this.applyItems(items, "replace");
          this.setData({ page: 1, total, hasMore: items.length < total });
        } catch (err) {
          const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
          if (statusCode === 401) {
            this.clearToken();
            this.setData({ state: "needLogin", items: [] });
          } else if (statusCode === 403) {
            // 无 project:read 权限，回退业务身份负责的同状态项目
            await this.loadResponsible(token);
          } else {
            this.setData({ state: "error", items: [] });
          }
        }
      } finally {
        inFlight = false;
      }
    },

    async loadResponsible(this: ProjectListPageThis<TItem>, token: string) {
      try {
        const data = await request<ProjectResponse[]>({
          url: "/projects/my-responsible",
          header: { Authorization: `Bearer ${token}` },
        });
        const filtered = (data ?? []).filter((p) => p.status === config.status);
        this.applyItems(filtered, "replace");
        // 回退通道无分页：一次拉全，置 hasMore=false
        this.setData({ page: 1, total: filtered.length, hasMore: false });
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

    applyItems(
      this: ProjectListPageThis<TItem>,
      projects: ProjectResponse[],
      mode: "replace" | "append",
    ) {
      if (mode === "replace") {
        this._rawItems = projects;
      } else {
        // 追加下一页：按 id 去重（新值覆盖旧值），保持 created_at 倒序由下方统一排序
        const map = new Map<string, ProjectResponse>();
        [...this._rawItems, ...projects].forEach((p) => map.set(p.id, p));
        this._rawItems = [...map.values()];
      }
      const items = this._rawItems
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

    async onReachBottom(this: ProjectListPageThis<TItem>) {
      if (
        this.data.state !== "items" ||
        !this.data.hasMore ||
        this.data.loadingMore
      ) {
        return;
      }
      const token = this.getToken();
      if (!token) {
        this.setData({ state: "needLogin" });
        return;
      }
      this.setData({ loadingMore: true });
      const nextPage = this.data.page + 1;
      try {
        const data = await request<{
          items: ProjectResponse[];
          total: number;
          page: number;
          page_size: number;
        }>({
          url: `/projects?status=${config.status}&include_interactions=true&page=${nextPage}&page_size=${PAGE_SIZE}`,
          header: { Authorization: `Bearer ${token}` },
        });
        const items = data.items ?? [];
        const total = data.total ?? 0;
        this.applyItems(items, "append");
        this.setData({
          page: nextPage,
          total,
          hasMore: nextPage * PAGE_SIZE < total,
          loadingMore: false,
        });
      } catch (err) {
        const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
        if (statusCode === 401) {
          this.clearToken();
          this.setData({ state: "needLogin", loadingMore: false });
        } else {
          wx.showToast({ title: "加载失败，请重试", icon: "none" });
          this.setData({ loadingMore: false });
        }
      }
    },

    onRetry(this: ProjectListPageThis<TItem>) {
      this.loadList();
    },

    onGoLogin() {
      wx.navigateBack({ delta: 1 });
    },
  };
}
