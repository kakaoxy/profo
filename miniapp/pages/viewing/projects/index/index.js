import { request } from "../../../../utils/request";

/**
 * 「我负责的项目」落地页（profile 页「带看记录」内部入口的落地页）.
 *
 * 仅内部员工（admin 令牌）可访问：调用 GET /projects/my-responsible 拉取
 * 当前用户负责的项目列表，点击某项目进入单项目销售记录详情页。
 * 401（令牌失效）→ 清空令牌切「登录已失效」；403（无权限）→ 展示无权限态不清令牌.
 */

/** 项目状态 → 展示中文 + 状态色（对齐后台 status-colors 语义）. */
const STATUS_DISPLAY = {
  signing: { label: "已签约", color: "#005daa" },
  renovating: { label: "装修中", color: "#f97316" },
  selling: { label: "在售", color: "#10b981" },
  sold: { label: "已售", color: "#64748b" },
  ended: { label: "已下架", color: "#78716c" },
  deleted: { label: "已删除", color: "#a3a6af" },
};

Page({
  data: {
    state: "loading",
    items: [],
  },

  getToken() {
    return wx.getStorageSync("access_token");
  },

  clearToken() {
    wx.removeStorageSync("access_token");
    wx.removeStorageSync("refresh_token");
  },

  countByType(project, type) {
    const records = project.sales_records || [];
    return records.filter((r) => r.record_type === type).length;
  },

  toDisplay(project) {
    const status = project.status || "signing";
    const statusCfg = STATUS_DISPLAY[status] || { label: status, color: "#a3a6af" };
    return {
      id: project.id,
      name: project.community_name || project.name || "未命名项目",
      statusText: statusCfg.label,
      statusColor: statusCfg.color,
      viewingCount: this.countByType(project, "viewing"),
      offerCount: this.countByType(project, "offer"),
      negotiationCount: this.countByType(project, "negotiation"),
    };
  },

  onShow() {
    this.loadList();
  },

  async loadList() {
    const token = this.getToken();
    if (!token) {
      this.setData({ state: "needLogin", items: [] });
      return;
    }
    this.setData({ state: "loading", items: [] });
    try {
      // 主通道：持 project:read（admin/operator）拉取全部在售项目（含互动记录用于计数）
      const data = await request({
        url: "/projects?status=selling&include_interactions=true&page=1&page_size=200",
        header: { Authorization: "Bearer " + token },
      });
      this.applyItems(data.items || []);
    } catch (err) {
      const statusCode = err && err.statusCode;
      if (statusCode === 401) {
        this.clearToken();
        this.setData({ state: "needLogin", items: [] });
      } else if (statusCode === 403) {
        // 无 project:read 权限，回退业务身份负责的在售项目
        this.loadResponsibleSelling(token);
      } else {
        this.setData({ state: "error", items: [] });
      }
    }
  },

  async loadResponsibleSelling(token) {
    try {
      const data = await request({
        url: "/projects/my-responsible",
        header: { Authorization: "Bearer " + token },
      });
      this.applyItems((data || []).filter((p) => p.status === "selling"));
    } catch (err) {
      const statusCode = err && err.statusCode;
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

  applyItems(projects) {
    const items = projects
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .map((p) => this.toDisplay(p));
    this.setData({
      state: items.length > 0 ? "items" : "empty",
      items: items,
    });
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.navigateTo({
      url:
        "/pages/viewing/detail/index/index?id=" +
        encodeURIComponent(id) +
        "&name=" +
        encodeURIComponent(name),
    });
  },

  onRetry() {
    this.loadList();
  },

  onGoLogin() {
    wx.navigateBack({ delta: 1 });
  },
});