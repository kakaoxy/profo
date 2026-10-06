/**
 * 登录页 · 微信一键登录 + 账号密码登录入口.
 *
 * 用途：微信登录正式入口页。主按钮「手机号快捷登录」调 utils/wechat-auth.ts 的
 * wechatLogin() 完成微信登录流程并写入令牌；次按钮「账号密码登录」跳账号密码
 * 登录子页（login/password）保留原有账号密码入口作为子入口。
 *
 * 协议勾选与隐私授权（wx.getPrivacySetting 方案）：
 * - onLoad 时通过 wx.getPrivacySetting 查询微信侧隐私授权状态：
 *   - needAuthorization=false（用户此前已同意）：跳过勾选强制校验，协议区仅作
 *     信息性链接展示，后续隐私接口不再弹官方隐私弹窗；
 *   - needAuthorization=true 或接口异常（默认 true 兜底）：保持勾选强制校验，
 *     且勾选 checkbox 由 button[open-type=agreePrivacyAuthorization] 承载，
 *     用户勾选时同步微信侧授权状态，之后 getPhoneNumber 等隐私接口不再重复弹
 *     官方隐私弹窗（自绘勾选与微信侧授权二合一，首次登录全程只确认一次）。
 * - 未勾选《用户协议》与《隐私政策》时，点击任一登录按钮均 toast 提示并 return。
 *
 * 协议同意标记：通过 agreed 校验后（发起登录前）写入 c_protocol_agreed=true，
 * 作为 App.onLaunch 静默续登的前置条件（openid 收集的用户知情依据）。
 *
 * 来源参数 from：=valuation/=recruit/=booking/=subscribe 时登录成功 navigateBack 返回对应来源页
 * （保留已填表单/预约/订阅上下文）；其他入口登录成功 switchTab 到 profile。
 */

import { setProtocolAgreed } from "../../../utils/token";
import { wechatLogin } from "../../../utils/wechat-auth";

interface PageData {
  agreed: boolean;
  loading: boolean;
  /** 微信侧是否待用户同意隐私政策（true=需强制勾选，false=已授权过可跳过勾选校验）. */
  needPrivacyAuth: boolean;
  from?: string;
}
interface PageCustom {
  onToggleAgree(): void;
  onAgreePrivacy(): void;
  onWechatLogin(): void;
  onPasswordLogin(): void;
}

Page<PageData, PageCustom>({
  data: { agreed: false, loading: false, needPrivacyAuth: true },

  onLoad(query: { from?: string }) {
    if (query?.from) {
      this.setData({ from: query.from });
    }
    // 查询微信侧隐私授权状态：接口不存在（低版本基础库）/调用失败时默认 true，
    // 保持现有强制勾选兜底，不因查询失败放松合规要求
    wx.getPrivacySetting({
      success: (res) => {
        this.setData({ needPrivacyAuth: res.needAuthorization === true });
      },
      fail: () => {
        this.setData({ needPrivacyAuth: true });
      },
    });
  },

  onToggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  /**
   * agreePrivacyAuthorization 按钮回调：微信侧已同步用户同意隐私政策，
   * 此处仅同步本地勾选态（之后 getPhoneNumber 等隐私接口不再弹官方隐私弹窗）.
   */
  onAgreePrivacy() {
    this.setData({ agreed: true });
  },

  onWechatLogin() {
    if (this.data.needPrivacyAuth && !this.data.agreed) {
      wx.showToast({ title: "请先阅读并同意《用户协议》和《隐私政策》", icon: "none" });
      return;
    }
    if (this.data.loading) {
      return;
    }
    // 用户已显式同意协议 → 写标记，作为 App.onLaunch 静默续登收集 openid 的知情依据
    setProtocolAgreed(true);
    this.setData({ loading: true });
    wx.showLoading({ title: "登录中..." });
    wechatLogin()
      .then((res) => {
        wx.hideLoading();
        this.setData({ loading: false });
        if (res.success) {
          // 登录成功
          if (
            this.data.from === "valuation" ||
            this.data.from === "recruit" ||
            this.data.from === "booking" ||
            this.data.from === "subscribe"
          ) {
            // 从估价/招募/房源预约/订阅提醒进入登录：navigateBack 返回来源页，保留上下文；
            // 分享卡片直接进入登录页时页面栈为空，navigateBack 失败则回退到「我的」tab
            wx.navigateBack({
              fail: () => {
                wx.switchTab({ url: "/pages/profile/index/index" });
              },
            });
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
    if (this.data.needPrivacyAuth && !this.data.agreed) {
      wx.showToast({ title: "请先阅读并同意《用户协议》和《隐私政策》", icon: "none" });
      return;
    }
    if (this.data.needPrivacyAuth) {
      // 密码登录子页自身无隐私接口调用，此处也写标记保持口径一致
      // （用户已在本页显式同意协议，随后续登/绑手机号等场景有知情依据）
      setProtocolAgreed(true);
    }
    const url = "/pages/login/password/index" + (this.data.from ? "?from=" + this.data.from : "");
    wx.navigateTo({ url });
  },
});
