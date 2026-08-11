import type { components } from "../../types/api-types";
import { request } from "../../utils/request";

type PublicCommunitySearchItem = components["schemas"]["PublicCommunitySearchItem"];

/** 输入防抖间隔（ms），防抖期间不发起网络请求 */
const DEBOUNCE_DELAY = 300;
/** 单次搜索返回条数上限（对齐后端接口 limit 参数） */
const SEARCH_LIMIT = 20;

/**
 * 组件内部数据（仅渲染态）.
 * query / results / searching / dropdownOpen 用于视图渲染；
 * 防抖定时器与请求序号为非渲染态，挂到组件实例属性上（见 ComponentCustomProperties），
 * 随实例隔离互不干扰，避免模块级共享变量串扰。
 */
const data: {
  query: string;
  results: PublicCommunitySearchItem[];
  searching: boolean;
  dropdownOpen: boolean;
} = {
  query: "",
  results: [],
  searching: false,
  dropdownOpen: false,
};

/** 组件实例上的非渲染态属性（防抖定时器 + 请求序号 + 连续失败计数）. */
interface ComponentCustomProperties {
  searchTimer: number | null;
  searchSeq: number;
  consecutiveFailures: number;
}

/** 组件对外属性定义（提取为 const 便于泛型传参）. */
const properties = {
  /** 外部回填/回显的小区名（受控值，如编辑场景回填）；用户输入时由 `change` 事件回传 */
  value: { type: String, value: "" },
  /** 输入框占位文案 */
  placeholder: { type: String, value: "请输入小区名称搜索" },
  /** 是否禁用输入与搜索（清空按钮同时隐藏） */
  disabled: { type: Boolean, value: false },
  /** 搜索接口路径：默认 C 端公开接口；房源查询等内部页传入 admin 接口（如 /properties/communities/search） */
  searchUrl: { type: String, value: "/public/communities/search" },
  /** 是否跳过自动鉴权：公开接口为 true（不发送令牌）；内部 admin 接口传 false（自动注入 admin 令牌） */
  skipAuth: { type: Boolean, value: true },
};

/** 组件方法签名（用于 Component 泛型第 3 参数，使 this 含自定义属性）. */
interface Methods {
  [key: string]: Function;
  onInput(e: WechatMiniprogram.Input): void;
  onSelect(e: WechatMiniprogram.BaseEvent): void;
  onClear(): void;
  onUseQuery(): void;
  clearTimer(): void;
  doSearch(keyword: string, currentSeq: number): void;
}

/**
 * 可复用小区搜索组件.
 *
 * 功能：
 * - 输入即搜索：对输入做 300ms 防抖，调用公开接口 `/public/communities/search`；
 * - 结果候选浮层：展示匹配的小区（名称 + 区域/商圈），点击选中；
 * - 无匹配时支持以当前关键词作为小区名提交；
 * - 支持清空按钮、禁用态、外部受控回填（value）。
 *
 * 事件回调（通过 triggerEvent 抛出，供父级绑定 `bind:xxx` 接收）：
 * - `change`：输入文本变化，detail = `{ value }`；
 * - `select`：选中某个小区，detail = `{ id, name, district, business_circle }`；
 * - `clear`：点击清空，无 detail；
 * - `usequery`：使用当前关键词提交，detail = `{ query }`。
 *
 * 组件内部自行管理 query / results / dropdown 等展示态，父级只需消费事件将结果写入业务表单，
 * 降低耦合并便于在项目其他位置（如估价、项目录入等）直接复用。
 */
Component<typeof data, typeof properties, Methods, ComponentCustomProperties>({
  properties,
  data,
  observers: {
    // 外部回填时同步输入框文本；仅当值变化时同步，避免与用户输入互相覆盖
    value(newVal: string) {
      if (newVal !== this.data.query) {
        this.setData({ query: newVal });
      }
    },
  },
  lifetimes: {
    attached() {
      this.searchTimer = null;
      this.searchSeq = 0;
      this.consecutiveFailures = 0;
    },
    // 组件销毁时清理定时器，防止内存泄漏/野回调
    detached() {
      this.clearTimer();
    },
  },
  methods: {
    onInput(e: WechatMiniprogram.Input) {
      const raw = e.detail.value;
      const keyword = raw.trim();
      this.setData({ query: raw });
      this.clearTimer();
      if (!keyword) {
        // 空关键词：收起浮层并清空结果
        this.setData({ results: [], searching: false, dropdownOpen: false });
        this.triggerEvent("change", { value: raw });
        return;
      }
      this.setData({ searching: true, dropdownOpen: true });
      this.searchSeq += 1;
      const currentSeq = this.searchSeq;
      this.searchTimer = setTimeout(() => {
        this.searchTimer = null;
        this.doSearch(keyword, currentSeq);
      }, DEBOUNCE_DELAY);
      this.triggerEvent("change", { value: raw });
    },

    onSelect(e: WechatMiniprogram.BaseEvent) {
      const ds = e.currentTarget.dataset;
      const id = ds.id as string;
      const name = ds.name as string;
      const district = (ds.district as string) || "";
      const businessCircle = (ds.businessCircle as string) || "";
      // 选中后回填输入框、收起浮层，并把完整小区信息抛给父级
      this.setData({ query: name, results: [], searching: false, dropdownOpen: false });
      this.triggerEvent("select", {
        id,
        name,
        district,
        business_circle: businessCircle,
      });
    },

    onClear() {
      this.clearTimer();
      this.setData({ query: "", results: [], searching: false, dropdownOpen: false });
      this.triggerEvent("clear");
    },

    onUseQuery() {
      const query = this.data.query.trim();
      if (!query) {
        return;
      }
      this.setData({ results: [], searching: false, dropdownOpen: false });
      this.triggerEvent("usequery", { query });
    },

    clearTimer() {
      if (this.searchTimer !== null) {
        clearTimeout(this.searchTimer);
        this.searchTimer = null;
      }
    },

    doSearch(keyword: string, currentSeq: number) {
      // 使用参数化搜索接口（默认 C 端公开接口；内部页可传 admin 接口），
      // skipAuth 按调用方属性决定是否发送用户令牌
      request<PublicCommunitySearchItem[]>({
        url: this.properties.searchUrl,
        data: { q: keyword, limit: SEARCH_LIMIT },
        skipAuth: this.properties.skipAuth,
      })
        .then((results) => {
          if (currentSeq !== this.searchSeq) {
            return; // 过期响应，忽略
          }
          this.consecutiveFailures = 0;
          this.setData({ results, searching: false });
        })
        .catch(() => {
          if (currentSeq !== this.searchSeq) {
            return; // 过期响应，忽略
          }
          this.setData({ results: [], searching: false });
          // 连续失败时提示用户，避免搜索异常完全静默（见代码审查 🔵-5）
          this.consecutiveFailures += 1;
          if (this.consecutiveFailures >= 2) {
            wx.showToast({ title: "搜索失败，请稍后重试", icon: "none" });
          }
        });
    },
  },
});