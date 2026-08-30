/**
 * 「评估授权」页（员工侧）.
 *
 * 三种模式：
 * - 待评估授权（默认）：数据源为工作台列表经 EventChannel 传递的原始队列项（leadDetail 事件），
 *   不新增详情端点；冷启动无数据时展示缺失态引导返回列表。
 * - 已处理只读详情（?mode=view）：工作台已处理卡进入，展示授权结果、评估历史与跟进记录
 *   （GET /public/leads/my/acquired/{id}/follow-ups、GET .../evaluations）。
 * - 再次评估（viewMode 内 openAdjustPanel）：对 pending_visit/visited 线索调整评估价，
 *   语义对齐 admin CurrentEvalPriceSection「调整评估价」，
 *   提交 POST /public/leads/my/acquired/{id}/evaluations（追加评估历史 + 刷 eval_price，不改状态）。
 * 待评估模式三动作（approve/reject/lost）语义对齐 admin PendingAssessmentPanel，
 * 单端点原子提交（POST /public/leads/my/acquired/{id}/authorize-assessment）：
 * - approve：评估价必填（>0、≤999 万、≤2 位小数）+ 意见选填 ≤200 字，
 *   实时差值提示（低报绿 / 高报琥珀 / 确认按钮禁用与动态金额文案）；
 * - reject / lost：原因选填 ≤500 字（对齐 admin 选填语义）。
 * 409 幂等冲突弹窗引导返回并刷新列表（默认/adjust 模式文案区分）。
 * 「小区行情分析」入口复用 valuation/detail 的 GET /public/auth/me 预检模式
 * （未登录 toast 引导 / 未绑手机弹绑定框），通过后跳转既有分析页。
 * 视觉遵循 Steep 设计体系（eval-auth-hifi.html 屏C）一比一还原。
 */
import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import { invalidatePendingAssessmentCount } from "../../../utils/pending-assessment";
import { resolveImageUrl } from "../../../utils/url";
import { formatDate } from "../../../utils/valuation-display";

type QueueItem = components["schemas"]["PendingAssessmentQueueItem"];
type HandledItem = components["schemas"]["HandledItem"];
type AuthorizeResponse = components["schemas"]["LeadAssessmentAuthorizeResponse"];
type PublicUserInfo = components["schemas"]["PublicUserInfo"];
type PublicFollowupItem = components["schemas"]["PublicFollowupItem"];
type EvalHistoryItem = components["schemas"]["LeadEvalHistoryResponse"];

type AuthorizeAction = "approve" | "reject" | "lost";

/** 提交动作：三动作授权 + 再次评估（adjust 走独立端点，不改状态）. */
type SubmitAction = AuthorizeAction | "adjust";

/** 面板模式：空串表示全部关闭. */
type PanelMode = "" | "approve" | "reject" | "lost" | "adjust";

/** 差值提示类型：空串=默认引导文案. */
type DiffType = "" | "good" | "warn" | "same" | "invalid";

/** 评估价格式校验：>0 且最多两位小数（与后端 Pydantic gt=0/decimal_places=2 语义一致）. */
const EVAL_PRICE_RE = /^\d+(\.\d{1,2})?$/;
/** 评估价整数部分上限（设计稿口径：不超过 999 万）. */
const EVAL_PRICE_INT_RE = /^\d{1,3}$/;
/** approve 意见长度上限（设计稿口径 200 字，后端上限 500）. */
const MAX_REMARK_APPROVE = 200;
/** reject/lost 原因长度上限（对齐后端 max_length=500）. */
const MAX_REMARK = 500;

/** 已处理详情（viewMode）状态标签语义，对齐工作台已处理卡配色. */
const VIEW_STATUS_META: Record<string, { text: string; cls: string }> = {
  pending_visit: { text: "已授权", cls: "green" },
  visited: { text: "已看房", cls: "green" },
  rejected: { text: "已驳回", cls: "gray" },
  lost_to_competitor: { text: "他司成交", cls: "rust" },
};

