/**
 * 登录页 · 微信一键登录 + 账号密码登录入口.
 *
 * 用途：微信登录正式入口页。主按钮「微信一键登录」调 utils/wechat-auth.ts 的
 * wechatLogin() 完成微信登录流程并写入令牌；次按钮「账号密码登录」跳 test-login
 * 保留原有账号密码入口作为子入口。
 *
 * 协议勾选：未勾选《用户协议》与《隐私政策》时，点击任一登录按钮均 toast 提示并
 * return，不发起登录请求。配合 app.json 的 __usePrivacyCheck__ 触发微信原生
 * 隐私授权弹窗。
 *
 * 来源参数 from：=valuation/=recruit 时登录成功 navigateBack 返回对应来源页
 * （保留已填表单）；其他入口登录成功 switchTab 到 profile。
 */

import { wechatLogin } from "../../../utils/wechat-auth";

interface PageData {
  agreed: boolean;
  loading: boolean;
  from?: string;
}
interface PageCustom {
  onToggleAgree(): void;
  onWechatLogin(): void;
  onPasswordLogin(): void;
}

Page<PageData, PageCustom>({
  data: { agreed: false, loading: false },

  onLoad(query: { from?: string }) {
    if (query?.from) {
      this.setData({ from: query.from });
    }
  },

  onToggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  onWechatLogin() {
    if (!this.data.agreed) {
      wx.showToast({ title: "请先阅读并同意《用户协议》和《隐私政策》", icon: "none" });
      return;
    }
    if (this.data.loading) {
      return;
    }
    this.setData({ loading: true });
    wx.showLoading({ title: "登录中..." });
    wechatLogin()
      .then((res) => {
        wx.hideLoading();
        this.setData({ loading: false });
        if (res.success) {
          // 登录成功
          if (this.data.from === "valuation" || this.data.from === "recruit") {
            // 从估价/招募页进入登录：navigateBack 返回来源页，保留已填表单
            wx.navigateBack();
          } else {
            wx.switchTab({ url: "/pages/profile/index/index" });
          }
        } else {
          wx.showToast({ title: res.error || "登录失败", icon: "none" });
        }
      })
      .catch(() => {
        // wechatLogin 内部已捕获异常返回 { success: false, error }，
        // 此处兜底防御 reject 路径，确保 loading 始终关闭
        wx.hideLoading();
        this.setData({ loading: false });
        wx.showToast({ title: "登录失败", icon: "none" });
      });
  },

  onPasswordLogin() {
    if (!this.data.agreed) {
      wx.showToast({ title: "请先阅读并同意《用户协议》和《隐私政策》", icon: "none" });
      return;
    }
    const url = "/pages/test-login/index/index" + (this.data.from ? "?from=" + this.data.from : "");
    wx.navigateTo({ url });
  },
});
