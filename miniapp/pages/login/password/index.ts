/**
 * 账号密码登录页 · login 体系子页.
 *
 * 用途：login 页（微信一键登录正式入口）「账号密码登录」按钮的子页，为外部
 * 已有账号用户（fangmengchina.com 注册）提供密码登录入口；内部员工也可经此
 * 直接获得 admin 令牌，衔接 profile 页（我的）的双通道身份识别。
 *
 * 登录接口：先 POST /auth/token（后台登录，内部员工获 admin 令牌，可访问带看记录等
 * 后台接口 /projects/*）；纯 customer 账号后台登录返回 403 时回退 POST /public/auth/token
 * 签发 C 端令牌。登录成功后把 access_token / refresh_token 写入 storage（与 profile 页
 * 读取的 key 一致），再按 from 回跳。
 * profile 页依据令牌 aud 双通道识别身份并差异化展示内容。
 *
 * 双令牌：内部员工登录后同时获取 admin 令牌（access_token，访问 /projects/* 等后台接口）
 * 与 C 端令牌（c_access_token，访问 /public/* 接口）；C 端用户两者相同。
 *
 * 来源参数 from：=valuation/=recruit/=booking 时登录成功 navigateBack 返回对应来源页
 * （保留已填表单/预约上下文）；其他入口登录成功 switchTab 到 profile。
 *
 * 依赖：仅本目录 + app.json pages 中对应条目 + utils/request + utils/token + types/api-types.d.ts。
 */

import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import { getTokenAud } from "../../../utils/token";

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
  /** 来源标记：=valuation/=recruit/=booking 时登录成功后 navigateBack 返回来源页（保留已填表单）；否则 switchTab 到 profile. */
  from: string;
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
 * 调用后端登录接口获取主令牌（OAuth2 表单登录）.
 * 优先后台登录 POST /auth/token：内部员工（具备后台身份）获得 admin 令牌，
 * 可访问后台带看记录等内部接口（/projects/*）；纯 C 端 customer 账号后台登录
 * 返回 403「无权登录后台」，此时回退 C 端登录 POST /public/auth/token 签发 C 端令牌.
 */
async function realLogin(username: string, password: string): Promise<PublicLoginResponse> {
  const form = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const formHeader = { "content-type": "application/x-www-form-urlencoded" };
  try {
    return await request<PublicLoginResponse>({
      url: "/auth/token",
      method: "POST",
      header: formHeader,
      data: form,
      skipAuth: true,
    });
  } catch (err) {
    const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
    // 403 = 无后台身份（纯 customer）→ 回退 C 端登录
    if (statusCode === 403) {
      return await request<PublicLoginResponse>({
        url: "/public/auth/token",
        method: "POST",
        header: formHeader,
        data: form,
        skipAuth: true,
      });
    }
    throw err;
  }
}

/**
 * 获取 C 端令牌（aud=c）：内部员工持 admin 令牌时需额外获取 C 端令牌用于 /public/* 接口.
 * 纯 admin 用户（无 customer 身份）后端会签发 admin 令牌而非 C 端令牌，此时返回 null.
 */
async function fetchCToken(username: string, password: string): Promise<PublicLoginResponse | null> {
  const form = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const formHeader = { "content-type": "application/x-www-form-urlencoded" };
  try {
    const res = await request<PublicLoginResponse>({
      url: "/public/auth/token",
      method: "POST",
      header: formHeader,
      data: form,
      skipAuth: true,
    });
    // 仅当签发的令牌确实为 C 端（aud=c）时才返回；纯 admin 用户会拿到 admin 令牌
    return getTokenAud(res.access_token) === "c" ? res : null;
  } catch {
    return null;
  }
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
    from: "",
    username: "",
    password: "",
    usernameError: "",
    passwordError: "",
    submitting: false,
    result: null,
  },

  onLoad(options: { from?: string }) {
    this.setData({ from: options.from || "" });
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
      const username = this.data.username.trim();
      const res = await realLogin(username, this.data.password);
      // 与 profile 页读取的 key 保持一致，供后续页面直接使用
      wx.setStorageSync("access_token", res.access_token);
      wx.setStorageSync("refresh_token", res.refresh_token);
      // 双令牌：若主令牌为 admin，额外获取 C 端令牌用于 /public/* 接口；
      // C 端用户主令牌即 C 端令牌，同时写入 c_access_token
      if (getTokenAud(res.access_token) === "admin") {
        const cRes = await fetchCToken(username, this.data.password);
        if (cRes) {
          wx.setStorageSync("c_access_token", cRes.access_token);
          wx.setStorageSync("c_refresh_token", cRes.refresh_token);
        } else {
          // 纯 admin 用户（无 customer 身份）：清除可能残留的 C 端令牌
          wx.removeStorageSync("c_access_token");
          wx.removeStorageSync("c_refresh_token");
        }
      } else {
        wx.setStorageSync("c_access_token", res.access_token);
        wx.setStorageSync("c_refresh_token", res.refresh_token);
      }
      wx.showToast({ title: "登录成功", icon: "success" });
      if (this.data.from === "valuation" || this.data.from === "recruit" || this.data.from === "booking") {
        // 由估价提交页/招募页/房源详情页（想看房）拦截而来：本页经 login/index 中转进入，
        // 导航栈为「来源页→login/index→本页」，需回退两层直达来源页，其页面实例仍在
        // 导航栈中，已填写的表单数据/预约上下文完整保留；栈深异常不足时按一层回退兜底
        setTimeout(() => {
          const delta = getCurrentPages().length >= 3 ? 2 : 1;
          wx.navigateBack({ delta });
        }, 400);
      } else {
        // 其他入口（如 profile）：登录成功跳转 profile（TabBar 页）
        wx.switchTab({ url: "/pages/profile/index/index" });
      }
    } catch (err) {
      this.setData({ result: { type: "failure", message: errMessage(err) } });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
