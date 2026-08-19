import type { components } from "../../../types/api-types";
import { request, type HttpResponseError } from "../../../utils/request";
import { getAccessToken, getUserIdFromAccessToken } from "../../../utils/token";
import { resolveAssetUrl } from "../../../utils/url";
import { fetchEmployeeId } from "../../../utils/valuation-share";

type PublicProjectDetail = components["schemas"]["PublicProjectDetail"];
type PublicMediaItem = components["schemas"]["PublicMediaItem"];
type PublicRenovationStage = components["schemas"]["PublicRenovationStage"];
type PublicConsultantContact = components["schemas"]["PublicConsultantContact"];
type RenovationStageName =
  | "拆除"
  | "设计"
  | "水电"
  | "木瓦"
  | "油漆"
  | "交付"
  | "已完成";

type StageStatus = "completed" | "in_progress" | "pending";

/** 改造阶段展示数据：完成时间 + 该阶段照片（用于点击轮播）. */
type DisplayStage = {
  stage: RenovationStageName;
  status: StageStatus;
  completedDate: string | null;
  photoCount: number;
  cover: string | null;
  photos: string[];
  clickable: boolean;
};

/** 图集项：图片或视频，供 swiper 渲染. poster 为视频封面(来自 thumbnail_url)，图片为空串. */
type GalleryItem = { type: "image" | "video"; url: string; poster: string };

/** 阶段照片轮播弹层状态. */
type StageViewer = {
  visible: boolean;
  stage: string;
  photos: string[];
  current: number;
};

/** 设计稿仅展示 5 个改造阶段（不含「交付」「已完成」）. */
const ALL_STAGES: RenovationStageName[] = ["拆除", "设计", "水电", "木瓦", "油漆"];

/** 轮播图中改造照片的展示顺序；不在表内的阶段（交付/已完成/未知）排在最后. */
const GALLERY_STAGE_ORDER: Record<string, number> = {
  拆除: 0,
  设计: 1,
  水电: 2,
  木瓦: 3,
  油漆: 4,
};

/**
 * 构建房源分享 path（卡片 path 与朋友圈 query 共用前缀）.
 * employeeId（内部员工）为空时省略 referrer（游客/客户分享无归属，接收方仍显示房源顾问）.
 */
function buildPropertySharePath(id: number, employeeId: string): string {
  const base = `/pages/projects/detail/index?id=${id}`;
  return employeeId ? `${base}&referrer=${encodeURIComponent(employeeId)}` : base;
}

interface PageData {
  id: number | null;
  detail: PublicProjectDetail | null;
  contact: PublicConsultantContact | null;
  stages: DisplayStage[];
  gallery: GalleryItem[];
  stageViewer: StageViewer;
  hasRenovationPhotos: boolean;
  loading: boolean;
  error: boolean;
  notFound: boolean;
  /** 分享归属员工 ID（进入链接携带，透传顾问联系方式接口）. */
  referrer: string;
  /** 当前登录内部员工 ID（识别成功置值，分享时作为 referrer 归属）. */
  employeeId: string;
}

