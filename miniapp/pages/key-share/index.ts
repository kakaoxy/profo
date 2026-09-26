/**
 * 钥匙分享 · 经纪人访客页（分享 token 直达，设计稿 D1/D2）.
 *
 * 页面职责（spec Task 11）：
 * - token 解析：onLoad options.token；小程序码 scene 兼容 "token=xxx" 键值对
 *   （URL 编码形式，先解码再提取，风格同 landing 页 parseSceneCode）；两者皆无
 *   → 直接渲染失效占位态（不暴露细节），不发起请求
 * - 免登录加载：GET /public/key-shares/{token} → 三态渲染：
 *   active（D1，is_expired 仅页顶提示条；过期后全部条目「密码不可查看」，不提供查看入口）/
 *   revoked（D2 回收态）/ 404（「分享不存在或已失效」占位）；其余网络错误 → error 态可重试
 * - 查看明文：未登录先 wechatLogin() 补登录；POST reveal（不 skipAuth，需带
 *   C 端令牌，调用即留痕）→ 就地显示明文；422 按 message 语义降级
 *   （含「已回收」→ 整页 D2 / 含「过期」→ 整页过期不可查看 / 含「失效」→ 该行「密码已失效」chip）
 * - 不实现 onShareAppMessage：spec 规定经纪人不允许再转发该分享
 *
 * GET 不 skipAuth 的说明：请求层对 /public/* 自动优先注入 c_access_token，
 * 未登录时无令牌等同匿名；后端该接口鉴权为可选（认证失败静默降级匿名，
 * 不会 401），因此已登录访客能拿到 viewed/last_viewed_at 角标（D1 已查看态），
 * 未登录访客链路与 skipAuth 完全一致。
 */
import type { components } from "../../types/api-types";
import { request } from "../../utils/request";
import type { HttpResponseError } from "../../utils/request";
import { pad2 } from "../../utils/format";
import { getCAccessToken } from "../../utils/token";
import { wechatLogin } from "../../utils/wechat-auth";

type PublicKeyShareResponse = components["schemas"]["PublicKeyShareResponse"];
type PublicKeyShareItem = components["schemas"]["PublicKeyShareItem"];
type PublicKeyShareRevealResponse = components["schemas"]["PublicKeyShareRevealResponse"];

/** 一天毫秒数（剩余有效期天数估算）. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** 房源行 wxml 渲染结构（列表不做复杂表达式，ts 侧预组装）. */
interface KeyItemDisplay {
  /** 密码组 ID（reveal 路径参数）. */
  keyId: string;
  address: string;
  projectName: string;
  /** 右侧密码区状态：expired（分享已过期，不可查看）/ deleted（密码组已失效）/ revealed（明文）/ masked（掩码 + 查看）. */
  state: "expired" | "deleted" | "revealed" | "masked";
  /** 服务端已记录查看过（掩码态查看入口：true=mlink 文字链，false=按钮）. */
  viewed: boolean;
  /** 明文密码（state=revealed 时渲染）. */
  password: string;
  /** 查看记录时间 HH:mm（服务端 last_viewed_at 或本次 reveal 的本机时间）. */
  viewedAtText: string;
}

interface PageData {
  loading: boolean;
  /** 网络加载失败（可重试），区别于 404 的占位态. */
  error: boolean;
  /** token 缺失/无效（404）占位态；标题由 notFoundTitle 区分文案. */
  notFound: boolean;
  notFoundTitle: string;
  /** 分享已回收（D2 回收态）. */
  revoked: boolean;
  /** 回收说明（含 M.DD HH:mm；reveal 阶段发现回收时无精确时间，用通用文案）. */
  revokedDesc: string;
  /** 分享 token（重试与 reveal 复用）. */
  token: string;
  /** 分享已过期（硬失效）：页顶提示条 + 全部条目不可查看（可见房源清单，需分享人延长或重新分享）. */
  isExpired: boolean;
  sharerName: string;
  /** 分享人头像占位首字. */
  sharerInitial: string;
  /** 分享人卡副行：N 套房源 · 有效期至 M.DD（剩 N 天）. */
  subLine: string;
  items: KeyItemDisplay[];
  /** 带看注意事项行（按房源去重聚合，单条省略地址标签）. */
  noteLines: { addr: string; text: string }[];
  /** reveal 进行中（防并发：重复调用会重复留痕）. */
  revealing: boolean;
}

interface PageCustom {
  loadShare(token: string): Promise<void>;
  onRetry(): void;
  onRevealTap(e: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { keyId?: string; index?: number }>): void;
  /** reveal 成功：该行就地切换明文态. */
  applyReveal(index: number, password: string): void;
  /** reveal 失败处理：语义降级，返回需 toast 的文案（空串不 toast）. */
  resolveRevealError(err: unknown, index: number): string;
  onContactError(): void;
  /** 查看更多房源：跳转房源列表（tabBar 页，switchTab）. */
  onMoreProjects(): void;
}

