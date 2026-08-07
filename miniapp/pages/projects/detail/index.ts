import type { components } from "../../../types/api-types";
import { request, type HttpResponseError } from "../../../utils/request";
import { resolveAssetUrl } from "../../../utils/url";

type PublicProjectDetail = components["schemas"]["PublicProjectDetail"];
type RenovationStageName =
  | "拆除"
  | "设计"
  | "水电"
  | "木瓦"
  | "油漆"
  | "交付"
  | "已完成";

type DisplayStage = { stage: RenovationStageName; meta: string };

/** 图集项：图片或视频，供 swiper 渲染. */
type GalleryItem = { type: "image" | "video"; url: string };

/** 设计稿仅展示 6 个改造阶段（不含「已完成」）. */
const ALL_STAGES: RenovationStageName[] = [
  "拆除",
  "设计",
  "水电",
  "木瓦",
  "油漆",
  "交付",
];

interface PageData {
  id: number | null;
  detail: PublicProjectDetail | null;
  stages: DisplayStage[];
  gallery: GalleryItem[];
  loading: boolean;
  error: boolean;
  notFound: boolean;
}

type Custom = {
  loadDetail(id: number): Promise<void>;
  onImageTap(
    e: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { url?: string }
    >
  ): void;
  onCallPhone(): void;
  onAddWechat(): void;
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

/** 取 MM-DD. */
function formatDate(dateStr: string): string {
  return dateStr.slice(5);
}

/** 将后端改造阶段映射为 6 项展示数据. */
function buildStages(
  apiStages?: components["schemas"]["PublicRenovationStage"][]
): DisplayStage[] {
  // ⚠️ TODO: API 暂无阶段首图，renovation-img 用渐变占位，待后端补阶段图片字段
  return ALL_STAGES.map((stageName) => {
    const matched = apiStages?.find((s) => s.stage === stageName);
    let meta = "待开始";
    if (matched) {
      if (matched.completed_date) {
        meta = `${matched.photo_count} 张 · 完成于 ${formatDate(
          matched.completed_date
        )}`;
      } else if (matched.photo_count > 0) {
        meta = "进行中";
      } else {
        meta = "待开始";
      }
    }
    return { stage: stageName, meta };
  });
}

Page<PageData, Custom>({
  data: {
    id: null,
    detail: null,
    stages: [],
    gallery: [],
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
      // 后端文件 URL 为相对路径 /static/uploads/xxx.jpg，需拼接 origin 供 <image>/<video> 加载
      const resolvedDetail: PublicProjectDetail = {
        ...detail,
        images: (detail.images ?? []).map((img) => resolveAssetUrl(img)),
      };
      const stages = buildStages(resolvedDetail.renovation_stages);
      // 图集优先用 media（含图片与视频），按类型渲染；无 media 时回退 images
      const media = detail.media ?? [];
      const gallery: GalleryItem[] =
        media.length > 0
          ? media
              .map((m) => ({
                type: (m.media_type === "video" ? "video" : "image") as "image" | "video",
                url: resolveAssetUrl(m.file_url),
              }))
              .filter((g) => g.url)
          : (resolvedDetail.images ?? []).map((url) => ({ type: "image" as const, url }));
      this.setData({ detail: resolvedDetail, stages, gallery, loading: false });
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
    const images = (this.data.gallery ?? [])
      .filter((g) => g.type === "image")
      .map((g) => g.url);
    if (images.length === 0) {
      return;
    }
    const current = e.currentTarget.dataset.url;
    wx.previewImage({
      urls: images,
      current: current ?? images[0],
    });
  },
  onCallPhone(): void {
    const phone = this.data.detail?.consultant?.phone;
    if (phone) {
      wx.makePhoneCall({ phoneNumber: phone }).catch(() => {});
    } else {
      wx.showToast({ title: "暂无联系电话", icon: "none" });
    }
  },
  onAddWechat(): void {
    // ⚠️ TODO: 待配置真实微信号
    wx.setClipboardData({ data: "微信号待配置" });
    wx.showToast({ title: "微信号已复制", icon: "none" });
  },
  onRetry(): void {
    const id = this.data.id;
    if (id === null) {
      return;
    }
    this.loadDetail(id);
  },
  onShareAppMessage() {
    return {
      title: this.data.detail?.title || "美房宝房源",
      path: `/pages/projects/detail/index?id=${this.data.id}`,
    };
  },
});
