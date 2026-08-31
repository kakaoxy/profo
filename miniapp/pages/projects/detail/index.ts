import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import type { HttpResponseError } from "../../../utils/request";
import { getAccessToken, getCAccessToken, getUserIdFromAccessToken } from "../../../utils/token";
import { resolveAssetUrl, resolveImageUrl } from "../../../utils/url";
import { fetchEmployeeId } from "../../../utils/valuation-share";
import { getVisitorId } from "../../../utils/visitor";

type PublicProjectDetail = components["schemas"]["PublicProjectDetail"];
type PublicMediaItem = components["schemas"]["PublicMediaItem"];
type PublicRenovationStage = components["schemas"]["PublicRenovationStage"];
type PublicConsultantContact = components["schemas"]["PublicConsultantContact"];
type PublicProjectBookingItem = components["schemas"]["PublicProjectBookingItem"];
type PublicProjectBookingResponse = components["schemas"]["PublicProjectBookingResponse"];
type PublicUserInfo = components["schemas"]["PublicUserInfo"];
type PublicTrackingEventResponse = components["schemas"]["PublicTrackingEventResponse"];
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

/** /public/users/phone/wechat 返回体：成功 { success: true }，冲突 { code: 40901, message }. */
interface PhoneWechatBindResponse {
  success?: boolean;
  code?: number;
  message?: string;
}

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
  /** 顾问卡片头像完整 URL（avatar 为空时为空串，wxml 走首字符占位）. */
  contactAvatarUrl: string;
  /** 顾问卡片头像缺省占位字符（nickname 首字符）. */
  contactFallbackChar: string;
  /** 顾问卡片角色标签：命中分享人「分享人」否则「房源顾问」. */
  contactRoleText: string;
  /** 当前用户已预约本房源. */
  booked: boolean;
  /** 预约提交中（按钮 loading 防重入）. */
  bookingSubmitting: boolean;
  /** 页内手机号授权弹层是否展示（未绑手机号预约时引导）. */
  phoneAuthVisible: boolean;
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
  onBookTap(): void;
  proceedBooking(id: number): Promise<void>;
  createBooking(id: number): Promise<void>;
  onPhoneAuth(e: WechatMiniprogram.CustomEvent): void;
  bindPhoneAndBook(code: string): Promise<void>;
  onPhoneAuthCancel(): void;
  loadBookedState(id: number): Promise<void>;
  reportVisit(id: number, referrer: string, source: string): void;
  reportShareEvent(id: number, shareType: "card" | "timeline"): void;
  onRetry(): void;
  /** 员工专属入口：跳转「我的客户」页（分享漏斗 + 归因预约客户）. */
  onMyCustomersTap(): void;
  onShareTimeline(): void;
  onShow(): void;
  /** 登录返回后续约预约流标记（实例字段，无需渲染）. */
  pendingBook: boolean;
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
    const url = resolveImageUrl(m.file_url);
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
    contactAvatarUrl: "",
    contactFallbackChar: "",
    contactRoleText: "房源顾问",
    booked: false,
    bookingSubmitting: false,
    phoneAuthVisible: false,
  },
  pendingBook: false,
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
    const referrer = rawOptions.referrer || "";
    this.setData({ id, referrer, employeeId: getUserIdFromAccessToken() });
    // 启用右上角菜单的「分享给朋友」与「分享到朋友圈」，使 onShareTimeline 可触发
    wx.showShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
    this.loadDetail(id);
    // 经分享进入（带 referrer）：静默上报访问埋点（PV +1，UV 按匿名 visitor_id 去重）
    if (referrer) {
      this.reportVisit(id, referrer, rawOptions.source || "share");
    }
    // C 端已登录：预置已预约态（重复进入不再展示可预约按钮）
    if (getCAccessToken()) {
      this.loadBookedState(id);
    }
    // 内部员工（admin 令牌存在）：识别身份后分享携带 referrer（分享人归属）
    if (getAccessToken()) {
      this.loadEmployee();
    }
  },
  onShow() {
    // 登录页返回重试：onBookTap 时未登录跳登录（pendingBook 置位），
    // 返回本页且已获得 C 端令牌时继续预约流
    if (this.pendingBook && getCAccessToken() && this.data.id !== null && !this.data.booked) {
      this.pendingBook = false;
      this.proceedBooking(this.data.id);
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
        images: (detail.images ?? []).map((img) => resolveImageUrl(img)),
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
                  // 视频 URL 不可拼图片处理参数（OSS 会处理失败导致无法播放），仅图片加水印
                  url: type === "video" ? resolveAssetUrl(m.file_url) : resolveImageUrl(m.file_url),
                  poster: type === "video" ? resolveImageUrl(m.thumbnail_url) : "",
                };
              })
              .filter((g) => g.url)
          : (resolvedDetail.images ?? []).map((url) => ({
              type: "image" as const,
              url,
              poster: "",
            }));
      this.setData({
        detail: resolvedDetail,
        contact,
        stages,
        gallery,
        hasRenovationPhotos,
        loading: false,
        contactAvatarUrl: resolveAssetUrl(contact.avatar),
        contactFallbackChar: (contact.nickname || "顾问").slice(0, 1),
        contactRoleText: contact.is_referrer ? "分享人" : "房源顾问",
      });
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
  /**
   * 「想看房」入口（决策 #3 状态机）：
   * 先弹确认框：用户「同意」才有工作人员联系，继续后续流程；
   * 「不同意」则直接返回，不进入预约流程（不会预约成功）→
   * booked 直接返回 → 未登录跳登录页（onShow 返回后重试）→
   * 已登录查手机号（/public/auth/me）：有则直接预约，无则弹页内微信授权层.
   */
  onBookTap(): void {
    if (this.data.booked || this.data.bookingSubmitting) {
      return;
    }
    const id = this.data.id;
    if (id === null) {
      return;
    }
    wx.showModal({
      title: "预约确认",
      content: "同意后将会有工作人员通过电话与您联系，是否同意预约看房？",
      confirmText: "同意",
      cancelText: "不同意",
      success: (res) => {
        if (!res.confirm) {
          // 用户不同意：不发起任何预约请求
          return;
        }
        if (!getCAccessToken()) {
          this.pendingBook = true;
          wx.navigateTo({ url: "/pages/login/index/index?from=booking" });
          return;
        }
        this.proceedBooking(id);
      },
    });
  },
  /** 已登录：校验手机号绑定后预约（无手机号 → 页内授权弹层）. */
  async proceedBooking(id: number): Promise<void> {
    try {
      const me = await request<PublicUserInfo>({ url: "/public/auth/me" });
      if (me.phone) {
        this.createBooking(id);
        return;
      }
    } catch (err) {
      if (isHttpResponseError(err) && err.statusCode === 401) {
        // C 端令牌失效（refresh 也失败）：重新走登录
        this.pendingBook = true;
        wx.navigateTo({ url: "/pages/login/index/index?from=booking" });
        return;
      }
      wx.showToast({ title: "网络异常，请重试", icon: "none" });
      return;
    }
    this.setData({ phoneAuthVisible: true });
  },
  /** 提交预约（幂等）：成功 booked=true；409 为后端未绑手机号兜底 → 弹授权层. */
  async createBooking(id: number): Promise<void> {
    if (this.data.bookingSubmitting) {
      return;
    }
    this.setData({ bookingSubmitting: true });
    try {
      await request<PublicProjectBookingResponse>({
        url: "/public/bookings",
        method: "POST",
        data: { marketing_project_id: id, visitor_id: getVisitorId() },
      });
      this.setData({ booked: true, bookingSubmitting: false, phoneAuthVisible: false });
      wx.showToast({ title: "预约成功，工作人员将会联系您", icon: "none" });
    } catch (err) {
      this.setData({ bookingSubmitting: false });
      if (isHttpResponseError(err)) {
        if (err.statusCode === 409) {
          this.setData({ phoneAuthVisible: true });
          return;
        }
        const body = err.body as { message?: string } | undefined;
        wx.showToast({ title: body?.message || "预约失败，请重试", icon: "none" });
        return;
      }
      wx.showToast({ title: "网络异常，请重试", icon: "none" });
    }
  },
  /** 手机号授权弹层回调：拒绝静默保留弹层；成功用 code 绑定后自动预约. */
  onPhoneAuth(e: WechatMiniprogram.CustomEvent): void {
    const detail = e.detail as { code?: string; errMsg?: string };
    if (detail.errMsg && !detail.errMsg.includes("ok")) {
      return;
    }
    if (!detail.code) {
      wx.showToast({ title: "获取手机号失败", icon: "none" });
      return;
    }
    this.bindPhoneAndBook(detail.code);
  },
  /** 微信 code 换手机号并绑定，成功后自动提交预约. */
  async bindPhoneAndBook(code: string): Promise<void> {
    const id = this.data.id;
    if (id === null || this.data.bookingSubmitting) {
      return;
    }
    this.setData({ bookingSubmitting: true });
    try {
      const res = await request<PhoneWechatBindResponse>({
        url: "/public/users/phone/wechat",
        method: "POST",
        data: { code },
      });
      this.setData({ bookingSubmitting: false });
      if (res.code === 40901) {
        wx.showToast({ title: "该手机号已绑定其他账号，请先合并账号", icon: "none" });
        return;
      }
      if (res.success !== true) {
        wx.showToast({ title: res.message || "绑定失败，请重试", icon: "none" });
        return;
      }
      this.createBooking(id);
    } catch (err) {
      this.setData({ bookingSubmitting: false });
      if (isHttpResponseError(err)) {
        const body = err.body as { message?: string } | undefined;
        wx.showToast({ title: body?.message || "绑定失败，请重试", icon: "none" });
        return;
      }
      wx.showToast({ title: "网络异常，请重试", icon: "none" });
    }
  },
  /** 手机号授权弹层「取消」. */
  onPhoneAuthCancel(): void {
    this.setData({ phoneAuthVisible: false });
  },
  /** 预置已预约态：我的预约中含本房源即 booked（失败静默，不阻断浏览）. */
  async loadBookedState(id: number): Promise<void> {
    try {
      const list = await request<PublicProjectBookingItem[]>({
        url: "/public/bookings/my",
        data: { marketing_project_id: id },
      });
      if (list.length > 0) {
        this.setData({ booked: true });
      }
    } catch {
      // 静默：未登录/网络异常不影响浏览
    }
  },
  /** 静默上报访问埋点（免登录，失败忽略）. */
  reportVisit(id: number, referrer: string, source: string): void {
    request<PublicTrackingEventResponse>({
      url: `/public/projects/${id}/visit-events`,
      method: "POST",
      data: { visitor_id: getVisitorId(), referrer, source },
      skipAuth: true,
    }).catch(() => {
      // 埋点失败静默，不打扰用户
    });
  },
  /** 静默上报分享事件（需登录，失败忽略）. */
  reportShareEvent(id: number, shareType: "card" | "timeline"): void {
    request<PublicTrackingEventResponse>({
      url: `/public/projects/${id}/share-events`,
      method: "POST",
      data: { share_type: shareType },
    }).catch(() => {
      // 埋点失败静默，不打扰用户
    });
  },
  onRetry(): void {
    const id = this.data.id;
    if (id === null) {
      return;
    }
    this.loadDetail(id);
  },
  /** 员工专属入口：跳转「我的客户」页. */
  onMyCustomersTap(): void {
    wx.navigateTo({ url: "/pages/projects/mine/index" });
  },
  onShareAppMessage() {
    // 封面取图集首图（已为完整地址），无图则省略
    const cover = this.data.gallery.find((g) => g.type === "image")?.url;
    // 内部员工分享：静默上报分享事件（card），失败忽略
    if (this.data.employeeId && this.data.id !== null) {
      this.reportShareEvent(this.data.id, "card");
    }
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
    // 内部员工分享：静默上报分享事件（timeline），失败忽略
    if (this.data.employeeId && this.data.id !== null) {
      this.reportShareEvent(this.data.id, "timeline");
    }
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
