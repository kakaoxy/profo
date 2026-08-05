import type { components } from "../../../types/api-types";
import { request, type HttpResponseError } from "../../../utils/request";

/** 房源详情. */
type PublicProjectDetail = components["schemas"]["PublicProjectDetail"];

/** 页面 data. */
interface PageData {
  id: number | null;
  detail: PublicProjectDetail | null;
  loading: boolean;
  error: boolean;
  notFound: boolean;
}

/** 自定义方法. */
type Custom = {
  loadDetail(id: number): Promise<void>;
  onImageTap(
    e: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { url?: string }
    >
  ): void;
  onRetry(): void;
};

/** 判断是否为 HTTP 非 2xx 错误. */
function isHttpResponseError(err: unknown): err is HttpResponseError {
  return (
    typeof err === "object" &&
    err !== null &&
    "statusCode" in err &&
    typeof (err as HttpResponseError).statusCode === "number"
  );
}

Page<PageData, Custom>({
  data: {
    id: null,
    detail: null,
    loading: false,
    error: false,
    notFound: false,
  },
  onLoad(options) {
    const rawId = options.id;
    if (!rawId) {
      this.setData({ notFound: true });
      return;
    }
    const id = Number(rawId);
    if (!Number.isFinite(id)) {
      this.setData({ notFound: true });
      return;
    }
    this.setData({ id });
    this.loadDetail(id);
  },
  async loadDetail(id: number): Promise<void> {
    this.setData({
      loading: true,
      error: false,
      notFound: false,
      detail: null,
    });
    try {
      const detail = await request<PublicProjectDetail>({
        url: `/public/projects/${id}`,
      });
      this.setData({ detail, loading: false });
    } catch (err) {
      this.setData({ loading: false });
      if (isHttpResponseError(err) && err.statusCode === 404) {
        this.setData({ notFound: true });
        return;
      }
      this.setData({ error: true });
      wx.showToast({ title: "加载失败，请重试", icon: "none" });
    }
  },
  onImageTap(
    e: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { url?: string }
    >
  ): void {
    const images = this.data.detail?.images ?? [];
    if (images.length === 0) {
      return;
    }
    const current = e.currentTarget.dataset.url;
    wx.previewImage({
      urls: images,
      current: current ?? images[0],
    });
  },
  onRetry(): void {
    const id = this.data.id;
    if (id === null) {
      return;
    }
    this.loadDetail(id);
  },
});
