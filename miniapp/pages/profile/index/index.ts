import type { components } from "../../../types/api-types";
import { BASE_URL } from "../../../utils/config";
import { fetchPendingAssessmentCount } from "../../../utils/pending-assessment";
import { updateWechatProfile } from "../../../utils/profile";
import { refreshCAccessToken, request, type HttpResponseError } from "../../../utils/request";
import {
  getAccessToken,
  getCAccessToken,
  getCTemporary,
  getCRefreshToken,
  getTokenAud,
  getPhonePrompted,
  setCTemporary,
  setPhonePrompted,
} from "../../../utils/token";
import { resolveAssetUrl } from "../../../utils/url";

type PublicUserInfo = components["schemas"]["PublicUserInfo"];
type UserResponse = components["schemas"]["UserResponse"];
type PublicRefreshTokenRequest = components["schemas"]["PublicRefreshTokenRequest"];
type PublicLogoutResponse = components["schemas"]["PublicLogoutResponse"];
type FileUploadResponse = components["schemas"]["FileUploadResponse"];
type RecruitCampaignResponse = components["schemas"]["RecruitCampaignResponse"];

/**
 * customer 角色基础权限：仅含这些权限视为普通用户；permissions 含其他业务权限 → 内部员工.
 *
 * 判定依据：C 端 /me 返回的 permissions 为主角色 + 附加角色权限并集。内部员工为
 * 「后台角色 + customer 附加角色」的多角色用户，其并集必然包含后台业务权限，
 * 故任何超出 customer 基础权限的代码即视为内部身份（⚠️ TODO 待后端下发显式身份字段）.
 */
const CUSTOMER_BASE_PERMISSIONS = ["valuation:write", "lead:submit"];

/** 内部入口（均带 route，onMenuTap 统一 navigateTo 跳转）. */
const INTERNAL_ENTRIES = [
  { key: "evaluate", title: "评估工作台", sub: "待评估线索处理", icon: "评", route: "/pages/valuation/evaluate/index" },
  { key: "properties", title: "房源查询", sub: "交易中心月度签约房源", icon: "房", route: "/pages/properties/list/index" },
  { key: "analysis", title: "数据分析", sub: "商圈/小区市场行情", icon: "析", route: "/pages/analysis/index/index" },
  { key: "viewing", title: "带看记录", sub: "带看 / 谈价 / 面谈", icon: "带", route: "/pages/viewing/projects/index/index" },
  { key: "renovation", title: "装修记录", sub: "改造 / 施工进度", icon: "装", route: "/pages/renovation/projects/index/index" },
  { key: "ledger", title: "项目记账", sub: "收支 / 台账", icon: "账", route: "/pages/ledger/projects/index/index" },
];

/** 分享获客入口（onMenuTap 按 action 分发：switch-tab-* 为 tabBar 页 switchTab，recruit 走 onRecruitTap 拉活动跳转，property-sheet 进我的房源单页）. */
const SHARE_ENTRIES: ShareEntry[] = [
  { key: "share-property", title: "房源分享", sub: "房源转发 / 客户预约", icon: "房", action: "switch-tab-projects" },
  { key: "share-valuation", title: "评估分享", sub: "评估转发 / 线索跟进", icon: "估", action: "switch-tab-valuation" },
  { key: "share-recruit", title: "招募分享", sub: "招募转发 / 拉新归因", icon: "招", action: "recruit" },
  { key: "share-sheet", title: "房源单分享", sub: "多房源一图分享", icon: "单", action: "property-sheet" },
];

interface InternalEntry {
  key: string;
  title: string;
  sub: string;
  icon: string;
  /** 已落地页面的路由；无 route 的条目点击走「功能待开放」. */
  route?: string;
}

/** 分享获客入口点击动作. */
type ShareEntryAction = "switch-tab-projects" | "switch-tab-valuation" | "recruit" | "property-sheet";

interface ShareEntry {
  key: string;
  title: string;
  sub: string;
  icon: string;
  /** action 的分发依据：switch-tab-* 跳对应 tabBar 页，recruit 复用 onRecruitTap 动态拉活动，property-sheet 进我的房源单页. */
  action: ShareEntryAction;
}