type Custom = {
  loadDetail(id: number): Promise<void>;
  loadEmployee(): Promise<void>;
  onMediaTap(
    e: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { url?: string }
    >
  ): void;
  onStageTap(
    e: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { stage?: string }
    >
  ): void;
  onViewerClose(): void;
  onViewerChange(
    e: WechatMiniprogram.SwiperChange<
      WechatMiniprogram.IAnyObject,
      WechatMiniprogram.IAnyObject
    >
  ): void;
  onCallPhone(): void;
  onAddWechat(): void;
  onRetry(): void;
  onShareTimeline(): void;
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

/**
 * 图集排序：营销照片在前（保持原 sort_order），改造照片按
 * 拆除→设计→水电→木瓦→油漆 排序，其余阶段（交付/已完成/未知）追加在末尾.
 * 同组内保持后端原有顺序.
 */
function sortGalleryMedia(media: PublicMediaItem[]): PublicMediaItem[] {
  return media
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aIsMarketing = a.item.photo_category === "marketing";
      const bIsMarketing = b.item.photo_category === "marketing";
      if (aIsMarketing !== bIsMarketing) {
        return aIsMarketing ? -1 : 1;
      }
      if (!aIsMarketing) {
        const aRank =
          GALLERY_STAGE_ORDER[a.item.renovation_stage ?? ""] ?? Number.MAX_SAFE_INTEGER;
        const bRank =
          GALLERY_STAGE_ORDER[b.item.renovation_stage ?? ""] ?? Number.MAX_SAFE_INTEGER;
        if (aRank !== bRank) {
          return aRank - bRank;
        }
      }
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

/** 将后端改造阶段与媒体分组映射为 5 项展示数据（含完成时间与照片）. */
function buildStages(
  media: PublicMediaItem[],
  apiStages?: PublicRenovationStage[]
): DisplayStage[] {
  // 按 renovation_stage 分组 renovation 类目的图片，并 resolve 为完整 URL
  const photosByStage = new Map<string, string[]>();
  for (const m of media) {
    if (m.photo_category !== "renovation" || !m.renovation_stage) {
      continue;
    }
    const stageName = m.renovation_stage as string;
    const url = resolveAssetUrl(m.file_url);
    if (!url) {
      continue;
    }
    const list = photosByStage.get(stageName) ?? [];
    list.push(url);
    photosByStage.set(stageName, list);
  }

  return ALL_STAGES.map((stageName) => {
    const matched = apiStages?.find((s) => s.stage === stageName);
    const completedDate = matched?.completed_date ?? null;
    const photos = photosByStage.get(stageName) ?? [];
    const photoCount = matched?.photo_count ?? photos.length;
    let status: StageStatus = "pending";
    if (completedDate) {
      status = "completed";
    } else if (photos.length > 0) {
      status = "in_progress";
    }
    return {
      stage: stageName,
      status,
      completedDate,
      photoCount,
      cover: photos[0] ?? null,
      photos,
      clickable: photos.length > 0,
    };
  });
}

Page<PageData, Custom>({
  data: {
    id: null,
    detail: null,
    contact: null,
    stages: [],
    gallery: [],
    stageViewer: { visible: false, stage: "", photos: [], current: 0 },
    hasRenovationPhotos: false,
    loading: false,
    error: false,
    notFound: false,
    referrer: "",
    employeeId: "",
  },
  onLoad(options) {
    const rawOptions = options as Record<string, string | undefined>;
    const rawId = rawOptions.id;
    if (!rawId) {
      this.setData({ notFound: true });
      return;
    }
    const id = Number(rawId);
    if (!Number.isFinite(id)) {
      this.setData({ notFound: true });
      return;
    }
    // 同步取当前登录员工 ID 作为 employeeId 初值：onShareAppMessage 是同步回调，
    // 无法 await loadEmployee；先从 access_token 解析 sub 填充，确保进入后立即
    // 分享仍携带 referrer 归因（loadEmployee 完成后由后端确认值覆盖）
    this.setData({ id, referrer: rawOptions.referrer || "", employeeId: getUserIdFromAccessToken() });
    // 启用右上角菜单的「分享给朋友」与「分享到朋友圈」，使 onShareTimeline 可触发
    wx.showShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
    this.loadDetail(id);
    // 内部员工（admin 令牌存在）：识别身份后分享携带 referrer（分享人归属）
    if (getAccessToken()) {
      this.loadEmployee();
    }
  },
  async loadDetail(id: number): Promise<void> {
    this.setData({
      loading: true,
      error: false,
      notFound: false,
      detail: null,
    });
    try {
      // 详情与顾问联系方式并行拉取，避免请求瀑布；
      // 携带进入时的 referrer（分享归属内部用户），由后端决定返回分享人联系方式
      const [detail, contact] = await Promise.all([
        request<PublicProjectDetail>({
          url: `/public/projects/${id}`,
          skipAuth: true,
        }),
        request<PublicConsultantContact>({
          url: `/public/projects/${id}/consultant`,
          data: this.data.referrer ? { referrer: this.data.referrer } : undefined,
          skipAuth: true,
        }),
      ]);
      // 后端文件 URL 为相对路径 /static/uploads/xxx.jpg，需拼接 origin 供 <image>/<video> 加载
      const resolvedDetail: PublicProjectDetail = {
        ...detail,
        images: (detail.images ?? []).map((img) => resolveAssetUrl(img)),
      };
      // 图集优先用 media（含图片与视频），按类型渲染；无 media 时回退 images
      // 视频项用 thumbnail_url 作封面（后端目前不生成视频缩略图，poster 常为空串→前端黑色占位兜底）
      // 顺序：营销照片 → 改造照片（拆除/设计/水电/木瓦/油漆）
      const media = sortGalleryMedia(detail.media ?? []);
      const stages = buildStages(media, resolvedDetail.renovation_stages);
      const hasRenovationPhotos = stages.some((s) => s.photos.length > 0);
      const gallery: GalleryItem[] =
        media.length > 0
          ? media
              .map((m) => {
                const type = (m.media_type === "video" ? "video" : "image") as "image" | "video";
                return {
                  type,
                  url: resolveAssetUrl(m.file_url),
                  poster: type === "video" ? resolveAssetUrl(m.thumbnail_url) : "",
                };
              })
              .filter((g) => g.url)
          : (resolvedDetail.images ?? []).map((url) => ({
              type: "image" as const,
              url,
              poster: "",
            }));
      this.setData({ detail: resolvedDetail, contact, stages, gallery, hasRenovationPhotos, loading: false });
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
  /**
   * 识别当前登录内部员工（/auth/me）.
   * 成功置 employeeId（分享时作为 referrer 归属）；失败（401/403/网络）静默，
   * 非内部用户分享不携带 referrer，接收方仍显示房源顾问联系方式.
   */
  async loadEmployee(): Promise<void> {
    try {
      const employeeId = await fetchEmployeeId();
      this.setData({ employeeId });
    } catch {
      // 静默降级：不阻断分享
    }
  },
  onMediaTap(
    e: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { url?: string }
    >
  ): void {
    const gallery = this.data.gallery ?? [];
    if (gallery.length === 0) {
      return;
    }
    // wx.previewMedia 的 current 为索引(number)，需根据点按的 url 定位
    const url = e.currentTarget.dataset.url;
    let current = gallery.findIndex((g) => g.url === url);
    if (current < 0) {
      current = 0;
    }
    wx.previewMedia({
      sources: gallery.map((g) => ({ url: g.url, type: g.type })),
      current,
    });
  },
  onStageTap(
    e: WechatMiniprogram.BaseEvent<
      WechatMiniprogram.IAnyObject,
      { stage?: string }
    >
  ): void {
    const stageName = e.currentTarget.dataset.stage;
    if (!stageName) {
      return;
    }
    const target = this.data.stages.find((s) => s.stage === stageName);
    if (!target || !target.clickable || target.photos.length === 0) {
      // 无照片的阶段不可查看轮播
      wx.showToast({ title: "该阶段暂无照片", icon: "none" });
      return;
    }
    this.setData({
      stageViewer: {
        visible: true,
        stage: stageName,
        photos: target.photos,
        current: 0,
      },
    });
  },
  onViewerClose(): void {
    this.setData({
      stageViewer: { visible: false, stage: "", photos: [], current: 0 },
    });
  },
  onViewerChange(
    e: WechatMiniprogram.SwiperChange<
      WechatMiniprogram.IAnyObject,
      WechatMiniprogram.IAnyObject
    >
  ): void {
    this.setData({ "stageViewer.current": e.detail.current });
  },
  onCallPhone(): void {
    const phone = this.data.contact?.phone;
    if (phone) {
      wx.makePhoneCall({ phoneNumber: phone }).catch(() => {});
    } else {
      wx.showToast({ title: "暂无联系电话", icon: "none" });
    }
  },
  onAddWechat(): void {
    const wechat = this.data.contact?.wechat_number;
    if (!wechat) {
      wx.showToast({ title: "暂无微信号", icon: "none" });
      return;
    }
    wx.setClipboardData({ data: wechat });
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
    // 封面取图集首图（已为完整地址），无图则省略
    const cover = this.data.gallery.find((g) => g.type === "image")?.url;
    const share: WechatMiniprogram.IAnyObject = {
      title: this.data.detail?.title || "美房宝房源",
      path: buildPropertySharePath(this.data.id ?? 0, this.data.employeeId),
    };
    if (cover) {
      share.imageUrl = cover;
    }
    return share;
  },
  onShareTimeline() {
    const cover = this.data.gallery.find((g) => g.type === "image")?.url;
    const share: WechatMiniprogram.IAnyObject = {
      title: this.data.detail?.title || "美房宝房源",
      query: buildPropertySharePath(this.data.id ?? 0, this.data.employeeId).split("?")[1] || "",
    };
    if (cover) {
      share.imageUrl = cover;
    }
    return share;
  },
});
