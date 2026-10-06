import { initPerformanceMonitor, markLaunchDone } from "./utils/performance";
import { getCAccessToken, getProtocolAgreed } from "./utils/token";
import { wechatLogin } from "./utils/wechat-auth";

App({
  onLaunch() {
    // 性能基线采集（P-00）：wx.getPerformance 观察者，采集启动/路由/首屏渲染指标
    initPerformanceMonitor();

    // 静默续登：本地完全无 C 端令牌且用户曾同意过协议时，冷启动静默 wx.login
    // 恢复登录态（wx.login 无弹窗、非隐私接口；openid 收集以协议同意标记为知情依据）。
    // - 7 天内令牌有效/可刷新的场景不受影响（request.ts 刷新链路照常工作）；
    // - 覆盖 7 天过期、清缓存、换设备后需重新走四步登录的体验缺口；
    // - fire-and-forget 不阻塞启动，wechatLogin 内部已兜底 catch，失败静默；
    // - 与 key-share 页快捷登录幂等：该页有 !getCAccessToken() 前置，双触发无害
    //   （后端 openid 命中同一用户，仅刷新令牌）。
    if (!getCAccessToken() && getProtocolAgreed()) {
      void wechatLogin();
    }

    // 标记启动完成，记录 appLaunch 耗时
    markLaunchDone();
  },
});