interface PageData {
  loading: boolean;
  loggedIn: boolean;
  loggingOut: boolean;
  nickname: string;
  username: string;
  avatarChar: string;
  /** 已上传到服务器的用户头像 URL（来自 user.avatar），空表示未设置头像. */
  avatarUrl: string;
  isInternal: boolean;
  /** 是否为 C 端（customer）身份，决定手机号/微信资料是否可在此维护. */
  canEditPhone: boolean;
  roleBadgeText: string;
  roleLabel: string;
  phoneDisplay: string;
  hasPhone: boolean;
  /** 昵称是否处于 input 编辑态（用户点刷新按钮后切换）. */
  nicknameEditing: boolean;
  /** 昵称 input 当前值. */
  nicknameInput: string;
  /** 头像上传中标志，控制 button loading 与避免重复触发. */
  avatarUploading: boolean;
  /** 昵称保存中标志，避免 onblur 重复触发保存. */
  nicknameSaving: boolean;
  internalEntries: InternalEntry[];
  /** 分享获客分组（房源/评估/招募分享），仅内部用户可见. */
  shareEntries: ShareEntry[];
  /** 评估工作台待办角标（pending_assessment 数；0/null 不显示）. */
  evaluateBadge: number;
}

interface PageCustom {
  getToken(): string;
  loadUser(): void;
  resetToGuest(): void;
  clearTokensAndReset(): void;
  loadPublicUser(authHeader: { Authorization: string }): Promise<boolean>;
  loadAdminUser(authHeader: { Authorization: string }): Promise<boolean>;
  applyPublicUser(user: PublicUserInfo): void;
  applyAdminUser(user: UserResponse): void;
  /** 拉取评估工作台待办角标：403/失败静默隐藏（内部用户专属）. */
  loadEvaluateBadge(): void;
  onGoLogin(): void;
  onLogout(): void;
  onPhoneTap(): void;
  onValuationTap(): void;
  onBookingsTap(): void;
  onRecruitTap(): void;
  onMenuTap(e: WechatMiniprogram.BaseEvent): void;
  onPhoneModalSkip(): void;
  onPhoneModalBound(): void;
  onPhoneModalGoBindAccount(): void;
  /** chooseAvatar 回调：拿到临时图片路径后立即上传到后端并调端点更新 avatar，独立完成. */
  onChooseAvatar(e: WechatMiniprogram.CustomEvent): void;
  /** 用户点击昵称旁刷新按钮：切换到 input 编辑态，等待用户输入或选「使用微信昵称」. */
  onNicknameRefreshTap(): void;
  /** 昵称 input 输入同步 + 启动防抖自动保存. */
  onNicknameInput(e: WechatMiniprogram.Input): void;
  /** 昵称 input blur：清防抖并兜底保存. */
  onNicknameBlur(e: WechatMiniprogram.Input): void;
  /** 调端点保存 nickname（防抖与 onblur 共用）. */
  saveNickname(nickname: string): void;
  /** 上传头像临时文件到 /public/files/upload，401 时刷新 C 端令牌后重试一次. */
  uploadAvatar(filePath: string): Promise<string>;
  /** 重置微信资料编辑相关字段到初始值. */
  resetWechatEditState(): void;
}

/** phone-bind-modal 组件实例上需调用的方法（selectComponent 返回类型默认不含自定义方法）. */
interface PhoneBindModalInstance {
  show(): void;
  hide(): void;
}

/** wx.uploadFile 单次上传结果. */
interface UploadResult {
  statusCode: number;
  data: string;
}

/**
 * 昵称自动保存防抖计时器（模块级，profile 页单例）.
 *
 * 用户点「使用微信昵称」按钮后 input 保持焦点，onblur 不会触发；
 * 改为 bindinput 触发后延迟 500ms 自动保存，期间用户继续输入则重新计时。
 */
let nicknameDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/** 昵称自动保存防抖延迟（毫秒）. */
const NICKNAME_DEBOUNCE_MS = 500;

