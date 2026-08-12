/**
 * 绑定已有账号页.
 *
 * 临时账号（微信登录后端 is_temporary=true 标识）用户在此合并到已有主账号：
 * - 内部员工：工号 + 密码 → POST /public/users/merge（type=internal）
 *   成功后后端签发主账号令牌（access_token/refresh_token，内部员工另返回
 *   c_access_token/c_refresh_token），前端写入 4 个令牌 storage key、清空
 *   c_user_temporary 与 c_phone_prompted 标识，navigateBack 回 profile 页.
 * - 外部用户：手机号 + 短信验证码 → ⚠️ 后端 SMS 分支未实现（HTTP 400 + code 40002
 *   SMS_VERIFICATION_NOT_IMPLEMENTED），Tab 中显示「即将上线」提示，表单可见但
 *   提交按钮置灰 + 点击 bindPhone 直接 toast 引导走工号登录，避免用户填完才报错.
 *
 * 错误处理：按后端 body.code 区分 40001/40902/40003/40004/40005 等，给出可读文案.
 *
 * 依赖：utils/request + utils/token + types/api-types.d.ts；移除：删除本目录并去掉
 * app.json 中 `pages/bind-account/index/index` 条目即可，无残留依赖.
 */

import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import { clearCUserState } from "../../../utils/token";

type MergeAccountRequest = components["schemas"]["MergeAccountRequest"];
type PublicLoginResponse = components["schemas"]["PublicLoginResponse"];

interface PageData {
  /** 当前激活 Tab：internal=内部员工，phone=外部用户. */
  activeTab: "internal" | "phone";
  username: string;
  password: string;
  phone: string;
  smsCode: string;
  loading: boolean;
}

interface PageCustom {
  onSwitchTab(e: WechatMiniprogram.BaseEvent): void;
  onInput(e: WechatMiniprogram.Input): void;
  onSendSms(): void;
  onBind(): void;
  bindInternal(): void;
  bindPhone(): void;
  applyMergeTokens(res: PublicLoginResponse): void;
}

// 使本文件成为模块，隔离顶部接口定义，避免污染全局类型
export {};

Page<PageData, PageCustom>({
  data: {
    activeTab: "internal",
    username: "",
    password: "",
    phone: "",
    smsCode: "",
    loading: false,
  },

  onSwitchTab(e: WechatMiniprogram.BaseEvent) {
    const tab = e.currentTarget.dataset.tab as "internal" | "phone";
    if (tab && tab !== this.data.activeTab) {
      this.setData({ activeTab: tab });
    }
  },

  onInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as string | undefined;
    if (!field) {
      return;
    }
    const value = e.detail.value;
    // 仅允许更新 4 个表单字段，避免任意 key 注入；switch 保证类型安全
    switch (field) {
      case "username":
        this.setData({ username: value });
        break;
      case "password":
        this.setData({ password: value });
        break;
      case "phone":
        this.setData({ phone: value });
        break;
      case "smsCode":
        this.setData({ smsCode: value });
        break;
      default:
        break;
    }
  },

  onSendSms() {
    // ⚠️ SMS 发送端点可能不存在，先实现并捕获失败
    wx.showToast({ title: "短信服务暂未开通", icon: "none" });
  },

  onBind() {
    if (this.data.activeTab === "internal") {
      this.bindInternal();
    } else {
      this.bindPhone();
    }
  },

  bindInternal() {
    if (this.data.loading) {
      return;
    }
    const username = this.data.username.trim();
    const password = this.data.password;
    if (!username || !password) {
      wx.showToast({ title: "请输入工号和密码", icon: "none" });
      return;
    }
    this.setData({ loading: true });
    const body: MergeAccountRequest = {
      type: "internal",
      username,
      password,
    };
    request<PublicLoginResponse>({
      url: "/public/users/merge",
      method: "POST",
      data: body,
    })
      .then((res) => {
        this.setData({ loading: false });
        this.applyMergeTokens(res);
        // 清空 c_user_temporary 与 c_phone_prompted 标识（setCTemporary(false) 在此之前冗余，
        // 因 clearCUserState 直接删除 key，读取时按 false 处理）
        clearCUserState();
        wx.showToast({ title: "绑定成功", icon: "success" });
        setTimeout(() => wx.navigateBack(), 1500);
      })
      .catch((err) => {
        this.setData({ loading: false });
        const body = (err as { body?: { code?: number } } | undefined)?.body || {};
        if (body.code === 40001) {
          wx.showToast({ title: "工号或密码错误", icon: "none" });
        } else if (body.code === 40902) {
          wx.showToast({ title: "该账号已绑定其他微信，请先解绑", icon: "none" });
        } else if (body.code === 40003) {
          wx.showToast({ title: "当前账号非临时账号", icon: "none" });
        } else if (body.code === 40004) {
          wx.showToast({ title: "目标账号不可合并", icon: "none" });
        } else if (body.code === 40005) {
          wx.showToast({ title: "不能合并到当前账号", icon: "none" });
        } else {
          wx.showToast({ title: "绑定失败", icon: "none" });
        }
      });
  },

  bindPhone() {
    // ⚠️ 后端 SMS 分支未实现（HTTP 400 + code 40002 SMS_VERIFICATION_NOT_IMPLEMENTED）
    // 直接引导走工号登录，避免用户填完手机号验证码再被后端拒绝
    wx.showToast({ title: "手机号合并暂未开通，请使用工号登录", icon: "none" });
  },

  /**
   * 将合并接口返回的令牌写入 storage（覆盖旧临时账号令牌）.
   *
   * 内部员工合并：后端同时返回 admin 令牌（access_token/refresh_token）与
   * C 端令牌（c_access_token/c_refresh_token），分别用于后台与 /public/* 接口.
   * 外部用户合并：仅返回 C 端令牌（c_* 为 null），主令牌即 C 端令牌，同时写入两端.
   */
  applyMergeTokens(res: PublicLoginResponse) {
    wx.setStorageSync("access_token", res.access_token);
    wx.setStorageSync("refresh_token", res.refresh_token);
    if (res.c_access_token && res.c_refresh_token) {
      wx.setStorageSync("c_access_token", res.c_access_token);
      wx.setStorageSync("c_refresh_token", res.c_refresh_token);
    } else {
      // 外部用户合并：c_* 缺省时主令牌即 C 端令牌，复用 access_token
      wx.setStorageSync("c_access_token", res.access_token);
      wx.setStorageSync("c_refresh_token", res.refresh_token);
    }
  },
});