/** 可再次评估（调整评估价）的状态集合，对齐 admin CurrentEvalPriceSection 口径. */
const ADJUSTABLE_STATUSES: string[] = ["pending_visit", "visited"];

/** 冲突弹窗（409）文案：默认模式与再次评估模式区分. */
const CONFLICT_COPY = {
  default: {
    title: "该线索已被完成评估",
    desc: "同事刚刚在后台处理了这条线索，当前数据已过期。点击返回将自动刷新工作台列表。",
  },
  adjust: {
    title: "线索状态已变化",
    desc: "该线索当前状态不支持调整评估价，返回后将自动刷新工作台列表。",
  },
} as const;

/** 跟进方式展示文案（evaluation 为评估历史合成值，正常不出现在跟进接口）. */
const FOLLOWUP_METHOD_TEXT: Record<string, string> = {
  phone: "电话",
  wechat: "微信",
  face: "面谈",
  visit: "实地带看",
  evaluation: "评估",
};

/** 跟进记录展示结构. */
interface FollowupDisplay {
  id: string;
  methodText: string;
  content: string;
  timeText: string;
}

/** 评估历史展示结构（viewMode，倒序，首条为当前评估价）. */
interface EvalHistoryDisplay {
  id: string;
  priceText: string;
  remarkText: string;
  timeText: string;
  isCurrent: boolean;
}

/** phone-bind-modal 组件实例上需调用的方法. */
interface PhoneBindModalInstance {
  show(): void;
  hide(): void;
}

/** 页面 data. */
interface PageData {
  leadId: string;
  /** 队列项缺失（冷启动无 EventChannel 数据）. */
  missing: boolean;
  /** 只读详情模式（工作台已处理卡进入）：隐藏操作栏与面板，展示跟进记录. */
  viewMode: boolean;
  /** 可再次评估（viewMode 且状态为 pending_visit/visited 时展示「调整评估价」操作栏）. */
  canAdjust: boolean;
  /** Hero 状态标签（待评估=琥珀；viewMode 按流转状态着色）. */
  statusTagText: string;
  statusTagClass: string;
  // 线索信息全景
  community_name: string;
  district: string;
  /** 参数宫格（建筑面积/户型/朝向/楼层/区域）. */
  paramGrid: { label: string; value: string }[];
  /** 业主报价（万），缺失为 null（差值提示用）. */
  expectedPrice: number | null;
  hasPrice: boolean;
  priceText: string;
  /** 授权评估价（viewMode：approved 有值，reject/lost 为空）. */
  hasEvalPrice: boolean;
  evalPriceText: string;
  images: string[];
  remarks: string;
  created_at: string;
  /** 处理时间（viewMode）. */
  auditTimeText: string;
  sourceText: string;
  /** 跟进记录（viewMode 拉取）. */
  followups: FollowupDisplay[];
  /** 跟进记录是否已拉取（含失败，用于区分空态与加载中）. */
  followupsLoaded: boolean;
  /** 评估历史（viewMode 拉取，倒序，首条为当前评估价）. */
  evalHistories: EvalHistoryDisplay[];
  /** 评估历史是否已拉取（含失败，用于区分空态与加载中）. */
  evalHistoriesLoaded: boolean;
  // 行情分析联动
  pendingCommunityName: string;
  // 面板与表单
  panelMode: PanelMode;
  evalPrice: string;
  remark: string;
  remarkLen: number;
  diffType: DiffType;
  diffValue: string;
  diffDefault: string;
  focusedField: string;
  canConfirm: boolean;
  confirmText: string;
  formError: string;
  submitting: boolean;
  /** 409 幂等冲突弹窗（默认/adjust 模式文案区分）. */
  showConflict: boolean;
  conflictTitle: string;
  conflictDesc: string;
  // 模板可用的长度上限常量
  MAX_REMARK: number;
  MAX_REMARK_APPROVE: number;
}

