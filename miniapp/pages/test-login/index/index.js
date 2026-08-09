/**
 * 测试登录页 · 独立模块
 *
 * 用途：后端微信登录功能完成前，用于系统测试后台账号密码真实登录流程，
 * 并衔接 profile 页（我的）的后链路测试（内部员工身份 / 手机号展示 / 退出登录）。
 *
 * 登录接口：POST /public/auth/token（C 端 OAuth2 表单登录，支持普通用户与多角色内部账号）.
 * 登录成功后把 access_token / refresh_token 写入 storage（与 profile 页读取的 key 一致），
 * 再跳转 `pages/profile/index/index`（TabBar 页）验证后链路。
 */
const { request } = require("../../../utils/request");

/** 用户名格式：4-30 位字母/数字/下划线. */
const USERNAME_RE = /^[a-zA-Z0-9_]{4,30}$/;
/** 密码：至少 8 位. */
const PASSWORD_RE = /^.{8,}$/;

/**
 * 调用后端 C 端登录接口 POST /public/auth/token（OAuth2 表单登录）.
 * 支持普通 customer 账号，以及 admin/operator + customer 附加角色的多角色内部账号
 * （C 端令牌 + 权限识别内部身份，可命中 profile 页手机号完善与内部入口）.
 */
function realLogin(username, password) {
  return request({
    url: "/public/auth/token",
    method: "POST",
    header: { "content-type": "application/x-www-form-urlencoded" },
    data:
      "username=" + encodeURIComponent(username) + "&password=" + encodeURIComponent(password),
  });
}

/** 从 request 抛出的错误中提取可读信息. */
function errMessage(err) {
  if (err && typeof err === "object") {
    // HTTP 非 2xx：body 通常为 { code, message }，优先取 message
    if ("body" in err && err.body && typeof err.body === "object") {
      if (typeof err.body.message === "string") {
        return err.body.message;
      }
      return JSON.stringify(err.body);
    }
    // 网络异常：取 errMsg
    if (typeof err.errMsg === "string") {
      return err.errMsg;
    }
  }
  return String(err);
}

Page({
  data: {
    from: "",
    username: "",
    password: "",
    usernameError: "",
    passwordError: "",
    submitting: false,
    result: null,
  },

  onLoad(options) {
    // from=valuation：由估价提交页拦截而来，登录成功后 navigateBack 返回估价页（保留已填表单）
    this.setData({ from: (options && options.from) || "" });
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value, usernameError: "" });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value, passwordError: "" });
  },

  validate() {
    const username = this.data.username;
    const password = this.data.password;
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
    this.setData({ usernameError: usernameError, passwordError: passwordError });
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
      wx.showToast({ title: "登录成功", icon: "success" });
      if (this.data.from === "valuation") {
        // 由估价提交页拦截而来：navigateBack 返回估价页，其页面实例仍在导航栈中，
        // 已填写的表单数据（含已上传图片）完整保留，不发生数据丢失
        setTimeout(function () {
          wx.navigateBack();
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
