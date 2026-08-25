import { initPerformanceMonitor, markLaunchDone } from "./utils/performance";

App({
  onLaunch() {
    // 性能基线采集（P-00）：wx.getPerformance 观察者，采集启动/路由/首屏渲染指标
    initPerformanceMonitor();
    // 业务启动逻辑…

    // 标记启动完成，记录 appLaunch 耗时
    markLaunchDone();
  },
});