/** 从 scene 场景值提取 token（键值对 "token=xxx"，兼容带路径前缀形态）. */
function parseTokenFromScene(scene: string): string {
  const query = scene.includes("?") ? scene.slice(scene.indexOf("?") + 1) : scene;
  const pair = query.split("&").find((p) => p.startsWith("token="));
  return pair ? pair.slice("token=".length) : "";
}

/** ISO 时间 → 当日 HH:mm（解析失败返回空串）. */
function formatHHmm(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** ISO 时间 → M.DD HH:mm（回收说明用；解析失败返回空串）. */
function formatMDHHmm(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return `${d.getMonth() + 1}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 当前本机时间 HH:mm（reveal 成功后即时展示留痕时间）. */
function nowHHmm(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 分享人卡副行：N 套房源 · 有效期至 M.DD（剩 N 天）；过期/缺时间时省略剩余天数. */
function buildSubLine(itemsCount: number, expiresAt: string | null | undefined, isExpired: boolean): string {
  const base = `${itemsCount} 套房源`;
  if (!expiresAt) {
    return base;
  }
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) {
    return base;
  }
  const until = `${d.getMonth() + 1}.${pad2(d.getDate())}`;
  if (isExpired) {
    return `${base} · 有效期至 ${until}`;
  }
  const remainDays = Math.ceil((d.getTime() - Date.now()) / DAY_MS);
  const suffix = remainDays > 0 ? `（剩 ${remainDays} 天）` : "";
  return `${base} · 有效期至 ${until}${suffix}`;
}

/** D2 回收态说明（含 M.DD HH:mm；时间缺失时退化为通用文案）. */
function buildRevokedDesc(revokedAt: string | null | undefined): string {
  const time = formatMDHHmm(revokedAt);
  return time
    ? `分享人已于 ${time} 手动回收该分享，请联系分享人重新获取`
    : "分享人已手动回收该分享，请联系分享人重新获取";
}

/** 分享条目 → 注意事项行（按 project_id 去重；仅 1 条时省略地址标签）. */
function buildNoteLines(items: PublicKeyShareItem[]): { addr: string; text: string }[] {
  const seen = new Set<string>();
  const lines: { addr: string; text: string }[] = [];
  for (const item of items) {
    const note = (item.key_note ?? "").trim();
    if (!note || seen.has(item.project_id)) {
      continue;
    }
    seen.add(item.project_id);
    lines.push({ addr: lines.length > 0 ? item.address : "", text: note });
  }
  return lines;
}

/** 分享条目 → 展示结构：过期→expired；deleted→chip；viewed→mlink；未看→按钮（设计稿 D1 行态）. */
function toItemDisplay(item: PublicKeyShareItem, shareExpired: boolean): KeyItemDisplay {
  const base = {
    keyId: item.key_id,
    address: item.address,
    projectName: item.project_name,
    viewed: false,
    password: "",
    viewedAtText: "",
  };
  if (shareExpired) {
    // 过期优先于条目级状态：分享过期后一律不可查看（含此前已查看过的组）
    return { ...base, state: "expired" };
  }
  if (item.key_deleted) {
    return { ...base, state: "deleted" };
  }
  if (item.viewed) {
    return { ...base, state: "masked", viewed: true, viewedAtText: formatHHmm(item.last_viewed_at) };
  }
  return { ...base, state: "masked" };
}

/** 从 HttpResponseError 提取后端 message（{code,message} 格式），缺失返回空串. */
function extractErrorMessage(err: unknown): string {
  const body = (err as HttpResponseError).body as { message?: string } | undefined;
  return typeof body?.message === "string" ? body.message : "";
}

Page<PageData, PageCustom>({
  data: {
    loading: false,
    error: false,
    notFound: false,
    notFoundTitle: "分享不存在或已失效",
    revoked: false,
    revokedDesc: "",
    token: "",
    isExpired: false,
    sharerName: "",
    sharerInitial: "",
    subLine: "",
    items: [],
    noteLines: [],
    revealing: false,
  },

  onLoad(options) {
    const rawOptions = options as Record<string, string | undefined>;
    // 直连：query 参数 token；小程序码：scene 为 "token=xxx" 的 URL 编码形式
    let token = rawOptions.token || "";
    if (!token && rawOptions.scene) {
      token = parseTokenFromScene(decodeURIComponent(rawOptions.scene));
    }
    if (!token) {
      // 无 token（非本功能入口）：直接渲染失效占位态，不发起请求
      this.setData({ notFound: true, notFoundTitle: "分享已失效" });
      return;
    }
    this.setData({ token });
    this.loadShare(token);
  },

  /** 免登录加载分享信息：revoked → D2；active → D1；404 → 占位；其余网络错误可重试. */
  async loadShare(token: string) {
    this.setData({ loading: true, error: false, notFound: false, revoked: false, noteLines: [] });
    try {
      const res = await request<PublicKeyShareResponse>({
        url: `/public/key-shares/${encodeURIComponent(token)}`,
      });
      if (res.status === "revoked") {
        this.setData({
          loading: false,
          revoked: true,
          revokedDesc: buildRevokedDesc(res.revoked_at),
        });
        return;
      }
      this.setData({
        loading: false,
        isExpired: res.is_expired,
        sharerName: res.sharer_name,
        sharerInitial: (res.sharer_name || "分").slice(0, 1),
        subLine: buildSubLine(res.items_count, res.expires_at, res.is_expired),
        items: (res.items ?? []).map((item) => toItemDisplay(item, res.is_expired)),
        noteLines: buildNoteLines(res.items ?? []),
      });
    } catch (err) {
      if ((err as HttpResponseError).statusCode === 404) {
        // token 无效/分享不存在：统一占位态，不区分细节
        this.setData({ loading: false, notFound: true, notFoundTitle: "分享不存在或已失效" });
        return;
      }
      this.setData({ loading: false, error: true });
    }
  },

  /** 网络错误重试：用解析出的 token 走完整链路. */
  onRetry() {
    const { token } = this.data;
    if (!token) {
      return;
    }
    this.loadShare(token);
  },

  /** 查看/重新查看明文：未登录先补微信登录，再调 reveal（需 C 端令牌，调用即留痕）. */
  async onRevealTap(e) {
    const keyId = String(e.currentTarget.dataset.keyId || "");
    const index = Number(e.currentTarget.dataset.index);
    if (!keyId || !Number.isInteger(index) || index < 0 || index >= this.data.items.length) {
      return;
    }
    if (this.data.revealing) {
      return;
    }
    const { token } = this.data;
    if (!token) {
      return;
    }
    this.setData({ revealing: true });
    wx.showLoading({ title: "加载中…", mask: true });
    let toastTitle = "";
    try {
      if (!getCAccessToken()) {
        // 未登录：快捷微信登录（失败不阻断页面，仅提示）
        const login = await wechatLogin();
        if (!login.success) {
          toastTitle = "需要微信授权后查看";
          return;
        }
      }
      const res = await request<PublicKeyShareRevealResponse>({
        url: `/public/key-shares/${encodeURIComponent(token)}/keys/${encodeURIComponent(keyId)}/reveal`,
        method: "POST",
      });
      this.applyReveal(index, res.password);
    } catch (err) {
      // 错误态切换在 resolveRevealError 内同步完成；toast 统一延后到 hideLoading 之后
      toastTitle = this.resolveRevealError(err, index);
    } finally {
      wx.hideLoading();
      this.setData({ revealing: false });
      if (toastTitle) {
        wx.showToast({ title: toastTitle, icon: "none" });
      }
    }
  },

  /** reveal 成功：该行就地切换明文态（等宽大字 + rust 留痕角标）. */
  applyReveal(index: number, password: string): void {
    const item = this.data.items[index];
    if (!item) {
      return;
    }
    this.setData({
      [`items[${index}]`]: {
        ...item,
        state: "revealed",
        password,
        viewedAtText: nowHHmm(),
      },
    });
  },

  /**
   * reveal 失败处理：按后端 message 语义降级，返回需 toast 的文案（空串不 toast）.
   * - 404：分享不存在/已删除 → 整页占位态；
   * - message 含「已回收」→ 整页切 D2（此时无精确回收时间，用通用文案）；
   * - message 含「过期」→ 分享已过期（页内停留期间刚过期）：切过期态，全部条目不可查看；
   * - message 含「失效」→ 密码组已删除/停用：该行降级「密码已失效」chip，分享状态不变；
   * - 其余（含 401 刷新失败）：toast 后端 message 或通用文案.
   */
  resolveRevealError(err: unknown, index: number): string {
    const message = extractErrorMessage(err);
    if ((err as HttpResponseError).statusCode === 404) {
      this.setData({ notFound: true, notFoundTitle: "分享不存在或已失效" });
      return "";
    }
    if (message.includes("已回收")) {
      this.setData({ revoked: true, revokedDesc: buildRevokedDesc(null) });
      return "";
    }
    if (message.includes("过期")) {
      this.setData({
        isExpired: true,
        items: this.data.items.map((item): KeyItemDisplay => ({ ...item, state: "expired" })),
      });
      return message;
    }
    if (message.includes("失效")) {
      const item = this.data.items[index];
      if (item) {
        this.setData({ [`items[${index}]`]: { ...item, state: "deleted" } });
        return message;
      }
    }
    return message || "查看失败，请稍后重试";
  },

  /** 客服会话按钮出错兜底：复制分享人名并 toast（D2「联系分享人」降级路径）. */
  onContactError(): void {
    const { sharerName } = this.data;
    wx.setClipboardData({
      data: sharerName || "分享人",
      success: () => {
        wx.showToast({ title: "已复制分享人，请微信联系", icon: "none" });
      },
    });
  },

  /** 查看更多房源：跳转房源列表（tabBar 页必须 switchTab；未登录由列表页自行引导）. */
  onMoreProjects(): void {
    wx.switchTab({ url: "/pages/projects/list/index" });
  },
});
