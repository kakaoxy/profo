// 与 index.ts 逻辑完全一致（去掉类型注解），改动需同步两侧
import { request } from "../../utils/request";

// 输入防抖间隔（ms），防抖期间不发起网络请求
const DEBOUNCE_DELAY = 300;
// 单次搜索返回条数上限（对齐后端接口 limit 参数）
const SEARCH_LIMIT = 20;

// 组件内部数据；searchTimer/searchSeq 为防抖与请求序号，随实例隔离互不干扰
const data = {
  query: "",
  results: [],
  searching: false,
  dropdownOpen: false,
  searchTimer: null,
  searchSeq: 0,
};

Component({
  properties: {
    value: { type: String, value: "" },
    placeholder: { type: String, value: "请输入小区名称搜索" },
    disabled: { type: Boolean, value: false },
  },

  data,

  observers: {
    // 外部回填时同步输入框文本；仅当值变化时同步，避免与用户输入互相覆盖
    value(newVal) {
      if (newVal !== this.data.query) {
        this.setData({ query: newVal });
      }
    },
  },

  lifetimes: {
    attached() {
      this.data.searchTimer = null;
      this.data.searchSeq = 0;
    },
    // 组件销毁时清理定时器，防止内存泄漏/野回调
    detached() {
      this.clearTimer();
    },
  },

  methods: {
    onInput(e) {
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
      this.data.searchSeq += 1;
      const currentSeq = this.data.searchSeq;
      this.data.searchTimer = setTimeout(() => {
        this.data.searchTimer = null;
        this.doSearch(keyword, currentSeq);
      }, DEBOUNCE_DELAY);
      this.triggerEvent("change", { value: raw });
    },

    onSelect(e) {
      const ds = e.currentTarget.dataset;
      const id = ds.id;
      const name = ds.name;
      const district = ds.district || "";
      const businessCircle = ds.businessCircle || "";
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
      if (this.data.searchTimer !== null) {
        clearTimeout(this.data.searchTimer);
        this.data.searchTimer = null;
      }
    },

    doSearch(keyword, currentSeq) {
      // 公开接口，无需鉴权；request GET 默认不携带 Authorization
      request({
        url: "/public/communities/search",
        data: { q: keyword, limit: SEARCH_LIMIT },
      })
        .then((results) => {
          if (currentSeq !== this.data.searchSeq) {
            return; // 过期响应，忽略
          }
          this.setData({ results, searching: false });
        })
        .catch(() => {
          if (currentSeq === this.data.searchSeq) {
            this.setData({ results: [], searching: false });
          }
        });
    },
  },
});