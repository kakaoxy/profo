/**
 * 门店邀请二维码落地页（REQ-IT7-09）.
 *
 * 为什么单独存在：小程序码的 page 指向分包页面时，冷启动 scene 透传在部分客户端
 * 会丢失（表现为扫码后停在首页/无反应）。本页放在主包，只做一件事——解析
 * scene/code 后跳转分包内的经纪人中心；旧二维码（page=pages/merchant/home/index）
 * 仍由首页 onLoad/onShow 兼容。
 */
import { parseSceneCode } from "../../utils/recruit-logic";

Page({
  data: {
    state: "loading" as "loading" | "error",
    errorText: "",
    // 页面实例内去重：避免 onLoad/onShow 对同一短码重复跳转；
    // 不能用模块级变量，否则退出后再次扫同一张码会永远停在 loading。
    handledCode: "",
  },

  onLoad(options: Record<string, string | undefined>) {
    this.handleOptions(options);
  },

  onShow() {
    // 小程序已在运行时扫码进入只会触发 onShow（不会执行 onLoad）。
    const enter = wx.getEnterOptionsSync ? wx.getEnterOptionsSync() : wx.getLaunchOptionsSync();
    this.handleOptions((enter.query || {}) as Record<string, string | undefined>);
  },

  handleOptions(options: Record<string, string | undefined>) {
    const rawScene = options.scene ? decodeURIComponent(options.scene) : "";
    const code = options.code || parseSceneCode(rawScene);
    if (!code) {
      this.setData({
        state: "error",
        errorText: "邀请链接无效或已过期，请让门店员工重新生成二维码",
      });
      return;
    }
    if (code === this.data.handledCode) {
      return;
    }
    this.setData({ handledCode: code });
    const referrer = options.referrer ? `&referrer=${encodeURIComponent(options.referrer)}` : "";
    wx.redirectTo({
      url: `/pages/merchant/broker/index?code=${encodeURIComponent(code)}${referrer}`,
      fail: () => {
        this.setData({
          handledCode: "",
          state: "error",
          errorText: "打开门店邀请失败，请重新扫码",
        });
      },
    });
  },
});