/** 页面自定义方法. */
interface PageCustom {
  applyItem(item: QueueItem): void;
  applyHandledItem(item: HandledItem): void;
  fetchFollowups(): Promise<void>;
  fetchEvalHistories(): Promise<void>;
  onPreviewImage(e: WechatMiniprogram.BaseEvent): void;
  onTapCommunityAnalysis(): void;
  enterCommunityAnalysis(name: string): void;
  onPhoneModalBound(): void;
  onPhoneModalGoBindAccount(): void;
  openPanel(e: WechatMiniprogram.BaseEvent): void;
  closePanel(): void;
  onFocusField(e: WechatMiniprogram.BaseEvent): void;
  onBlurField(e: WechatMiniprogram.BaseEvent): void;
  onPriceInput(e: WechatMiniprogram.Input): void;
  onRemarkInput(e: WechatMiniprogram.Input): void;
  submitAuthorize(): void;
  doSubmit(action: SubmitAction): Promise<void>;
  /** 确认按钮主文案（模板事件外复用）：adjust=「确认调整」，其余=「确认授权」. */
  confirmVerb(): string;
  openAdjustPanel(): void;
  onConflictBack(): void;
  onBack(): void;
}

/** 评估价是否有效：>0、≤999 万、≤2 位小数（对齐设计稿交互校验）. */
function isValidEvalPrice(price: string): boolean {
  if (!EVAL_PRICE_RE.test(price)) {
    return false;
  }
  const v = Number(price);
  return v > 0 && EVAL_PRICE_INT_RE.test(price.split(".")[0]);
}

/** 差值提示：空串=默认引导文案；非法输入给出 invalid 提示；有效输入且业主报价存在时给出高低比较（低报绿 / 高报琥珀 / 一致）. */
function diffOf(price: string, expected: number | null): { type: DiffType; value: string } {
  if (!price) {
    return { type: "", value: "" };
  }
  if (!isValidEvalPrice(price)) {
    // 整数后单独的小数点（如「12.」）视为输入中间态，不闪红提示
    return price.endsWith(".") ? { type: "", value: "" } : { type: "invalid", value: "" };
  }
  if (expected == null) {
    return { type: "", value: "" };
  }
  const d = Math.round((Number(price) - expected) * 100) / 100;
  if (d === 0) {
    return { type: "same", value: "" };
  }
  return d < 0 ? { type: "good", value: `${Math.abs(d)}` } : { type: "warn", value: `${d}` };
}

