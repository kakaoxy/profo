/**
 * 性能基线采集（P-00）.
 *
 * 通过 wx.getPerformance 观察者采集小程序启动、路由切换、首屏渲染（firstRender）关键指标，
 * 聚合为内存快照（getPerfSnapshot），开发期经 console 输出；线上上报通道待产品定义后复用快照结果。
 *
 * 设计约束：
 * - 基础库不支持 wx.getPerformance 时静默降级，不阻塞业务启动；
 * - 采集仅追加内存，不发起任何网络请求（不引入新接口）；
 * - 路由切换指标为增量采集，快照保留最近 N 条。
 */

/** 性能条目（微信 PerformanceEntry 最小字段）. */
export interface PerfEntry {
  name: string;
  entryType: string;
  startTime: number;
  duration: number;
}

/** 性能快照：供调试面板 / 后续埋点上报使用. */
export interface PerfSnapshot {
  /** 小程序启动耗时（ms，模块加载 → onLaunch 完成）. */
  appLaunch: number;
  /** 启动时刻（ms，模块加载时间戳）. */
  launchedAt: number;
  /** 最近的路由切换条目（navigation）. */
  routeEntries: PerfEntry[];
  /** 最近的首屏渲染条目（render）. */
  renderEntries: PerfEntry[];
  /** 全部条目（按时间排序，最多保留 200 条）. */
  entries: PerfEntry[];
}

const MAX_ENTRIES = 200;
const MAX_ROUTE = 20;

const entries: PerfEntry[] = [];
const moduleLoadAt = Date.now();

let started = false;
let launchEndAt = 0;

function pushEntry(e: PerfEntry): void {
  entries.push(e);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
}

/**
 * 初始化性能观察者，应在 App.onLaunch 最先调用.
 * 采集 entryTypes：navigation（路由切换）、render（页面渲染）、script（脚本执行）.
 */
export function initPerformanceMonitor(): void {
  if (started) {
    return;
  }
  started = true;
  try {
    const performance = wx.getPerformance();
    const observer = performance.createObserver((list) => {
      list.getEntries().forEach(
        (entry: { name: string; entryType: string; startTime: number; duration: number }) => {
          pushEntry({
            name: entry.name,
            entryType: entry.entryType,
            startTime: entry.startTime,
            duration: entry.duration,
          });
        },
      );
    });
    observer.observe({ entryTypes: ["navigation", "render", "script"] });
  } catch (err) {
    // 基础库不支持：静默降级
    console.warn("[perf] wx.getPerformance 不可用，性能基线采集已跳过", err);
  }
}

/** 标记启动完成（App.onLaunch 末尾调用），记录启动耗时. */
export function markLaunchDone(): void {
  launchEndAt = Date.now();
}

/** 读取当前性能快照（内存级，供调试/上报）. */
export function getPerfSnapshot(): PerfSnapshot {
  const navigation = entries
    .filter((e) => e.entryType === "navigation")
    .slice(-MAX_ROUTE);
  const render = entries.filter((e) => e.entryType === "render").slice(-MAX_ROUTE);
  return {
    appLaunch: launchEndAt > 0 ? launchEndAt - moduleLoadAt : 0,
    launchedAt: moduleLoadAt,
    routeEntries: navigation,
    renderEntries: render,
    entries: [...entries],
  };
}

/** 开发期控制台输出性能基线摘要（提审前人工核对用）. */
export function dumpPerfSummary(): void {
  const snap = getPerfSnapshot();
  console.info("[perf] 启动耗时(ms):", snap.appLaunch);
  console.info("[perf] 路由切换:", snap.routeEntries);
  console.info("[perf] 首屏渲染:", snap.renderEntries);
}
