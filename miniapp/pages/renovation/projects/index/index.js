import { request } from "../../../../utils/request";

/**
 * 「装修记录」列表页（profile「装修记录」内部入口的落地页）.
 *
 * 对齐后台工作台「装修进度上传」的项目筛选标准：仅展示装修中（renovating）项目。
 * 主通道 GET /projects?status=renovating 拉取；403 回退 GET /projects/my-responsible
 * 过滤 status==="renovating"。401 → 清令牌切「登录已失效」；403 → 无权限态不清令牌。
 */

/** 装修子阶段顺序（对齐后台 constants.ts RENOVATION_STAGES 的 value）. */
const RENOVATION_STAGE_VALUES = ["拆除", "设计", "水电", "木瓦", "油漆", "交付"];

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

  toDisplay(project) {
    const stage = project.renovation_stage;
    let stageText = "未开始";
    if (stage) {
      if (RENOVATION_STAGE_VALUES.indexOf(stage) >= 0) {
        stageText = stage;
      } else if (stage === "已完成") {
        stageText = "已完成";
      }
    }
    const dates = project.renovationStageDates || {};
    const completed = RENOVATION_STAGE_VALUES.filter((s) => dates[s]).length;
    const percent = Math.round((completed / RENOVATION_STAGE_VALUES.length) * 100);
    return {
      id: project.id,
      name: project.community_name || project.name || "未命名项目",
      statusText: "装修中",
      statusColor: "#f97316",
      stageText: stageText,
      progressText: percent + "%",
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
      // 主通道：持 project:read 拉取全部装修中项目
      const data = await request({
        url: "/projects?status=renovating&include_interactions=true&page=1&page_size=200",
        header: { Authorization: "Bearer " + token },
      });
      this.applyItems(data.items || []);
    } catch (err) {
      const statusCode = err && err.statusCode;
      if (statusCode === 401) {
        this.clearToken();
        this.setData({ state: "needLogin", items: [] });
      } else if (statusCode === 403) {
        // 无 project:read 权限，回退业务身份负责的装修中项目
        this.loadResponsibleRenovating(token);
      } else {
        this.setData({ state: "error", items: [] });
      }
    }
  },

  async loadResponsibleRenovating(token) {
    try {
      const data = await request({
        url: "/projects/my-responsible",
        header: { Authorization: "Bearer " + token },
      });
      this.applyItems((data || []).filter((p) => p.status === "renovating"));
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
        "/pages/renovation/detail/index/index?id=" +
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
