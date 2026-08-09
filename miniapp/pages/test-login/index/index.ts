/**
 * 测试登录页 · 独立模块
 *
 * 用途：后端微信登录功能完成前，用于系统测试后台账号密码真实登录流程，
 * 并衔接 profile 页（我的）的后链路测试（内部员工身份 / 手机号展示 / 退出登录）。
 *
 * 登录接口：POST /public/auth/token（OAuth2 表单登录，支持普通用户与内部用户）.
 * 登录成功后把 access_token / refresh_token 写入 storage（与 profile 页读取的 key 一致），
 * 再跳转 `pages/profile/index/index`（TabBar 页）验证后链路。
 * 后端按身份签发令牌：customer 身份 → C 端令牌；纯内部用户 → 后台令牌，
 * profile 页据此双通道识别身份并差异化展示内容。
 *
 * 依赖：仅本目录 + app.json pages 中对应条目 + utils/request + types/api-types.d.ts。
 * 移除：删除本目录并去掉 app.json 中 `pages/test-login/index` 条目即可，无残留依赖。
 */

import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";

type PublicLoginResponse = components["schemas"]["PublicLoginResponse"];

/** 用户名格式：4-30 位字母/数字/下划线. */
const USERNAME_RE = /^[a-zA-Z0-9_]{4,30}$/;
/** 密码：至少 8 位. */
const PASSWORD_RE = /^.{8,}$/;

/** 登录失败结果（保存可直接展示的错误信息）. */
interface LoginFailure {
  type: "failure";
  message: string;
}

type LoginResult = LoginFailure;

interface PageData {
  username: string;
  password: string;
  usernameError: string;
  passwordError: string;
  submitting: boolean;
  result: LoginResult | null;
}

interface PageCustom {
  onUsernameInput(e: WechatMiniprogram.Input): void;
  onPasswordInput(e: WechatMiniprogram.Input): void;
  validate(): boolean;
  onSubmit(): void;
}

// 使本文件成为模块，隔离顶部接口定义，避免污染全局类型
export {};

/**
 * 调用后端登录接口 POST /public/auth/token（OAuth2 表单登录）.
 * 支持普通 customer 账号，以及 admin/operator 等内部账号：
 * 后端按身份签发对应端令牌，profile 页据此差异化展示。
 */
function realLogin(username: string, password: string): Promise<PublicLoginResponse> {
  return request<PublicLoginResponse>({
    url: "/public/auth/token",
    method: "POST",
    header: { "content-type": "application/x-www-form-urlencoded" },
    data: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
  });
}

/** 从 request 抛出的错误中提取可读信息. */
function errMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    // HTTP 非 2xx：body 通常为 { code, message }，优先取 message
    if ("body" in obj && obj.body && typeof obj.body === "object") {
      const body = obj.body as Record<string, unknown>;
      if (typeof body.message === "string") {
        return body.message;
      }
      return JSON.stringify(body);
    }
    // 网络异常：取 errMsg
    if (typeof obj.errMsg === "string") {
      return obj.errMsg;
    }
  }
  return String(err);
}

Page<PageData, PageCustom>({
  data: {
    username: "",
    password: "",
    usernameError: "",
    passwordError: "",
    submitting: false,
    result: null,
  },

  onUsernameInput(e: WechatMiniprogram.Input) {
    this.setData({ username: e.detail.value, usernameError: "" });
  },

  onPasswordInput(e: WechatMiniprogram.Input) {
    this.setData({ password: e.detail.value, passwordError: "" });
  },

  validate() {
    const { username, password } = this.data;
    let usernameError = "";
    let passwordError = "";
    if (!username) {
      usernameError = "请输入用户名";
    } else if (!USERNAME_RE.test(username)) {
      usernameError = "用户名需为 4-30 位字母/数字/下划线";
    }
    if (!password) {
      passwordError = "请输入密码";
    } else if (!PASSWORD_RE.test(password)) {
      passwordError = "密码至少 8 位";
    }
    this.setData({ usernameError, passwordError });
    return !usernameError && !passwordError;
  },

  async onSubmit() {
    if (this.data.submitting) {
      return;
    }
    if (!this.validate()) {
      wx.showToast({ title: "请检查表单填写", icon: "none" });
      return;
    }
    this.setData({ submitting: true, result: null });
    try {
      const res = await realLogin(this.data.username.trim(), this.data.password);
      // 与 profile 页读取的 key 保持一致，供后续页面直接使用
      wx.setStorageSync("access_token", res.access_token);
      wx.setStorageSync("refresh_token", res.refresh_token);
      // 登录成功自动跳转 profile（TabBar 页），不再展示测试信息
      wx.showToast({ title: "登录成功", icon: "success" });
      wx.switchTab({ url: "/pages/profile/index/index" });
    } catch (err) {
      this.setData({ result: { type: "failure", message: errMessage(err) } });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