/**
 * 调用 /public/files/upload 上传单张图片.
 *
 * wx.uploadFile 不经过 request.ts，无法享受自动注入与 401 刷新，需手动传 token；
 * 401 处理由 uploadAvatar 调用 refreshCAccessToken 后重试完成.
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

/** 是否内部员工：permissions 含 customer 基础权限之外的代码. */
function isInternalUser(permissions: string[]): boolean {
  return permissions.some((p) => !CUSTOMER_BASE_PERMISSIONS.includes(p));
}

/** 11 位手机号脱敏展示（如 138****5678）；非 11 位原样返回. */
function maskPhone(phone: string): string {
  if (phone.length === 11) {
    return `${phone.slice(0, 3)}****${phone.slice(7)}`;
  }
  return phone;
}

Page<PageData, PageCustom>({
  data: {
    loading: true,
    loggedIn: false,
    loggingOut: false,
    nickname: "未登录用户",
    username: "",
    avatarChar: "我",
    avatarUrl: "",
    isInternal: false,
    canEditPhone: false,
    roleBadgeText: "",
    roleLabel: "未登录",
    phoneDisplay: "完善手机号",
    hasPhone: false,
    nicknameEditing: false,
    nicknameInput: "",
    avatarUploading: false,
    nicknameSaving: false,
    internalEntries: INTERNAL_ENTRIES,
    shareEntries: SHARE_ENTRIES,
    evaluateBadge: 0,
  },

  getToken() {
    return getAccessToken();
  },

  onShow() {
    // TabBar 页从登录页 switchTab 返回时 onLoad 不会重跑，需在每次显示时刷新登录态
    this.loadUser();
    // 临时账号用户未弹过手机号引导时自动触发弹窗；
    // 用户选「暂不绑定」后置 c_phone_prompted=true，后续不再自动弹；
    // 用户主动点击「完善手机号」可再次触发（onPhoneTap → modal.show）
    if (getCTemporary() && !getPhonePrompted()) {
      const modal = this.selectComponent("#phoneModal") as unknown as PhoneBindModalInstance | null;
      if (modal && typeof modal.show === "function") {
        modal.show();
      }
    }
  },

  resetToGuest() {
    this.setData({
      loading: false,
      loggedIn: false,
      nickname: "未登录用户",
      username: "",
      avatarChar: "我",
      avatarUrl: "",
      isInternal: false,
      canEditPhone: false,
      roleBadgeText: "",
      roleLabel: "未登录",
      phoneDisplay: "完善手机号",
      hasPhone: false,
      evaluateBadge: 0,
    });
    this.resetWechatEditState();
  },

  /** 重置微信资料编辑相关字段，避免下次进入编辑态时残留旧数据. */
  resetWechatEditState() {
    // 清防抖计时器：避免编辑态被重置后旧计时器仍触发意外保存
    if (nicknameDebounceTimer) {
      clearTimeout(nicknameDebounceTimer);
      nicknameDebounceTimer = null;
    }
    this.setData({
      nicknameEditing: false,
      nicknameInput: "",
      avatarUploading: false,
      nicknameSaving: false,
    });
  },

  clearTokensAndReset() {
    wx.removeStorageSync("access_token");
    wx.removeStorageSync("refresh_token");
    wx.removeStorageSync("c_access_token");
    wx.removeStorageSync("c_refresh_token");
    this.resetToGuest();
  },

  applyPublicUser(user: PublicUserInfo) {
    const isInternal = isInternalUser(user.permissions ?? []);
    const nickname = user.nickname || user.username;
    const phone = user.phone || "";
    this.setData({
      loading: false,
      loggedIn: true,
      canEditPhone: true,
      nickname,
      username: user.username,
      avatarChar: nickname.slice(0, 1) || "我",
      avatarUrl: resolveAssetUrl(user.avatar),
      isInternal,
      roleBadgeText: isInternal ? "内部员工" : "C端用户",
      roleLabel: isInternal ? "内部用户" : "C端用户",
      phoneDisplay: phone || "完善手机号",
      hasPhone: !!phone,
    });
    // 评估工作台角标：仅内部用户拉取（403/0 条/失败均静默隐藏）
    if (isInternal) {
      this.loadEvaluateBadge();
    } else {
      this.setData({ evaluateBadge: 0 });
    }
    this.resetWechatEditState();
  },

  applyAdminUser(user: UserResponse) {
    const nickname = user.nickname || user.username;
    const phone = user.phone || "";
    this.setData({
      loading: false,
      loggedIn: true,
      canEditPhone: false,
      nickname,
      username: user.username,
      avatarChar: nickname.slice(0, 1) || "我",
      avatarUrl: resolveAssetUrl(user.avatar),
      isInternal: true,
      roleBadgeText: "内部员工",
      roleLabel: "内部员工 · 已认证",
      phoneDisplay: phone ? maskPhone(phone) : "—",
      hasPhone: !!phone,
    });
    // 内部员工同样感知评估待办（接口要求 C 端令牌，admin-only 令牌 403 时静默隐藏）
    this.loadEvaluateBadge();
  },

  /** 拉取评估工作台待办角标：/my/acquired/stats 的 pending_assessment；403/失败静默返 null 不显示. */
  loadEvaluateBadge() {
    void fetchPendingAssessmentCount().then((count) => {
      this.setData({ evaluateBadge: count ?? 0 });
    });
  },

  async loadUser() {
    const token = this.getToken();
    if (!token) {
      this.resetToGuest();
      return;
    }
    const authHeader = { Authorization: `Bearer ${token}` };
    const aud = getTokenAud(token);

    // 依据 JWT aud 直接命中对应 /me：避免对内部令牌发 /public/auth/me 产生 401 噪音；
    // aud 无法解析时回退原双通道判定兜底
    if (aud === "c") {
      const ok = await this.loadPublicUser(authHeader);
      if (!ok) {
        this.clearTokensAndReset();
      }
      return;
    }
    if (aud === "admin") {
      const ok = await this.loadAdminUser(authHeader);
      if (!ok) {
        this.clearTokensAndReset();
      }
      return;
    }
    // aud 未知（异常令牌）→ 沿用双通道兜底
    let ok = await this.loadPublicUser(authHeader);
    if (!ok) {
      ok = await this.loadAdminUser(authHeader);
    }
    if (!ok) {
      // ⚠️ TODO access_token 过期时未接 refresh_token 自动续期；当前靠重新微信登录
      this.clearTokensAndReset();
    }
  },

  async loadPublicUser(authHeader: { Authorization: string }): Promise<boolean> {
    try {
      const pub = await request<PublicUserInfo>({
        url: "/public/auth/me",
        header: authHeader,
      });
      this.applyPublicUser(pub);
      return true;
    } catch {
      return false;
    }
  },

  async loadAdminUser(authHeader: { Authorization: string }): Promise<boolean> {
    try {
      const admin = await request<UserResponse>({
        url: "/auth/me",
        header: authHeader,
      });
      this.applyAdminUser(admin);
      return true;
    } catch {
      return false;
    }
  },

  onGoLogin() {
    wx.navigateTo({ url: "/pages/login/index/index" });
  },

  async onLogout() {
    if (this.data.loggingOut) {
      return;
    }
    this.setData({ loggingOut: true });
    // 撤销 C 端令牌（/public/auth/logout 需 aud=c 令牌，request.ts 自动注入 c_access_token）
    const cRefreshToken = getCRefreshToken();
    if (cRefreshToken) {
      try {
        const body: PublicRefreshTokenRequest = { refresh_token: cRefreshToken };
        await request<PublicLogoutResponse>({
          url: "/public/auth/logout",
          method: "POST",
          data: body,
          // 不传 header，request.ts 按 /public/* 自动注入 C 端令牌
        });
      } catch {
        // 服务端撤销失败忽略，本地照常登出
      }
    }
    wx.removeStorageSync("access_token");
    wx.removeStorageSync("refresh_token");
    wx.removeStorageSync("c_access_token");
    wx.removeStorageSync("c_refresh_token");
    this.resetToGuest();
    this.setData({ loggingOut: false });
    wx.showToast({ title: "已退出登录", icon: "none" });
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
    // 仅未绑定手机号时允许完善（首次设置）；已绑定则脱敏展示不可编辑
    if (this.data.hasPhone) {
      return;
    }
    // 主动触发微信授权弹窗（与 onShow 自动弹窗复用同一组件实例）
    const modal = this.selectComponent("#phoneModal") as unknown as PhoneBindModalInstance | null;
    if (modal && typeof modal.show === "function") {
      modal.show();
    }
  },

  onValuationTap() {
    // 我的估价：未登录跳登录页；已登录进入「我的评估」列表
    if (!this.data.loggedIn) {
      this.onGoLogin();
      return;
    }
    wx.navigateTo({ url: "/pages/valuation/list/index" });
  },

  /** 我的预约：未登录跳登录页；已登录进入「我的预约」列表（面向所有登录用户）. */
  onBookingsTap() {
    if (!this.data.loggedIn) {
      this.onGoLogin();
      return;
    }
    wx.navigateTo({ url: "/pages/bookings/mine/index" });
  },

  /**
   * 招募计划入口：拉取首个启用活动跳转招募详情页.
   * 需后台 recruit:read 权限（/admin/recruit/campaigns）；无活动或无权限 toast 提示不跳转.
   */
  async onRecruitTap() {
    if (!this.data.loggedIn) {
      this.onGoLogin();
      return;
    }
    if (!getAccessToken()) {
      // C 端用户（仅有 c_access_token）无后台令牌，无法访问 /admin/recruit/*
      wx.showToast({ title: "暂无权限查看招募活动", icon: "none" });
      return;
    }
    try {
      const campaigns = await request<RecruitCampaignResponse[]>({
        url: "/admin/recruit/campaigns",
      });
      const enabled = campaigns.find((c) => c.status === "enabled");
      if (!enabled) {
        wx.showToast({ title: "暂无可分享的招募活动", icon: "none" });
        return;
      }
      wx.navigateTo({ url: `/pages/recruit/detail/index?campaign_id=${enabled.id}` });
    } catch (err) {
      const statusCode = (err as HttpResponseError)?.statusCode;
      if (statusCode === 403) {
        wx.showToast({ title: "暂无权限查看招募活动", icon: "none" });
      } else {
        wx.showToast({ title: "加载失败，请重试", icon: "none" });
      }
    }
  },

  onMenuTap(e: WechatMiniprogram.BaseEvent) {
    // 分享获客分组：按 action 分发（两目标页均为 tabBar 页须 switchTab；recruit 动态拉活动跳转；
    // property-sheet 进我的房源单页，登录态由 mine 页与 request 层兜底，无需预检）
    const action = e.currentTarget.dataset.action as ShareEntryAction | undefined;
    if (action === "switch-tab-projects") {
      wx.switchTab({ url: "/pages/projects/list/index" });
      return;
    }
    if (action === "switch-tab-valuation") {
      wx.switchTab({ url: "/pages/valuation/submit/index" });
      return;
    }
    if (action === "recruit") {
      this.onRecruitTap();
      return;
    }
    if (action === "property-sheet") {
      wx.navigateTo({ url: "/pages/property-sheet/mine/index" });
      return;
    }
    // 已落地条目（route 存在）跳转对应页；未落地条目统一待开放
    const route = e.currentTarget.dataset.route as string | undefined;
    if (route) {
      wx.navigateTo({ url: route });
      return;
    }
    wx.showToast({ title: "功能待开放", icon: "none" });
  },

  /** 用户在手机号绑定弹窗选「暂不绑定」：标记已弹过，后续不再自动触发. */
  onPhoneModalSkip() {
    setPhonePrompted(true);
  },

  /** 手机号绑定成功：清临时账号标识、标记已弹过、刷新用户信息、toast 提示. */
  onPhoneModalBound() {
    setCTemporary(false);
    setPhonePrompted(true);
    this.loadUser();
    wx.showToast({ title: "手机号绑定成功", icon: "success" });
  },

  /** 用户在合并确认视图选「前往绑定已有账号」：跳转 bind-account 页（Task 8 实现）. */
  onPhoneModalGoBindAccount() {
    wx.navigateTo({ url: "/pages/bind-account/index/index" });
  },

  /**
   * chooseAvatar 回调（由头像位置 button[open-type=chooseAvatar] 触发）.
   * 拿到临时图片路径后立即上传到后端 /public/files/upload，然后调端点只更新 avatar_url。
   * 整个流程独立完成，无需用户二次确认。
   */
  onChooseAvatar(e: WechatMiniprogram.CustomEvent) {
    const detail = e.detail as { avatarUrl?: string };
    if (!detail.avatarUrl) {
      wx.showToast({ title: "获取头像失败", icon: "none" });
      return;
    }
    if (this.data.avatarUploading) {
      return;
    }
    this.setData({ avatarUploading: true });
    this.uploadAvatar(detail.avatarUrl)
      .then((serverUrl) => updateWechatProfile({ avatar_url: serverUrl }))
      .then(() => {
        this.setData({ avatarUploading: false });
        wx.showToast({ title: "头像已更新", icon: "success" });
        this.loadUser();
      })
      .catch((err: unknown) => {
        this.setData({ avatarUploading: false });
        const msg = (err as HttpResponseError)?.body ? "保存失败，请重试" : "网络错误，请重试";
        wx.showToast({ title: msg, icon: "none" });
      });
  },

  /** 用户点击昵称旁的「↻」刷新按钮：切换到 input 编辑态等待用户输入或选「使用微信昵称」. */
  onNicknameRefreshTap() {
    if (this.data.nicknameSaving) {
      return;
    }
    this.setData({
      nicknameEditing: true,
      nicknameInput: "",
    });
  },

  /**
   * 昵称 input 输入：同步到 data，并启动 500ms 防抖自动保存.
   * 用户点「使用微信昵称」按钮后 input 保持焦点、onblur 不触发，故改由 bindinput 防抖触发保存。
   * 期间用户继续输入则重新计时，避免输入到一半就保存。
   */
  onNicknameInput(e: WechatMiniprogram.Input) {
    const value = e.detail.value || "";
    this.setData({ nicknameInput: value });
    if (nicknameDebounceTimer) {
      clearTimeout(nicknameDebounceTimer);
    }
    const trimmed = value.trim();
    if (!trimmed || this.data.nicknameSaving) {
      return;
    }
    nicknameDebounceTimer = setTimeout(() => {
      nicknameDebounceTimer = null;
      this.saveNickname(trimmed);
    }, NICKNAME_DEBOUNCE_MS);
  },

  /**
   * 昵称 input blur：清防抖计时器，若当前有值且未在保存中则立即兜底保存.
   * 防抖场景下 onblur 一般不触发（input 保持焦点），此处仅作兜底。
   */
  onNicknameBlur(e: WechatMiniprogram.Input) {
    if (nicknameDebounceTimer) {
      clearTimeout(nicknameDebounceTimer);
      nicknameDebounceTimer = null;
    }
    const nickname = (e.detail.value || "").trim();
    if (!nickname) {
      this.setData({ nicknameEditing: false, nicknameInput: "" });
      return;
    }
    if (this.data.nicknameSaving) {
      return;
    }
    this.saveNickname(nickname);
  },

  /**
   * 调端点保存 nickname，成功后切回文本态并刷新用户信息.
   * 失败保留编辑态，用户可重试点刷新按钮重试。
   */
  saveNickname(nickname: string) {
    if (this.data.nicknameSaving) {
      return;
    }
    this.setData({ nicknameSaving: true });
    updateWechatProfile({ nickname })
      .then(() => {
        this.setData({
          nicknameSaving: false,
          nicknameEditing: false,
          nicknameInput: "",
        });
        wx.showToast({ title: "昵称已更新", icon: "success" });
        this.loadUser();
      })
      .catch((err: unknown) => {
        this.setData({ nicknameSaving: false, nicknameEditing: false, nicknameInput: "" });
        const msg = (err as HttpResponseError)?.body ? "保存失败，请重试" : "网络错误，请重试";
        wx.showToast({ title: msg, icon: "none" });
      });
  },

  /**
   * 上传头像临时文件到 /public/files/upload，401 时刷新 C 端令牌后重试一次.
   * 返回后端 FileUploadResponse.url（如 /static/uploads/20260812_abc.jpg）。
   */
  async uploadAvatar(filePath: string): Promise<string> {
    const token = getCAccessToken();
    if (!token) {
      throw new Error("UNAUTHORIZED");
    }
    let res = await doUploadFile(filePath, token);
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
    const parsed = JSON.parse(res.data) as FileUploadResponse;
    if (!parsed.url) {
      throw new Error("upload response missing url");
    }
    return parsed.url;
  },
});