/**
 * 本页为「估价提交」表单控制器，含小区搜索回填、户型三段、图片上传、手机号绑定、
 * 提交与 401/权限分流等多类交互，逻辑彼此耦合（如上传与提交共用令牌刷新/权限判断）。
 * 拆分会导致跨文件共享大量表单状态与守卫，降低可读性，故保持单文件（>500 行）。
 */
import type { components } from "../../../types/api-types";
import { request, refreshCAccessToken, type HttpResponseError } from "../../../utils/request";
import { getAccessToken, getCAccessToken, getUserIdFromAccessToken } from "../../../utils/token";
import { BASE_URL } from "../../../utils/config";
import { resolveAssetUrl } from "../../../utils/url";
import { formatThousands } from "../../../utils/format";
import { getVisitorId } from "../../../utils/visitor";
import {
  buildValuationSharePath,
  fetchEmployeeId,
  parseValuationQuery,
  VALUATION_SHARE_IMAGE,
  VALUATION_SHARE_TITLE,
} from "../../../utils/valuation-share";

type PublicLeadCreate = components["schemas"]["PublicLeadCreate"];
type PublicLeadResponse = components["schemas"]["PublicLeadResponse"];
type PublicUserInfo = components["schemas"]["PublicUserInfo"];
type UserResponse = components["schemas"]["UserResponse"];
type PublicLeadCountResponse = components["schemas"]["PublicLeadCountResponse"];
type PublicVisitEventRequest = components["schemas"]["PublicVisitEventRequest"];
type PublicShareEventRequest = components["schemas"]["PublicShareEventRequest"];
type PublicTrackingEventResponse = components["schemas"]["PublicTrackingEventResponse"];

/**
 * 权限说明：
 * - /public/* 接口要求 C 端令牌（aud=c）；内部员工持 admin 令牌时由 test-login 同时获取
 *   C 端令牌（c_access_token），request.ts 按 URL 自动选择令牌，/public/* 调用无需手动指定.
 * - c_access_token 过期时由 request.ts / uploadImage 自动用 c_refresh_token 刷新，无需重新登录
 *   （c_refresh_token 7 天有效期内）；两令牌均失效才需重新登录.
 */
const ORIENTATION_OPTIONS = ["南", "北", "东", "西", "南北", "东西"];

/**
 * 户型图上传上限（对齐 Web 与后端 PublicLeadCreate.images max_length=6）.
 */
const MAX_IMAGES = 6;

/** 面积合理上限（m²），防恶意超大数值（见代码审查 🟡-5，后端 gt=0 为准）. */
const MAX_AREA = 100000;
/** 预期价合理上限（万），防恶意超大数值. */
const MAX_EXPECTED_PRICE = 10000000;

/** wx.uploadFile 单次上传结果. */
interface UploadResult {
  statusCode: number;
  data: string;
}

/**
 * 调用 /public/files/upload 上传单张图片.
 *
 * wx.uploadFile 不经过 request.ts，无法享受自动注入与 401 刷新，需手动传 token；
 * 401 处理由 uploadImage 调用 refreshCAccessToken 后重试完成.
 */
function doUploadFile(filePath: string, token: string): Promise<UploadResult> {
  return new Promise<UploadResult>((resolve, reject) => {
    wx.uploadFile({
      url: `${BASE_URL}/public/files/upload`,
      filePath,
      name: "file",
      header: { Authorization: `Bearer ${token}` },
      success: (res) => resolve({ statusCode: res.statusCode, data: res.data }),
      fail: (err) => reject(err),
    });
  });
}

interface ValuationForm {
  community_name: string;
  community_id: string;
  district: string;
  business_area: string;
  layout: string;
  area: string;
  orientation: string;
  floor: string;
  total_floor: string;
  expected_price: string;
  remarks: string;
  images: string[];
}

