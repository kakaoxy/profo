/**
 * ④ 科目选择半屏弹层（③记一笔表单页私有组件）.
 *
 * - properties：visible / mode("agent"|"acquire"|undefined) / selectedId；
 * - 首次可见时按 mode 请求 GET /admin/subjects（module 级缓存；mode 变化仅清当前 mode 缓存重拉）；
 * - 按 level "1"–"7" 分组渲染，搜索按 name 过滤；
 * - 点选 triggerEvent("select", {id,name,level}) 交由父页面关闭；点击遮罩 triggerEvent("close")。
 */
import type { components } from "../../../../types/api-types";
import { request } from "../../../../utils/request";
import { getAccessToken } from "../../../../utils/token";

type FinanceSubjectResponse = components["schemas"]["FinanceSubjectResponse"];
type SubjectLevel = components["schemas"]["SubjectLevel"];

/** 层级展示标签（对齐后台 LEVEL_LABELS）. */
const LEVEL_LABELS: Record<SubjectLevel, string> = {
  "1": "①取得成本",
  "2": "②直接改造成本",
  "3": "③交易费用",
  "4": "④资金成本",
  "5": "⑤现金流专属",
  "6": "⑥收入项",
  "7": "⑦配对项",
};

/** 模式维度缓存：按 mode 缓存科目列表，打开弹层复用；mode 变化仅清当前 mode 重拉. */
const cache = new Map<string, FinanceSubjectResponse[]>();

/** 科目行展示结构. */
interface SubjectItem {
  id: string;
  name: string;
  level: SubjectLevel;
  pnlText: string;
  selected: boolean;
}

/** 分组展示结构. */
interface SubjectGroup {
  level: SubjectLevel;
  headText: string;
  items: SubjectItem[];
}

/** 组件对外属性定义. */
const properties = {
  visible: { type: Boolean, value: false },
  mode: { type: String, value: "" },
  selectedId: { type: String, value: "" },
};

/** 组件内部数据（渲染态）. */
const data: {
  keyword: string;
  groups: SubjectGroup[];
  loading: boolean;
  error: boolean;
} = {
  keyword: "",
  groups: [],
  loading: false,
  error: false,
};

/** 组件方法签名. 注意 MethodOption 需保留索引签名以满足 Component 泛型约束. */
interface ComponentMethods {
  [key: string]: Function;
  noop(): void;
  load(): void;
  buildGroups(): void;
  onSearchInput(e: WechatMiniprogram.Input): void;
  onSelect(e: WechatMiniprogram.BaseEvent): void;
  onMask(): void;
  onRetry(): void;
}

/** 当前 property mode 的缓存键（undefined → "all"）. */
function modeKey(mode: string): string {
  return mode || "all";
}

Component<typeof data, typeof properties, ComponentMethods, [], Record<string, never>>({
  properties,
  data,

  observers: {
    // mode 变化（切换项目业务模式）→ 仅清当前 mode 缓存，下次可见重拉
    mode() {
      cache.delete(modeKey(this.data.mode));
    },
    // 首次可见时按 mode 请求；缓存命中则直接分组渲染
    visible(value: boolean) {
      if (value) {
        this.load();
      }
    },
  },

  methods: {
    noop() {},

    load() {
      const mode = this.properties.mode;
      const key = modeKey(mode);
      const cached = cache.get(key);
      if (cached) {
        this.setData({ loading: false, error: false });
        this.buildGroups();
        return;
      }
      const token = getAccessToken();
      if (!token) {
        this.setData({ loading: false, error: true, groups: [] });
        return;
      }
      this.setData({ loading: true, error: false });
      const q = mode ? `?mode=${mode}` : "";
      request<FinanceSubjectResponse[]>({
        url: `/admin/subjects${q}`,
        header: { Authorization: `Bearer ${token}` },
      })
        .then((list) => {
          cache.set(key, list ?? []);
          this.setData({ loading: false, error: false });
          this.buildGroups();
        })
        .catch(() => {
          this.setData({ loading: false, error: true, groups: [] });
        });
    },

    buildGroups() {
      const all = cache.get(modeKey(this.properties.mode)) ?? [];
      const kw = this.data.keyword.trim().toLowerCase();
      const filtered = kw
        ? all.filter((s) => !s.is_deleted && s.name.toLowerCase().includes(kw))
        : all.filter((s) => !s.is_deleted);
      const map = new Map<SubjectLevel, FinanceSubjectResponse[]>();
      for (const s of filtered) {
        const list = map.get(s.level);
        if (list) {
          list.push(s);
        } else {
          map.set(s.level, [s]);
        }
      }
      const selectedId = this.properties.selectedId;
      const groups: SubjectGroup[] = Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([level, items]) => ({
          level,
          headText: `L${level} · ${LEVEL_LABELS[level]}`,
          items: items.map((s) => ({
            id: s.id,
            name: s.name,
            level: s.level,
            pnlText: s.pnl ? "进损益" : "不进损益",
            selected: s.id === selectedId,
          })),
        }));
      this.setData({ groups });
    },

    onSearchInput(e: WechatMiniprogram.Input) {
      this.setData({ keyword: (e.detail.value || "").trim() });
      this.buildGroups();
    },

    onSelect(e: WechatMiniprogram.BaseEvent) {
      const id = e.currentTarget.dataset.id as string;
      const name = e.currentTarget.dataset.name as string;
      const level = e.currentTarget.dataset.level as SubjectLevel;
      this.triggerEvent("select", { id, name, level });
    },

    onMask() {
      this.triggerEvent("close");
    },

    onRetry() {
      cache.delete(modeKey(this.properties.mode));
      this.load();
    },
  },
});