Page<PageData, PageCustom>({
  data: {
    leadId: "",
    // 冷启动默认缺失态：EventChannel 数据到达（applyItem/applyHandledItem）后才切换为完整内容
    missing: true,
    viewMode: false,
    canAdjust: false,
    statusTagText: "● 待评估",
    statusTagClass: "amber",
    community_name: "",
    district: "",
    paramGrid: [],
    expectedPrice: null,
    hasPrice: false,
    priceText: "—",
    hasEvalPrice: false,
    evalPriceText: "",
    images: [],
    remarks: "",
    created_at: "",
    auditTimeText: "",
    sourceText: "",
    followups: [],
    followupsLoaded: false,
    evalHistories: [],
    evalHistoriesLoaded: false,
    pendingCommunityName: "",
    panelMode: "",
    evalPrice: "",
    remark: "",
    remarkLen: 0,
    diffType: "",
    diffValue: "",
    diffDefault: "",
    focusedField: "",
    canConfirm: false,
    confirmText: "确认授权",
    formError: "",
    submitting: false,
    showConflict: false,
    conflictTitle: CONFLICT_COPY.default.title,
    conflictDesc: CONFLICT_COPY.default.desc,
    MAX_REMARK,
    MAX_REMARK_APPROVE,
  },

  onLoad(query: Record<string, string | undefined>) {
    const viewMode = query.mode === "view";
    this.setData({ leadId: query.id ?? "", viewMode });
    const channel = this.getOpenerEventChannel?.();
    if (channel && typeof channel.on === "function") {
      channel.on("leadDetail", (item: QueueItem | HandledItem) => {
        if (viewMode) {
          this.applyHandledItem(item as HandledItem);
        } else {
          this.applyItem(item as QueueItem);
        }
      });
    }
    if (viewMode) {
      void this.fetchFollowups();
      void this.fetchEvalHistories();
    }
  },

  applyItem(item: QueueItem) {
    const hasPrice = item.expected_price != null;
    this.setData({
      missing: false,
      community_name: item.community_name,
      district: item.district || "",
      paramGrid: [
        { label: "建筑面积", value: item.area != null ? `${item.area}㎡` : "—" },
        { label: "户型", value: item.layout || "—" },
        { label: "朝向", value: item.orientation || "—" },
        { label: "楼层", value: item.floor_info || "—" },
        { label: "区域", value: item.district || "—" },
      ],
      expectedPrice: item.expected_price,
      hasPrice,
      priceText: hasPrice ? `${item.expected_price}` : "—",
      images: (item.images || []).map((u) => resolveImageUrl(u, { width: 480 })),
      remarks: item.remarks || "",
      created_at: formatDate(item.created_at, true),
      sourceText: item.source === "customer_share" ? "客户分享" : "员工直录",
      diffDefault:
        item.expected_price != null
          ? `输入评估价后自动比对业主报价 ¥${item.expected_price} 万`
          : "输入评估价后自动比对业主报价",
    });
  },

  /** 已处理线索只读详情：状态标签 + 授权价/处理时间 + 再次评估入口 + 评估历史. */
  applyHandledItem(item: HandledItem) {
    const hasPrice = item.expected_price != null;
    const meta = VIEW_STATUS_META[item.status] ?? { text: item.status_display, cls: "gray" };
    // 已授权/已看房展示授权价，且支持再次评估（对齐 admin CurrentEvalPriceSection 口径）
    const approved = ADJUSTABLE_STATUSES.indexOf(item.status) >= 0;
    this.setData({
      missing: false,
      canAdjust: approved,
      statusTagText: meta.text,
      statusTagClass: meta.cls,
      community_name: item.community_name,
      district: item.district || "",
      paramGrid: [
        { label: "建筑面积", value: item.area != null ? `${item.area}㎡` : "—" },
        { label: "户型", value: item.layout || "—" },
        { label: "朝向", value: item.orientation || "—" },
        { label: "楼层", value: item.floor_info || "—" },
        { label: "区域", value: item.district || "—" },
      ],
      expectedPrice: item.expected_price,
      hasPrice,
      priceText: hasPrice ? `${item.expected_price}` : "—",
      hasEvalPrice: approved && item.eval_price != null,
      evalPriceText: item.eval_price != null ? `${item.eval_price}` : "",
      images: (item.images || []).map((u) => resolveImageUrl(u, { width: 480 })),
      remarks: item.remarks || "",
      auditTimeText: formatDate(item.audit_time, true),
      sourceText: item.source === "customer_share" ? "客户分享" : "员工直录",
    });
  },

  /** 拉取跟进记录（viewMode）：失败静默置 loaded，由空态文案承接. */
  async fetchFollowups() {
    try {
      const list = await request<PublicFollowupItem[]>({
        url: `/public/leads/my/acquired/${this.data.leadId}/follow-ups`,
      });
      this.setData({
        followups: list.map((fu) => ({
          id: fu.id,
          methodText: FOLLOWUP_METHOD_TEXT[fu.method] || fu.method,
          content: fu.content,
          timeText: formatDate(fu.followed_at, true),
        })),
        followupsLoaded: true,
      });
    } catch {
      this.setData({ followupsLoaded: true });
    }
  },

  /** 拉取评估历史（viewMode，倒序）：失败静默置 loaded，由空态文案承接. */
  async fetchEvalHistories() {
    try {
      const list = await request<EvalHistoryItem[]>({
        url: `/public/leads/my/acquired/${this.data.leadId}/evaluations`,
      });
      this.setData({
        evalHistories: list.map((rec, index) => ({
          id: rec.id,
          priceText: `${rec.eval_price}`,
          remarkText: rec.remark || "",
          timeText: formatDate(rec.evaluated_at, true),
          isCurrent: index === 0,
        })),
        evalHistoriesLoaded: true,
      });
    } catch {
      this.setData({ evalHistoriesLoaded: true });
    }
  },

  onPreviewImage(e: WechatMiniprogram.BaseEvent) {
    const current = e.currentTarget.dataset.src as string;
    wx.previewImage({ current, urls: this.data.images });
  },

  /**
   * 小区行情分析入口（手机号门槛，预检模式对齐 valuation/detail）：
   * - 已绑定手机号 → 直接进入分析页；
   * - 未绑定 → 暂存小区名并弹出 phone-bind-modal，绑定成功后进入；
   * - 请求失败 → 提示需登录；分析数据不做预取，空态/错误态由目标页承接.
   */
  async onTapCommunityAnalysis() {
    const communityName = this.data.community_name;
    if (!communityName) {
      return;
    }
    try {
      const me = await request<PublicUserInfo>({ url: "/public/auth/me" });
      if (me.phone) {
        this.enterCommunityAnalysis(communityName);
        return;
      }
      this.setData({ pendingCommunityName: communityName });
      const modal = this.selectComponent("#phoneModal") as unknown as PhoneBindModalInstance | null;
      if (modal && typeof modal.show === "function") {
        modal.show();
      }
    } catch {
      wx.showToast({ title: "请先登录后查看", icon: "none" });
    }
  },

  /** 进入真实模式的小区数据分析页（携带小区名；from=authorize 用于分析页展示「查看房源明细」入口，仅员工侧入口显示）. */
  enterCommunityAnalysis(name: string) {
    wx.navigateTo({
      url:
        "/pages/community-analysis/index/index?mode=real&community_name=" +
        encodeURIComponent(name) +
        "&from=authorize",
    });
  },

  /** 手机号绑定成功：进入先前暂存的小区分析. */
  onPhoneModalBound() {
    wx.showToast({ title: "手机号绑定成功", icon: "success" });
    const name = this.data.pendingCommunityName || this.data.community_name;
    this.enterCommunityAnalysis(name);
  },

  /** 用户在合并确认视图选「前往绑定已有账号」：跳转 bind-account 页. */
  onPhoneModalGoBindAccount() {
    wx.navigateTo({ url: "/pages/bind-account/index/index" });
  },

  /** 确认按钮主文案：再次评估面板为「确认调整」，其余为「确认授权」. */
  confirmVerb(): string {
    return this.data.panelMode === "adjust" ? "确认调整" : "确认授权";
  },

  openPanel(e: WechatMiniprogram.BaseEvent) {
    const mode = e.currentTarget.dataset.mode as PanelMode;
    if (mode !== "approve" && mode !== "reject" && mode !== "lost") {
      return;
    }
    this.setData({
      panelMode: mode,
      formError: "",
      remark: "",
      remarkLen: 0,
      evalPrice: "",
      diffType: "",
      diffValue: "",
      canConfirm: false,
      confirmText: "确认授权",
    });
  },

  /** 再次评估面板（viewMode 操作栏入口）：复用 approve 表单交互，文案与端点不同. */
  openAdjustPanel() {
    if (!this.data.canAdjust) {
      return;
    }
    this.setData({
      panelMode: "adjust",
      formError: "",
      remark: "",
      remarkLen: 0,
      evalPrice: "",
      diffType: "",
      diffValue: "",
      canConfirm: false,
      confirmText: "确认调整",
      focusedField: "",
    });
  },

  closePanel() {
    if (this.data.submitting) {
      return;
    }
    this.setData({ panelMode: "", formError: "", focusedField: "" });
  },

  onFocusField(e: WechatMiniprogram.BaseEvent) {
    this.setData({ focusedField: e.currentTarget.dataset.field as string });
  },

  onBlurField() {
    this.setData({ focusedField: "" });
  },

  onPriceInput(e: WechatMiniprogram.Input) {
    const value = (e.detail.value || "").trim();
    const { type, value: diffValue } = diffOf(value, this.data.expectedPrice);
    const valid = isValidEvalPrice(value);
    const verb = this.confirmVerb();
    this.setData({
      evalPrice: value,
      diffType: type,
      diffValue,
      canConfirm: valid,
      confirmText: valid ? `${verb} ¥${value} 万` : verb,
      formError: "",
    });
  },

  onRemarkInput(e: WechatMiniprogram.Input) {
    const remark = e.detail.value || "";
    this.setData({ remark, remarkLen: remark.length, formError: "" });
  },

  submitAuthorize() {
    const mode = this.data.panelMode;
    if (!mode || this.data.submitting) {
      return;
    }
    // approve/adjust 均为录价动作：评估价无效时确认按钮禁用（设计稿口径）
    if ((mode === "approve" || mode === "adjust") && !this.data.canConfirm) {
      return;
    }
    const maxRemark = mode === "approve" || mode === "adjust" ? MAX_REMARK_APPROVE : MAX_REMARK;
    if (this.data.remark.length > maxRemark) {
      this.setData({ formError: `内容最多 ${maxRemark} 字` });
      return;
    }
    void this.doSubmit(mode);
  },

  async doSubmit(action: SubmitAction) {
    this.setData({ submitting: true, formError: "" });
    try {
      if (action === "adjust") {
        // 再次评估：追加评估历史 + 刷 eval_price，不改状态（语义对齐 admin「调整评估价」）
        const body: components["schemas"]["LeadEvalHistoryCreate"] = {
          eval_price: Number(this.data.evalPrice),
          ...(this.data.remark ? { remark: this.data.remark } : {}),
        };
        await request<unknown>({
          url: `/public/leads/my/acquired/${this.data.leadId}/evaluations`,
          method: "POST",
          data: body,
        });
        wx.showToast({ title: "评估价已更新", icon: "success" });
        // 当前价已变化：失效角标缓存，触发工作台 onShow 静默刷新双段
        invalidatePendingAssessmentCount();
        setTimeout(() => wx.navigateBack(), 600);
        return;
      }
      const body: components["schemas"]["LeadAssessmentAuthorizeRequest"] = {
        action,
        ...(action === "approve" ? { eval_price: Number(this.data.evalPrice) } : {}),
        ...(this.data.remark ? { remark: this.data.remark } : {}),
      };
      await request<AuthorizeResponse>({
        url: `/public/leads/my/acquired/${this.data.leadId}/authorize-assessment`,
        method: "POST",
        data: body,
      });
      const toastText = action === "approve" ? "已批准约看" : action === "reject" ? "已放弃该线索" : "已标记他司成交";
      wx.showToast({ title: toastText, icon: "success" });
      // 待办数已变化：失效角标缓存，触发工作台 onShow 静默刷新双段
      invalidatePendingAssessmentCount();
      setTimeout(() => wx.navigateBack(), 600);
    } catch (err) {
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      const errBody = (err as { body?: { message?: string } | undefined }).body;
      if (statusCode === 409) {
        // 幂等/状态防护：弹窗引导返回并刷新列表（默认=已被处理，adjust=状态不可调整）
        const copy = action === "adjust" ? CONFLICT_COPY.adjust : CONFLICT_COPY.default;
        this.setData({ panelMode: "", showConflict: true, conflictTitle: copy.title, conflictDesc: copy.desc });
        return;
      }
      const msg =
        statusCode === 403
          ? errBody?.message || "仅管理员/运营人员可执行此操作"
          : statusCode === 422
            ? errBody?.message || "表单校验未通过，请检查输入"
            : errBody?.message || "提交失败，请重试";
      this.setData({ formError: msg });
    } finally {
      this.setData({ submitting: false });
    }
  },

  /** 409 冲突弹窗「返回并刷新」：工作台 onShow 静默刷新双段. */
  onConflictBack() {
    this.setData({ showConflict: false });
    invalidatePendingAssessmentCount();
    wx.navigateBack();
  },

  onBack() {
    wx.navigateBack();
  },
});