interface PageData {
  form: ValuationForm;
  /** 已上传图片的完整 URL（供 wxml <image> 加载，与 form.images 同步）. */
  displayImages: string[];
  submitting: boolean;
  /** 提交成功至跳转完成前的导航守卫：置真后禁止再次提交，防止跳转延迟窗口内重复线索. */
  navigating: boolean;
  // 户型三段
  layoutRoom: string;
  layoutHall: string;
  layoutToilet: string;
  // 朝向
  orientationOptions: string[];
  // 手机号
  loggedIn: boolean;
  hasPhone: boolean;
  canEditPhone: boolean;
  // 估价报告计数 banner
  leadCountTotal: number;
  leadCountDisplay: string;
  leadCountLoading: boolean;
  leadCountVisible: boolean;
  // 分享归因（Task 6）
  /** 进入参数携带的分享归属员工 ID（空串=无归属）. */
  referrer: string;
  /** 当前登录用户是否为内部员工（admin 令牌识别成功）. */
  isEmployee: boolean;
  /** 员工自身 ID（识别成功置值，分享时作为 referrer 归属）. */
  employeeId: string;
}

interface PageCustom {
  getToken(): string;
  onInput(e: WechatMiniprogram.Input): void;
  onCommunityChange(e: WechatMiniprogram.CustomEvent): void;
  onCommunitySelect(e: WechatMiniprogram.CustomEvent): void;
  onCommunityUseQuery(e: WechatMiniprogram.CustomEvent): void;
  onCommunityClear(): void;
  onLayoutInput(e: WechatMiniprogram.Input): void;
  onOrientationTap(e: WechatMiniprogram.BaseEvent): void;
  onChooseImage(): void;
  onRemoveImage(e: WechatMiniprogram.BaseEvent): void;
  uploadImage(filePath: string): Promise<string>;
  loadLogin(): void;
  loadLeadCount(): void;
  animateLeadCount(target: number): void;
  clearLeadCountTimer(): void;
  leadCountTimer: ReturnType<typeof setInterval> | null;
  onPhoneTap(): void;
  onPhoneModalBound(): void;
  onPhoneModalGoBindAccount(): void;
  onGoCommunitySample(): void;
  requireLogin(): void;
  onGoLogin(): void;
  onSubmit(): void;
  afterSubmitSuccess(): void;
  handleUnauthorized(): void;
  onLoad(options: Record<string, string | undefined>): void;
  loadEmployee(): void;
  /** 员工分享事件上报（card/timeline），静默失败. */
  reportShareEvent(shareType: "card" | "timeline"): void;
  onMineTap(): void;
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent;
  onShareTimeline(): WechatMiniprogram.Page.ICustomTimelineContent;
}

/** phone-bind-modal 组件实例上需调用的方法（selectComponent 返回类型默认不含自定义方法）. */
interface PhoneBindModalInstance {
  show(): void;
  hide(): void;
}

