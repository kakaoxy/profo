import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import {
  getAccessToken,
  getCTemporary,
  getCRefreshToken,
  getTokenAud,
  getPhonePrompted,
  setCTemporary,
  setPhonePrompted,
} from "../../../utils/token";

type PublicUserInfo = components["schemas"]["PublicUserInfo"];
type UserResponse = components["schemas"]["UserResponse"];
type PublicRefreshTokenRequest = components["schemas"]["PublicRefreshTokenRequest"];
type PublicLogoutResponse = components["schemas"]["PublicLogoutResponse"];

/**
 * customer 角色基础权限：仅含这些权限视为普通用户；permissions 含其他业务权限 → 内部员工.
 *
 * 判定依据：C 端 /me 返回的 permissions 为主角色 + 附加角色权限并集。内部员工为
 * 「后台角色 + customer 附加角色」的多角色用户，其并集必然包含后台业务权限，
 * 故任何超出 customer 基础权限的代码即视为内部身份（⚠️ TODO 待后端下发显式身份字段）.
 */
const CUSTOMER_BASE_PERMISSIONS = ["valuation:write", "lead:submit"];

/** 内部入口四项（viewing/renovation 已落地，其余二级页面本轮不建，点击统一「功能待开放」）. */
const INTERNAL_ENTRIES = [
  { key: "properties", title: "房源查询", sub: "交易中心月度签约房源", icon: "房", route: "/pages/properties/list/index" },
  { key: "viewing", title: "带看记录", sub: "带看 / 谈价 / 面谈", icon: "带", route: "/pages/viewing/projects/index/index" },
  { key: "renovation", title: "装修记录", sub: "改造 / 施工进度", icon: "装", route: "/pages/renovation/projects/index/index" },
  { key: "ledger", title: "项目记账", sub: "收支 / 台账", icon: "账" },
];

interface InternalEntry {
  key: string;
  title: string;
  sub: string;
  icon: string;
  /** 已落地页面的路由；无 route 的条目点击走「功能待开放」. */
  route?: string;
}

interface PageData {
  loading: boolean;
  loggedIn: boolean;
  loggingOut: boolean;
  nickname: string;
  username: string;
  avatarChar: string;
  isInternal: boolean;
  /** 是否为 C 端（customer）身份，决定手机号是否可在此维护. */
  canEditPhone: boolean;
  roleBadgeText: string;
  roleLabel: string;
  phoneDisplay: string;
  hasPhone: boolean;
  internalEntries: InternalEntry[];
  /** 当前是否为临时账号（c_user_temporary=true），决定是否展示「绑定已有账号」入口. */
  isTemporary: boolean;
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
  onGoLogin(): void;
  onLogout(): void;
  onPhoneTap(): void;
  onValuationTap(): void;
  onMenuTap(e: WechatMiniprogram.BaseEvent): void;
  onPhoneModalSkip(): void;
  onPhoneModalBound(): void;
  onPhoneModalGoBindAccount(): void;
  onGoBindAccount(): void;
}

/** phone-bind-modal 组件实例上需调用的方法（selectComponent 返回类型默认不含自定义方法）. */
interface PhoneBindModalInstance {
  show(): void;
  hide(): void;
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
    isInternal: false,
    canEditPhone: false,
    roleBadgeText: "",
    roleLabel: "未登录",
    phoneDisplay: "完善手机号",
    hasPhone: false,
    internalEntries: INTERNAL_ENTRIES,
    isTemporary: false,
  },

  getToken() {
    return getAccessToken();
  },

  onShow() {
    // TabBar 页从登录页 switchTab 返回时 onLoad 不会重跑，需在每次显示时刷新登录态
    this.loadUser();
    // 临时账号用户未弹过手机号引导时自动触发弹窗；
    // 用户选「暂不绑定」后置 c_phone_prompted=true，后续不再自动弹（除非用户主动点击入口）
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
      isInternal: false,
      canEditPhone: false,
      roleBadgeText: "",
      roleLabel: "未登录",
      phoneDisplay: "完善手机号",
      hasPhone: false,
      isTemporary: false,
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
      isInternal,
      roleBadgeText: isInternal ? "内部员工" : "C端用户",
      roleLabel: isInternal ? "内部用户" : "C端用户",
      phoneDisplay: phone || "完善手机号",
      hasPhone: !!phone,
      // 临时账号标识由 storage 维持（wechat-auth.ts 写入）；
      // PublicUserInfo 暂未带 is_temporary 字段，从 storage 读取以驱动「绑定已有账号」入口显隐
      isTemporary: getCTemporary(),
    });
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
      isInternal: true,
      roleBadgeText: "内部员工",
      roleLabel: "内部员工 · 已认证",
      phoneDisplay: phone ? maskPhone(phone) : "—",
      hasPhone: !!phone,
      // admin 令牌非临时账号（内部员工直接登录），强制置 false 避免残留 storage 标识误显入口
      isTemporary: false,
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

  onMenuTap(e: WechatMiniprogram.BaseEvent) {
    // 已落地条目（route 存在）跳转对应页；未落地（装修/记账/房源查询）统一待开放
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

  /** 「账号」菜单「绑定已有账号」入口：跳转 bind-account 页（仅 isTemporary=true 时展示）. */
  onGoBindAccount() {
    wx.navigateTo({ url: "/pages/bind-account/index/index" });
  },
});