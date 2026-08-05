import { request, HttpResponseError, NetworkError } from "../../utils/request";
import { paths } from "../../types/api-types";

/**
 * 平台统计数据类型，从 api-types.d.ts 推导.
 * 对应后端 GET /api/v1/public/stats/platform 的 200 响应体.
 */
type PublicPlatformStats = paths["/api/v1/public/stats/platform"]["get"]["responses"]["200"]["content"]["application/json"];

/** 首页页面数据. */
type IndexData = {
  totalOwners: number;
  onSaleCount: number;
  totalSold: number;
  loading: boolean;
  error: string;
};

/** 首页自定义方法. */
type IndexCustom = {
  fetchStats(): Promise<void>;
  onNavigateToProjects(): void;
};

const initialData: IndexData = {
  totalOwners: 0,
  onSaleCount: 0,
  totalSold: 0,
  loading: true,
  error: "",
};

/** 从 request reject 的错误中提取用户可读消息. */
function extractErrorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    if ("errMsg" in err && typeof (err as NetworkError).errMsg === "string") {
      return "网络异常，请稍后重试";
    }
    if ("statusCode" in err) {
      return `服务异常(${(err as HttpResponseError).statusCode})`;
    }
  }
  return "加载失败";
}

Page<IndexData, IndexCustom>({
  data: initialData,
  onLoad() {
    this.fetchStats();
  },
  async fetchStats() {
    this.setData({ loading: true, error: "" });
    try {
      const stats = await request<PublicPlatformStats>({
        url: "/public/stats/platform",
      });
      this.setData({
        totalOwners: stats.total_owners,
        onSaleCount: stats.on_sale_count,
        totalSold: stats.total_sold,
        loading: false,
        error: "",
      });
    } catch (err) {
      const message = extractErrorMessage(err);
      this.setData({ loading: false, error: message });
      wx.showToast({ title: message, icon: "none" });
    }
  },
  onNavigateToProjects() {
    wx.navigateTo({ url: "/pages/projects/list/index" });
  },
});