Page<PageData, PageCustom>({
  data: {
    form: {
      community_name: "",
      community_id: "",
      district: "",
      business_area: "",
      layout: "",
      area: "",
      orientation: "",
      floor: "",
      total_floor: "",
      expected_price: "",
      remarks: "",
      images: [],
    },
    displayImages: [],
    submitting: false,
    navigating: false,
    layoutRoom: "",
    layoutHall: "",
    layoutToilet: "",
    orientationOptions: ORIENTATION_OPTIONS,
    loggedIn: false,
    hasPhone: false,
    canEditPhone: false,
    leadCountTotal: 0,
    leadCountDisplay: "0",
    leadCountLoading: false,
    leadCountVisible: true,
    referrer: "",
    isEmployee: false,
    employeeId: "",
  },

  onLoad(options: Record<string, string | undefined>) {
    // 分享/扫码进入：解析 referrer（分享归属员工 ID），提交时透传后端归因
    const { referrer } = parseValuationQuery(options);
    // 同步取当前登录员工 ID 作为 employeeId 初值：onShareAppMessage 是同步回调，
    // 无法 await loadEmployee；先从 access_token 解析 sub 填充，确保进入后立即
    // 分享仍携带 referrer 归因（loadEmployee 完成后由后端确认值覆盖）
    this.setData({ referrer, employeeId: getUserIdFromAccessToken() });
    // 分享/扫码进入（带 referrer）：静默上报访问埋点（PV +1 / UV 按匿名 visitor_id 去重），
    // 免登录接口（skipAuth 不携带令牌）；source 对齐分享 path 的进入渠道参数；失败不打扰用户
    if (referrer) {
      const body: PublicVisitEventRequest = {
        visitor_id: getVisitorId(),
        referrer,
        ...(options.source ? { source: options.source } : {}),
      };
      request<PublicTrackingEventResponse>({
        url: "/public/valuations/visit-events",
        method: "POST",
        data: body,
        skipAuth: true,
      }).catch(() => {});
    }
    // 内部员工（admin 令牌存在）：识别身份后展示分享横幅 + 启用分享菜单；
    // 识别失败静默降级（非员工不显示横幅，不影响表单）
    if (getAccessToken()) {
      this.loadEmployee();
    }
  },

  /**
   * 识别当前登录员工（/auth/me）.
   * 成功置 isEmployee=true/employeeId，并启用分享菜单（右上角分享 + 朋友圈）；
   * 失败（401/403/网络）静默，不阻断表单与正常分享.
   */
  async loadEmployee() {
    try {
      const employeeId = await fetchEmployeeId();
      this.setData({ isEmployee: true, employeeId });
      wx.showShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
    } catch {
      // 静默降级：非员工不显示横幅
    }
  },

  onShow() {
    this.loadLogin();
    this.loadLeadCount();
    // 员工识别补强：tab 页从登录页返回（onLoad 不重跑）时，若已有 admin 令牌
    // 且尚未识别员工，再次尝试识别以展示分享横幅；识别成功置 isEmployee=true
    // 后不再重复请求，失败（令牌失效等）静默降级
    if (getAccessToken() && !this.data.isEmployee) {
      this.loadEmployee();
    }
  },

  onHide() {
    this.clearLeadCountTimer();
  },

  onUnload() {
    this.clearLeadCountTimer();
  },

  leadCountTimer: null,

  getToken() {
    return getAccessToken();
  },

  /**
   * 加载登录态：优先用 C 端令牌调 /public/auth/me（canEditPhone=true），
   * C 端令牌不存在或失效时回退 admin 令牌调 /auth/me（canEditPhone=false）.
   * 仅提取手机号相关状态（loggedIn / hasPhone / canEditPhone）.
   */
  async loadLogin() {
    const cToken = getCAccessToken();
    const adminToken = this.getToken();
    if (!cToken && !adminToken) {
      this.setData({ loggedIn: false, hasPhone: false, canEditPhone: false });
      return;
    }
    // 优先用 C 端令牌调 /public/auth/me（canEditPhone=true）；
    // 不传 header，request.ts 自动注入 c_access_token 并在过期时自动刷新
    if (cToken) {
      try {
        const pub = await request<PublicUserInfo>({ url: "/public/auth/me" });
        this.setData({ loggedIn: true, canEditPhone: true, hasPhone: !!pub.phone });
        return;
      } catch {
        // C 端令牌失效（refresh_token 也过期），回退 admin 令牌
      }
    }
    // admin 令牌调 /auth/me
    try {
      const admin = await request<UserResponse>({ url: "/auth/me" });
      this.setData({ loggedIn: true, canEditPhone: false, hasPhone: !!admin.phone });
    } catch {
      this.setData({ loggedIn: false, hasPhone: false, canEditPhone: false });
    }
  },

  /**
   * 拉取累计线索总数（公开接口，skipAuth）。
   * 成功后从 0 缓动到目标值；失败静默隐藏 banner，不阻断表单。
   */
  async loadLeadCount() {
    // 重置：显示加载态，清旧动画
    this.clearLeadCountTimer();
    this.setData({
      leadCountVisible: true,
      leadCountLoading: true,
      leadCountTotal: 0,
      leadCountDisplay: "0",
    });
    try {
      const res = await request<PublicLeadCountResponse>({
        url: "/public/leads/count",
        skipAuth: true,
      });
      const total = Math.max(0, Math.floor(res.total || 0));
      this.setData({ leadCountTotal: total, leadCountLoading: false });
      this.animateLeadCount(total);
    } catch {
      // 营销元素，失败静默隐藏，不弹错误
      this.setData({ leadCountVisible: false, leadCountLoading: false });
    }
  },

  /**
   * 从 0 缓动到 target（约 1.2s，ease-out）。
   * target<=0 时直接显示 "0" 不跑动画。
   */
  animateLeadCount(target: number) {
    this.clearLeadCountTimer();
    if (target <= 0) {
      this.setData({ leadCountDisplay: "0" });
      return;
    }
    const duration = 1200;
    const start = Date.now();
    this.leadCountTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / duration);
      // ease-out: progress = 1 - (1-t)^2
      const progress = 1 - (1 - t) * (1 - t);
      const current = Math.floor(target * progress);
      this.setData({ leadCountDisplay: formatThousands(current) });
      if (t >= 1) {
        // 终值用精确 target，避免浮点取整误差
        this.setData({ leadCountDisplay: formatThousands(target) });
        this.clearLeadCountTimer();
      }
    }, 16);
  },

  clearLeadCountTimer() {
    if (this.leadCountTimer) {
      clearInterval(this.leadCountTimer);
      this.leadCountTimer = null;
    }
  },

  onInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as keyof ValuationForm | undefined;
    if (!field) {
      return;
    }
    // 用 setData 路径表达式局部更新
    const patch: WechatMiniprogram.IAnyObject = {
      [`form.${field}`]: e.detail.value,
    };
    this.setData(patch);
  },

  /**
   * 社区搜索组件输入变化：仅同步回显（组件内部已自行管理下拉态），此处按需保留值.
   * 当前表单不依赖该值展示，仅透传以支持外部受控场景.
   */
  onCommunityChange(e: WechatMiniprogram.CustomEvent) {
    // 无业务字段需要即时同步，保留钩子便于后续复用
  },

  /**
   * 社区搜索组件选中结果：把完整小区信息写入表单.
   * detail = { id, name, district, business_circle }.
   */
  onCommunitySelect(e: WechatMiniprogram.CustomEvent) {
    const d = e.detail as { id: string; name: string; district: string; business_circle: string };
    this.setData({
      "form.community_name": d.name,
      "form.community_id": d.id,
      "form.district": d.district,
      "form.business_area": d.business_circle,
    });
  },

  /**
   * 搜索无匹配时以当前关键词作为小区名提交（community_id 留空）.
   * 同步清空 district/business_area：走 usequery 路径的小区没有行政区/商圈数据，
   * 若不清理，先前选过的小区会遗留旧行政区/商圈并随单提交（见代码审查 🟡-2）.
   */
  onCommunityUseQuery(e: WechatMiniprogram.CustomEvent) {
    const query = (e.detail as { query: string }).query.trim();
    if (!query) {
      return;
    }
    this.setData({
      "form.community_name": query,
      "form.community_id": "",
      "form.district": "",
      "form.business_area": "",
    });
  },

  /** 清空小区选择：同步清空表单中相关字段. */
  onCommunityClear() {
    this.setData({
      "form.community_name": "",
      "form.community_id": "",
      "form.district": "",
      "form.business_area": "",
    });
  },

  /** 户型三段输入：按 dataset.field 更新，实时组合为 n室n厅n卫（空段跳过；室为空则 layout 为空）. */
  onLayoutInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as "room" | "hall" | "toilet";
    const value = e.detail.value.replace(/\D/g, "");
    const room = field === "room" ? value : this.data.layoutRoom;
    const hall = field === "hall" ? value : this.data.layoutHall;
    const toilet = field === "toilet" ? value : this.data.layoutToilet;
    let layout = "";
    if (room.trim()) {
      layout = `${room.trim()}室`;
      if (hall.trim()) {
        layout += `${hall.trim()}厅`;
      }
      if (toilet.trim()) {
        layout += `${toilet.trim()}卫`;
      }
    }
    const key = field === "room" ? "layoutRoom" : field === "hall" ? "layoutHall" : "layoutToilet";
    this.setData({ [key]: value, "form.layout": layout });
  },

  /** 朝向直接选择：点击选项即回填，无需二次确认. */
  onOrientationTap(e: WechatMiniprogram.BaseEvent) {
    const orientation = e.currentTarget.dataset.value as string;
    if (orientation) {
      this.setData({ "form.orientation": orientation });
    }
  },

  async onChooseImage() {
    const cToken = getCAccessToken();
    const token = this.getToken();
    if (!cToken && !token) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }
    const remaining = MAX_IMAGES - this.data.form.images.length;
    if (remaining <= 0) {
      wx.showToast({ title: "最多上传6张", icon: "none" });
      return;
    }
    try {
      const res = await new Promise<WechatMiniprogram.ChooseMediaSuccessCallbackResult>(
        (resolve, reject) => {
          wx.chooseMedia({
            count: remaining,
            mediaType: ["image"],
            sourceType: ["album", "camera"],
            success: resolve,
            fail: reject,
          });
        }
      );
      for (const file of res.tempFiles) {
        // 仅允许 jpg/jpeg/png
        if (!/\.(jpe?g|png)$/i.test(file.tempFilePath)) {
          wx.showToast({ title: "仅支持jpg/jpeg/png", icon: "none" });
          continue;
        }
        try {
          const url = await this.uploadImage(file.tempFilePath);
          // form.images 存相对路径（与后端存储一致，提交时用）；displayImages 存完整 URL 供 <image> 加载
          const newImages = [...this.data.form.images, url];
          this.setData({
            "form.images": newImages,
            displayImages: newImages.map((u) => resolveAssetUrl(u)),
          });
        } catch {
          wx.showToast({ title: "上传失败", icon: "none" });
        }
      }
    } catch {
      // 用户取消等，静默
    }
  },

  onRemoveImage(e: WechatMiniprogram.BaseEvent) {
    const index = Number(e.currentTarget.dataset.index);
    const images = this.data.form.images;
    const displayImages = this.data.displayImages;
    if (index < 0 || index >= images.length) {
      return;
    }
    this.setData({
      "form.images": images.filter((_, i) => i !== index),
      displayImages: displayImages.filter((_, i) => i !== index),
    });
  },

  async uploadImage(filePath: string): Promise<string> {
    // /public/files/upload 需 C 端令牌（aud=c）；优先 c_access_token，回退 access_token
    const token = getCAccessToken() || this.getToken();
    let res = await doUploadFile(filePath, token);
    // 401 时 c_access_token 可能过期，刷新后重试一次（refresh_token 也失效则放弃，抛 401）
    if (res.statusCode === 401) {
      const newToken = await refreshCAccessToken();
      if (newToken) {
        res = await doUploadFile(filePath, newToken);
      }
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      const error: HttpResponseError = { statusCode: res.statusCode, body: res.data };
      throw error;
    }
    // 后端 FileUploadResponse 返回 { url, filename, thumbnail_url }
    const data = JSON.parse(res.data) as { url?: string };
    if (!data.url) {
      throw new Error("upload response missing url");
    }
    return data.url;
  },

  onPhoneTap() {
    if (!this.data.loggedIn) {
      this.onGoLogin();
      return;
    }
    if (!this.data.canEditPhone) {
      // 内部员工（admin 身份）手机号在后台维护，C 端不可编辑
      wx.showToast({ title: "手机号在后台维护", icon: "none" });
      return;
    }
    // 仅未绑定手机号时允许完善（首次设置）
    if (this.data.hasPhone) {
      return;
    }
    // 主动触发微信授权弹窗
    const modal = this.selectComponent("#phoneModal") as unknown as PhoneBindModalInstance | null;
    if (modal && typeof modal.show === "function") {
      modal.show();
    }
  },

  /** 微信授权绑定成功：刷新 hasPhone 状态. */
  onPhoneModalBound() {
    this.setData({ hasPhone: true });
    wx.showToast({ title: "手机号绑定成功", icon: "success" });
  },

  /** 用户在合并确认视图选「前往绑定已有账号」：跳转 bind-account 页. */
  onPhoneModalGoBindAccount() {
    wx.navigateTo({ url: "/pages/bind-account/index/index" });
  },

  /** 小区市场分析示例入口：直接进入示例数据页（不校验登录）. */
  onGoCommunitySample() {
    wx.navigateTo({ url: "/pages/community-analysis/index/index?mode=sample" });
  },

  /**
   * 统一 401 处理（/public/* 因令牌失效或 aud 不匹配返回 401）：
   * - 仍持有 admin 令牌（内部员工，仅缺 c_access_token）→ 属有效登录态但无 C 端估价权限，
   *   提示「无估价权限」，而非误弹登录；
   * - 无 admin 令牌（纯 C 端用户，令牌已失效）→ 引导重新登录.
   */
  handleUnauthorized() {
    if (this.getToken()) {
      wx.showToast({ title: "当前账号无估价权限", icon: "none" });
    } else {
      this.requireLogin();
    }
  },

  /**
   * 未登录拦截：弹「需要登录」提示，确认后跳转登录页.
   * 登录成功后回到本页（from=valuation 使登录页 navigateBack 返回），已填表单因本页存活于
   * 导航栈而完整保留，不发生数据丢失.
   */
  requireLogin() {
    wx.showModal({
      title: "需要登录",
      content: "登录后才能提交估价，是否前往登录？",
      confirmText: "去登录",
      cancelText: "取消",
      success: (res) => {
        if (res.confirm) {
          this.onGoLogin();
        }
      },
    });
  },

  onGoLogin() {
    // 后端微信登录未完成，先跳账号密码测试登录页（test-login）；
    // from=valuation 让登录成功后可 navigateBack 返回本页并保留已填表单
    wx.navigateTo({ url: "/pages/test-login/index/index?from=valuation" });
  },

  async onSubmit() {
    // submitting / navigating 双守卫：提交中或提交成功至跳转完成前均禁止再次触发，
    // 防止跳转延迟窗口内重复提交产生重复线索（见代码审查 🟡-1）
    if (this.data.submitting || this.data.navigating) {
      return;
    }
    const token = this.getToken() || getCAccessToken();
    if (!token) {
      this.requireLogin();
      return;
    }
    const {
      community_name,
      community_id,
      district,
      business_area,
      layout,
      area,
      orientation,
      floor,
      total_floor,
      expected_price,
      remarks,
      images,
    } = this.data.form;

    if (!community_name) {
      wx.showToast({ title: "请输入小区名称", icon: "none" });
      return;
    }
    if (!floor || !total_floor) {
      wx.showToast({ title: "请输入楼层与总高", icon: "none" });
      return;
    }

    // 数值范围校验：area/expected_price 需 > 0 且在合理上限内（见代码审查 🟡-5，后端 gt=0 为准）
    const areaNum = area ? Number(area) : undefined;
    const priceNum = expected_price ? Number(expected_price) : undefined;
    if (areaNum !== undefined && (Number.isNaN(areaNum) || areaNum <= 0 || areaNum > MAX_AREA)) {
      wx.showToast({ title: "请输入有效的面积", icon: "none" });
      return;
    }
    if (priceNum !== undefined && (Number.isNaN(priceNum) || priceNum <= 0 || priceNum > MAX_EXPECTED_PRICE)) {
      wx.showToast({ title: "请输入有效的预期价", icon: "none" });
      return;
    }

    const body: PublicLeadCreate = {
      community_name,
      community_id: community_id || undefined,
      district: district || undefined,
      business_area: business_area || undefined,
      layout: layout || undefined,
      area: areaNum,
      floor_info: `${floor}/${total_floor}`,
      orientation: orientation || undefined,
      remarks: remarks || undefined,
      expected_price: priceNum,
      images: images.length ? images : undefined,
      // 分享归因：透传进入时的 referrer（分享归属员工 ID），后端首次留资写入归属
      referrer: this.data.referrer || undefined,
    };

    this.setData({ submitting: true });
    try {
      await request<PublicLeadResponse>({
        url: "/public/leads",
        method: "POST",
        data: body,
        // 不传 header，request.ts 按 /public/* 自动注入 C 端令牌
      });
      wx.showToast({ title: "提交成功", icon: "success" });
      // 提交成功即置 navigating 守卫：此后 400ms 跳转延迟窗口内无法再次提交；
      // submitting 的释放推迟到 afterSubmitSuccess 跳转完成回调，杜绝窗口内重复触发.
      this.setData({ navigating: true });
      // 极短延迟让成功提示可见即跳转，避免用户感知到明显跳转延迟
      setTimeout(() => {
        this.afterSubmitSuccess();
      }, 400);
    } catch (err) {
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      if (statusCode === 401) {
        // 令牌过期或受众不匹配：内部员工（仅持 admin 令牌）无 C 端估价权限，
        // 普通用户令牌失效引导重新登录
        this.handleUnauthorized();
      } else {
        wx.showToast({ title: "提交失败，请重试", icon: "none" });
      }
      // 失败路径未触发跳转，立即释放提交态（navigating 未置位）
      this.setData({ submitting: false });
    }
  },

  /**
   * 提交成功后统一跳转「我的估价」列表页，并正确维护导航历史栈：
   * - 本页若由列表页 navigateTo 进入（onGoValuation），则 navigateBack 返回该列表，
   *   使栈为 […, list]，从列表页后退时直接回到「我的页面」（profile），不再回到提交表单或重复列表；
   *   返回后列表页 onShow 会静默刷新，展示最新数据。
   * - 若由 tab 直达（栈内无列表页），则 redirectTo 替换本页为列表，同样不把提交页保留为后退目标。
   */
  afterSubmitSuccess() {
    const pages = getCurrentPages();
    const prev = pages.length > 1 ? pages[pages.length - 2] : null;
    // 跳转完成后释放 submitting / navigating（本页即将销毁，释放仅作状态收尾）
    const release = () => {
      this.setData({ submitting: false, navigating: false });
    };
    if (prev && prev.route === "pages/valuation/list/index") {
      wx.navigateBack({ complete: release });
    } else {
      wx.redirectTo({ url: "/pages/valuation/list/index", complete: release });
    }
  },

  /** 员工横幅「我的客户」入口：进入我的获客页（submit 为 tabBar 页，navigateTo 普通页 OK）. */
  onMineTap() {
    wx.navigateTo({ url: "/pages/valuation/mine/index" });
  },

  /** 分享卡片（与 about 服务页一致）；referrer 用自身员工 ID（员工态优先），未识别则透传进入时的 referrer. */
  onShareAppMessage() {
    const shareReferrer = this.data.employeeId || this.data.referrer;
    this.reportShareEvent("card");
    return {
      title: VALUATION_SHARE_TITLE,
      path: buildValuationSharePath(shareReferrer),
      imageUrl: VALUATION_SHARE_IMAGE,
    };
  },

  /** 分享朋友圈：query 用 path 的 query 段（朋友圈分享不支持完整 path）. */
  onShareTimeline() {
    const shareReferrer = this.data.employeeId || this.data.referrer;
    this.reportShareEvent("timeline");
    const path = buildValuationSharePath(shareReferrer);
    const query = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
    return {
      title: VALUATION_SHARE_TITLE,
      query,
      imageUrl: VALUATION_SHARE_IMAGE,
    };
  },

  /**
   * 员工分享事件上报（share-events，需登录令牌，request.ts 对 /public/* 自动注入）.
   * employeeId 未识别（游客/普通用户转发）不上报；失败静默不打扰用户.
   */
  reportShareEvent(shareType: "card" | "timeline") {
    if (!this.data.employeeId) {
      return;
    }
    const body: PublicShareEventRequest = { share_type: shareType };
    request<PublicTrackingEventResponse>({
      url: "/public/valuations/share-events",
      method: "POST",
      data: body,
    }).catch(() => {});
  },
});
