/**
 * 页面单测公共测试基建（仅 vitest 环境使用，不参与小程序运行时）.
 *
 * 提供：
 * - 微信运行时桩：捕获 Page(config)、常用 wx API mock（可断言/复位）
 * - createPageHarness：以捕获的页面配置为模板构造实例，
 *   setData 按「顶层字段合并 + `key[i]` 数组索引路径」语义生效
 * - 受控请求队列：配合 createRequestMock 把 request 挂到队列，
 *   测试中按发出顺序手动 resolve/reject，构造竞态时序
 */
import { vi } from "vitest";

type AnyRecord = Record<string, any>;

/* ===== 微信运行时桩 ===== */

export const wxStubs = {
  navigateTo: vi.fn(),
  navigateBack: vi.fn(),
  switchTab: vi.fn(),
  stopPullDownRefresh: vi.fn(),
  showToast: vi.fn(),
  setStorageSync: vi.fn(),
  getStorageSync: vi.fn(() => null),
  removeStorageSync: vi.fn(),
};

(globalThis as unknown as { wx: typeof wxStubs }).wx = wxStubs;

/** 最近一次 Page(config) 注册的页面配置. */
let pageConfig: AnyRecord | null = null;

(globalThis as unknown as { Page: (cfg: unknown) => void }).Page = (cfg) => {
  pageConfig = cfg as AnyRecord;
};

/** 获取已捕获的页面配置；未加载时显式报错而非返回 undefined. */
export function getPageConfig(): AnyRecord {
  if (!pageConfig) {
    throw new Error("Page 配置尚未加载：请先在 beforeAll 中动态 import 待测页面");
  }
  return pageConfig;
}

/** 复位所有 wx stub 的调用记录（含请求队列），供测试间使用. */
export function resetTestStubs(): void {
  Object.values(wxStubs).forEach((stub) => stub.mockClear());
  pendingRequests.length = 0;
}

/** 以捕获的页面配置为模板创建实例：深拷贝 data 并应用 seed. */
export function createPageHarness(seed: AnyRecord = {}): AnyRecord {
  const cfg = getPageConfig();
  const state: AnyRecord = JSON.parse(JSON.stringify(cfg.data));
  state.items = [];
  Object.assign(state, seed);
  if (seed.items) {
    state.items = JSON.parse(JSON.stringify(seed.items));
  }
  return {
    ...cfg,
    data: state,
    /** 模拟微信 setData：顶层合并 + `key[i]` 索引路径局部更新. */
    setData(patch: AnyRecord) {
      for (const [key, value] of Object.entries(patch)) {
        const m = /^(\w+)\[(\d+)\]$/.exec(key);
        if (m) {
          (state[m[1]] as unknown[])[Number(m[2])] = value;
        } else {
          state[key] = value;
        }
      }
    },
  };
}

/* ===== 受控请求队列 ===== */

export interface PendingRequest {
  opts: { url: string; data: Record<string, string | number> };
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

const pendingRequests: PendingRequest[] = [];

/** 发出但尚未 settle 的受控请求（按发出顺序）. */
export function pendingReqs(): PendingRequest[] {
  return pendingRequests;
}

/**
 * vi.mock 工厂：把 request 挂到受控请求队列.
 * 用法：vi.mock("<相对路径>/utils/request", () => createRequestMock())。
 * 工厂惰性执行：需保证首次导入被测页面（通常在 beforeAll 动态 import）晚于本模块初始化。
 */
export function createRequestMock(): { request: (opts: PendingRequest["opts"]) => Promise<unknown> } {
  return {
    request: vi.fn(
      (opts: PendingRequest["opts"]) =>
        new Promise((resolve, reject) => {
          pendingRequests.push({ opts, resolve, reject });
        })
    ),
  };
}
