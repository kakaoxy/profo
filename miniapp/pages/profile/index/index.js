import { request } from "../../../utils/request";
import { getTokenAud } from "../../../utils/token";

/**
 * customer 角色基础权限：仅含这些权限视为普通用户；permissions 含其他业务权限 → 内部员工.
 *
 * 判定依据：C 端 /me 返回的 permissions 为主角色 + 附加角色权限并集。内部员工为
 * 「后台角色 + customer 附加角色」的多角色用户，其并集必然包含后台业务权限，
 * 故任何超出 customer 基础权限的代码即视为内部身份（⚠️ TODO 待后端下发显式身份字段）.
 */
const CUSTOMER_BASE_PERMISSIONS = ["valuation:write", "lead:submit"];

/** 内部入口四项（viewing 已落地，其余二级页面本轮不建，点击统一「功能待开放」）. */
const INTERNAL_ENTRIES = [
  { key: "viewing", title: "带看记录", sub: "带看 / 谈价 / 面谈", icon: "带", route: "/pages/viewing/projects/index/index" },
  { key: "renovation", title: "装修记录", sub: "改造 / 施工进度", icon: "装" },
  { key: "ledger", title: "项目记账", sub: "收支 / 台账", icon: "账" },
  { key: "properties", title: "房源查询", sub: "交易中心月度签约房源", icon: "房" },
];

/** 是否内部员工：permissions 含 customer 基础权限之外的代码. */
function isInternalUser(permissions) {
  return permissions.some((p) => CUSTOMER_BASE_PERMISSIONS.indexOf(p) < 0);
}

/** 11 位手机号脱敏展示（如 138****5678）；非 11 位原样返回. */
function maskPhone(phone) {
  if (phone.length === 11) {
    return phone.slice(0, 3) + "****" + phone.slice(7);
  }
  return phone;
}

Page({
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
    editingPhone: false,
    phoneInput: "",
    phoneFocus: false,
    submittingPhone: false,
    internalEntries: INTERNAL_ENTRIES,
  },

  getToken() {
    return wx.getStorageSync("access_token");
  },

  getRefreshToken() {
    return wx.getStorageSync("refresh_token");
  },

  onShow() {
    // TabBar 页从登录页 switchTab 返回时 onLoad 不会重跑，需在每次显示时刷新登录态
    this.loadUser();
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
      editingPhone: false,
      phoneInput: "",
      phoneFocus: false,
    });
  },

  clearTokensAndReset() {
    wx.removeStorageSync("access_token");
    wx.removeStorageSync("refresh_token");
    this.resetToGuest();
  },

  applyPublicUser(user) {
    const isInternal = isInternalUser(user.permissions || []);
    const nickname = user.nickname || user.username;
    const phone = user.phone || "";
    this.setData({
      loading: false,
      loggedIn: true,
      canEditPhone: true,
      nickname: nickname,
      username: user.username,
      avatarChar: nickname.slice(0, 1) || "我",
      isInternal: isInternal,
      roleBadgeText: isInternal ? "内部员工" : "普通用户",
      roleLabel: isInternal ? "内部用户 · 已认证" : "普通用户 · 已认证",
      phoneDisplay: phone || "完善手机号",
      hasPhone: !!phone,
    });
  },

  applyAdminUser(user) {
    const nickname = user.nickname || user.username;
    const phone = user.phone || "";
    this.setData({
      loading: false,
      loggedIn: true,
      canEditPhone: false,
      nickname: nickname,
      username: user.username,
      avatarChar: nickname.slice(0, 1) || "我",
      isInternal: true,
      roleBadgeText: "内部员工",
      roleLabel: "内部员工 · 已认证",
      phoneDisplay: phone ? maskPhone(phone) : "—",
      hasPhone: !!phone,
    });
  },

  async loadUser() {
    const token = this.getToken();
    if (!token) {
      this.resetToGuest();
      return;
    }
    const authHeader = { Authorization: "Bearer " + token };
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

  async loadPublicUser(authHeader) {
    try {
      const pub = await request({
        url: "/public/auth/me",
        header: authHeader,
      });
      this.applyPublicUser(pub);
      return true;
    } catch (err) {
      return false;
    }
  },

  async loadAdminUser(authHeader) {
    try {
      const admin = await request({
        url: "/auth/me",
        header: authHeader,
      });
      this.applyAdminUser(admin);
      return true;
    } catch (err) {
      return false;
    }
  },

  onGoLogin() {
    // 后端微信登录未完成，先跳账号密码测试登录页（test-login）
    wx.navigateTo({ url: "/pages/test-login/index/index" });
  },

  async onLogout() {
    if (this.data.loggingOut) {
      return;
    }
    this.setData({ loggingOut: true });
    const token = this.getToken();
    const refreshToken = this.getRefreshToken();
    if (token && refreshToken) {
      try {
        await request({
          url: "/public/auth/logout",
          method: "POST",
          data: { refresh_token: refreshToken },
          header: { Authorization: "Bearer " + token },
        });
      } catch (err) {
        // 服务端撤销失败（如内部用户为 admin 令牌）忽略，本地照常登出
      }
    }
    wx.removeStorageSync("access_token");
    wx.removeStorageSync("refresh_token");
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
    this.setData({ editingPhone: true, phoneInput: "", phoneFocus: true });
  },

  onPhoneInput(e) {
    this.setData({ phoneInput: e.detail.value });
  },

  onPhoneCancel() {
    this.setData({ editingPhone: false, phoneInput: "", phoneFocus: false });
  },

  async onPhoneConfirm() {
    if (this.data.submittingPhone) {
      return;
    }
    const token = this.getToken();
    if (!token) {
      this.onGoLogin();
      return;
    }
    const value = (this.data.phoneInput || "").trim();
    if (!/^1[3-9]\d{9}$/.test(value)) {
      wx.showToast({ title: "请输入正确的11位手机号", icon: "none" });
      return;
    }
    this.setData({ submittingPhone: true });
    try {
      const res = await request({
        url: "/public/users/phone",
        method: "POST",
        data: { phone: value },
        header: { Authorization: "Bearer " + token },
      });
      // 后端返回脱敏手机号；兜底本地脱敏
      const masked = (res && res.phone) || maskPhone(value);
      this.setData({
        phoneDisplay: masked,
        hasPhone: true,
        editingPhone: false,
        phoneInput: "",
        phoneFocus: false,
      });
      wx.showToast({ title: "绑定成功", icon: "success" });
    } catch (err) {
      // 透出后端业务信息（如「手机号已被其他账号绑定」），无则兜底通用提示
      const msg = (err && err.body && err.body.message) || "";
      wx.showToast({ title: msg || "保存失败，请重试", icon: "none" });
    } finally {
      this.setData({ submittingPhone: false });
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

  onMenuTap(e) {
    // 已落地条目（route 存在）跳转对应页；未落地（装修/记账/房源查询）统一待开放
    const route = e.currentTarget.dataset.route;
    if (route) {
      wx.navigateTo({ url: route });
      return;
    }
    wx.showToast({ title: "功能待开放", icon: "none" });
  },
});