/**
 * 「评估授权」页（员工侧）.
 *
 * 三种模式：
 * - 待评估授权（默认）：数据源为工作台列表经 EventChannel 传递的原始队列项（leadDetail 事件），
 *   不新增详情端点；冷启动无数据时展示缺失态引导返回列表。
 * - 已处理只读详情（?mode=view）：工作台已处理卡进入，展示授权结果、评估历史与跟进记录
 *   （GET /public/leads/my/acquired/{id}/follow-ups、GET .../evaluations），
 *   参数宫格补第 6 格「最近跟进」（last_follow_up_at ?? audit_time）。
 * - 再次评估（viewMode 内 openAdjustPanel）：对 pending_visit/visited 线索调整评估价，
 *   语义对齐 admin CurrentEvalPriceSection「调整评估价」，
 *   提交 POST /public/leads/my/acquired/{id}/evaluations（追加评估历史 + 刷 eval_price，不改状态）。
 * - 登记跟进（viewMode 内 openFollowupPanel，跟进记录区块头「＋ 登记」与底部「更新跟进」共用）：
 *   提交 POST /public/leads/my/acquired/{id}/follow-ups（写 lead_followups + 刷 last_follow_up_at）。
 * - viewMode 底部操作栏：左「标记为他司成交」（复用 lost 面板，authorize-assessment 放开至
 *   pending_visit/visited）/ 右「更新跟进」。
 * 待评估模式三动作（approve/reject/lost）语义对齐 admin PendingAssessmentPanel，
 * 单端点原子提交（POST /public/leads/my/acquired/{id}/authorize-assessment）：
 * - approve：评估价必填（>0、≤999 万、≤2 位小数）+ 意见选填 ≤200 字，
 *   实时差值提示（低报绿 / 高报琥珀 / 确认按钮禁用与动态金额文案）；
 * - reject / lost：原因选填 ≤500 字（对齐 admin 选填语义）。
 * 409 幂等冲突弹窗引导返回并刷新列表（默认/adjust/lost/followup 模式文案区分）。
 * 「小区行情分析」入口复用 valuation/detail 的 GET /public/auth/me 预检模式
 * （未登录 toast 引导 / 未绑手机弹绑定框），通过后跳转既有分析页。
 * 视觉遵循 Steep 设计体系（eval-auth-hifi.html 屏C）一比一还原。
 *
 * 【不拆分说明】本文件 > 500 行：页面承载「默认授权 / viewMode 详情 / adjust / lost /
 * followup 四类半屏面板」的一体化交互与状态机，面板间共享表单校验与提交管线；
 * 若按面板拆分会割裂 SubmitAction 分发与 409 冲突文案分档逻辑，本轮 spec 亦明确
 * 不抽公共组件（卡片/面板样式各页同源存放），故保持单文件。
 */
import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";
import { resolveImageUrl } from "../../../utils/url";
import { formatDate } from "../../../utils/valuation-display";
import { SCORE_ANCHORS, SCORE_LABELS, daysSay, daysTier, daysTierLabel } from "../../../utils/lead-verdict";

type QueueItem = components["schemas"]["PendingAssessmentQueueItem"];
type HandledItem = components["schemas"]["HandledItem"];
type AuthorizeResponse = components["schemas"]["LeadAssessmentAuthorizeResponse"];
type PublicUserInfo = components["schemas"]["PublicUserInfo"];
type PublicFollowupItem = components["schemas"]["PublicFollowupItem"];
type EvalHistoryItem = components["schemas"]["LeadEvalHistoryResponse"];

type AuthorizeAction = "approve" | "reject" | "lost";

/** 提交动作：三动作授权 + 再次评估（adjust 走独立端点）+ 登记跟进（followup 走新端点）. */
type SubmitAction = AuthorizeAction | "adjust" | "followup";

/** 面板模式：空串表示全部关闭. */
type PanelMode = "" | "approve" | "reject" | "lost" | "adjust" | "followup";

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

/** 冲突弹窗（409）文案：默认 / 再次评估 / 标记他司成交 / 登记跟进 四档区分. */
const CONFLICT_COPY = {
  default: {
    title: "该线索已被完成评估",
    desc: "同事刚刚在后台处理了这条线索，当前数据已过期。点击返回将自动刷新工作台列表。",
  },
  adjust: {
    title: "线索状态已变化",
    desc: "该线索当前状态不支持调整评估价，返回后将自动刷新工作台列表。",
  },
  lost: {
    title: "线索状态已变化",
    desc: "该线索当前状态不可标记为他司成交，返回后将自动刷新工作台列表。",
  },
  followup: {
    title: "线索状态已变化",
    desc: "该线索已关闭，无法登记跟进，返回后将自动刷新工作台列表。",
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
  /** 可再次评估（viewMode 且状态为 pending_visit/visited 时在评估历史区块头展示「调整评估价」）. */
  canAdjust: boolean;
  /** 可登记跟进（viewMode 且状态为 pending_visit/visited，与 canAdjust 同口径）. */
  canFollowup: boolean;
  /** Hero 状态标签（待评估=琥珀；viewMode 按流转状态着色）. */
  statusTagText: string;
  statusTagClass: string;
  // 线索信息全景
  community_name: string;
  district: string;
  /** 线索提交人文案「昵称 · 脱敏手机号」，缺失为空串（隐藏）. */
  submitterText: string;
  /** 参数宫格（建筑面积/户型/朝向/楼层/区域）. */
  paramGrid: { label: string; value: string }[];
  /** 面积(㎡)，均价折算用，缺失为 null. */
  area: number | null;
  /** 业主报价（万），缺失为 null（差值提示用）. */
  expectedPrice: number | null;
  hasPrice: boolean;
  priceText: string;
  /** 业主报价折算单价文案「单价 ≈ 12,500 元/㎡」，报价或面积缺失为空串（隐藏）. */
  priceUnitText: string;
  /** 授权评估价（viewMode：approved 有值，reject/lost 为空）. */
  hasEvalPrice: boolean;
  evalPriceText: string;
  images: string[];
  remarks: string;
  created_at: string;
  /** 处理时间（viewMode）. */
  auditTimeText: string;
  /** 最近跟进时间（viewMode 参数宫格第 6 格：last_follow_up_at ?? audit_time）. */
  recentFollowupText: string;
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
  /** 房源条件分（1-5，0 = 未选） */
  score: number;
  /** 评分短标签（已选时展示） */
  scoreWord: string;
  /** 评分锚点提示（已选时展示当前档位锚点，未选时展示速查） */
  scoreHint: string;
  /** 五档速查（渲染星块用） */
  scoreOptions: { v: number; label: string }[];
  /** 装修后可售天数（空串 = 未填） */
  saleDays: string;
  /** 天数档位 key（rush/normal/slowish/slow；空串 = 未填） */
  dayTier: string;
  /** 天数档位短词 */
  dayTierWord: string;
  /** 天数展示文案（约 N 个月） */
  daySayText: string;
  /** 快捷档位 chips（点选写入代表值） */
  quickDays: { d: number; label: string }[];
  remark: string;
  remarkLen: number;
  diffType: DiffType;
  diffValue: string;
  diffDefault: string;
  /** 输入评估价实时折算单价文案（元/㎡），无效输入或面积缺失为空串（隐藏）. */
  evalUnitText: string;
  focusedField: string;
  canConfirm: boolean;
  confirmText: string;
  formError: string;
  submitting: boolean;
  // 评估结论分享（viewMode）：授权完成后在工作台可直接转发评估结果卡片给客户
  /** 最新评估的房源条件分（无则 null） */
  shareConditionScore: number | null;
  /** 最新评估的装修后可售天数（无则 null） */
  shareExpectedSaleDays: number | null;
  /** 是否可分享评估结果（有授权价且非终态 rejected/lost_to_competitor） */
  canShareVerdict: boolean;
  // 跟进面板（followup）
  /** 跟进方式（phone/wechat/face/visit，默认电话）. */
  followupMethod: string;
  /** 跟进内容（1-500 字，对齐后端 PublicFollowupCreate）. */
  followupContent: string;
  followupLen: number;
  /** 409 幂等冲突弹窗（四档文案区分）. */
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
  onScoreTap(e: WechatMiniprogram.BaseEvent): void;
  onSaleDaysInput(e: WechatMiniprogram.Input): void;
  onQuickDayTap(e: WechatMiniprogram.BaseEvent): void;
  syncVerdictState(): void;
  onRemarkInput(e: WechatMiniprogram.Input): void;
  submitAuthorize(): void;
  doSubmit(action: SubmitAction): Promise<void>;
  /** 确认按钮主文案（模板事件外复用）：adjust=「确认调整」，其余=「确认授权」. */
  confirmVerb(): string;
  openAdjustPanel(): void;
  /** 打开跟进半屏面板（viewMode 底部「更新跟进」与跟进记录区块头「＋ 登记」共用）. */
  openFollowupPanel(): void;
  onFollowupMethodTap(e: WechatMiniprogram.BaseEvent): void;
  onFollowupContentInput(e: WechatMiniprogram.Input): void;
  submitFollowup(): void;
  onConflictBack(): void;
  onBack(): void;
  /** approve 成功后就地切只读详情（viewMode），不返回工作台 */
  enterViewModeAfterApprove(): void;
  /** 转发评估结果卡片给客户（open-type=share 触发；落地 pages/valuation/detail） */
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent;
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

/** 千分位格式化整数. */
function thousands(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * 折算单价完整文案「单价 ≈ 12,500 元/㎡」（四舍五入千分位）：报价(万)×10000 ÷ 面积(㎡).
 * 报价或面积缺失、面积 ≤0 视为无效，返回空串.
 */
function unitPriceText(priceWan: number | null | undefined, area: number | null | undefined): string {
  if (priceWan == null || area == null || area <= 0) {
    return "";
  }
  return `单价 ≈ ${thousands(Math.round((priceWan * 10000) / area))} 元/㎡`;
}

/** 提交人文案：「昵称 · 138****1234」，缺失项降级，均无返回空串. */
function submitterTextOf(nickname: string | null | undefined, phone: string | null | undefined): string {
  const parts: string[] = [];
  if (nickname) {
    parts.push(nickname);
  }
  if (phone) {
    parts.push(phone);
  }
  return parts.join(" · ");
}

Page<PageData, PageCustom>({
  data: {
    leadId: "",
    // 冷启动默认缺失态：EventChannel 数据到达（applyItem/applyHandledItem）后才切换为完整内容
    missing: true,
    viewMode: false,
    canAdjust: false,
    canFollowup: false,
    statusTagText: "● 待评估",
    statusTagClass: "amber",
    community_name: "",
    district: "",
    submitterText: "",
    paramGrid: [],
    area: null,
    expectedPrice: null,
    hasPrice: false,
    priceText: "—",
    priceUnitText: "",
    hasEvalPrice: false,
    evalPriceText: "",
    images: [],
    remarks: "",
    created_at: "",
    auditTimeText: "",
    recentFollowupText: "",
    sourceText: "",
    followups: [],
    followupsLoaded: false,
    evalHistories: [],
    evalHistoriesLoaded: false,
    pendingCommunityName: "",
    panelMode: "",
    evalPrice: "",
    // 房源条件分与可售周期（评估反馈迭代：三项齐全才可提交）
    score: 0,
    scoreWord: "",
    scoreHint: "",
    scoreOptions: [
      { v: 1, label: "难售" },
      { v: 2, label: "偏弱" },
      { v: 3, label: "一般" },
      { v: 4, label: "良好" },
      { v: 5, label: "优质" },
    ],
    saleDays: "",
    dayTier: "",
    dayTierWord: "",
    daySayText: "",
    quickDays: [
      { d: 20, label: "30 天内" },
      { d: 45, label: "1–2 个月" },
      { d: 75, label: "2–3 个月" },
      { d: 110, label: "3 个月+" },
    ],
    remark: "",
    remarkLen: 0,
    diffType: "",
    diffValue: "",
    diffDefault: "",
    evalUnitText: "",
    focusedField: "",
    canConfirm: false,
    confirmText: "确认授权",
    formError: "",
    submitting: false,
    shareConditionScore: null,
    shareExpectedSaleDays: null,
    canShareVerdict: false,
    followupMethod: "phone",
    followupContent: "",
    followupLen: 0,
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
      submitterText: submitterTextOf(item.submitter_nickname, item.submitter_phone),
      area: item.area ?? null,
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
      priceUnitText: hasPrice ? unitPriceText(item.expected_price, item.area ?? null) : "",
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

  /** 已处理线索只读详情：状态标签 + 授权价/处理时间 + 再次评估/跟进入口 + 评估历史. */
  applyHandledItem(item: HandledItem) {
    const hasPrice = item.expected_price != null;
    const meta = VIEW_STATUS_META[item.status] ?? { text: item.status_display, cls: "gray" };
    // 已授权/已看房展示授权价，且支持再次评估与登记跟进（对齐 admin 口径）
    const approved = ADJUSTABLE_STATUSES.indexOf(item.status) >= 0;
    // 分享闸门：有授权价且非终态（rejected/lost_to_competitor 不分享负面结论）
    const terminal = item.status === "rejected" || item.status === "lost_to_competitor";
    const hasVerdict = approved && item.eval_price != null;
    this.setData({
      missing: false,
      canAdjust: approved,
      canFollowup: approved,
      shareConditionScore: item.condition_score ?? null,
      shareExpectedSaleDays: item.expected_sale_days ?? null,
      canShareVerdict: hasVerdict && !terminal,
      statusTagText: meta.text,
      statusTagClass: meta.cls,
      community_name: item.community_name,
      district: item.district || "",
      submitterText: submitterTextOf(item.submitter_nickname, item.submitter_phone),
      area: item.area ?? null,
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
      priceUnitText: hasPrice ? unitPriceText(item.expected_price, item.area ?? null) : "",
      hasEvalPrice: approved && item.eval_price != null,
      evalPriceText: item.eval_price != null ? `${item.eval_price}` : "",
      images: (item.images || []).map((u) => resolveImageUrl(u, { width: 480 })),
      remarks: item.remarks || "",
      auditTimeText: formatDate(item.audit_time, true),
      // 「最近跟进」宫格：无跟进回退处理时间
      recentFollowupText: formatDate(item.last_follow_up_at || item.audit_time, true),
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
      score: 0,
      scoreWord: "",
      scoreHint: "",
      saleDays: "",
      dayTier: "",
      dayTierWord: "",
      daySayText: "",
      diffType: "",
      diffValue: "",
      evalUnitText: "",
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
      score: 0,
      scoreWord: "",
      scoreHint: "",
      saleDays: "",
      dayTier: "",
      dayTierWord: "",
      daySayText: "",
      diffType: "",
      diffValue: "",
      evalUnitText: "",
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

  /** 跟进半屏面板（viewMode）：跟进方式默认电话，内容清空. */
  openFollowupPanel() {
    if (!this.data.canFollowup) {
      return;
    }
    this.setData({
      panelMode: "followup",
      formError: "",
      followupMethod: "phone",
      followupContent: "",
      followupLen: 0,
      focusedField: "",
    });
  },

  /** 切换跟进方式 chip（phone/wechat/face/visit）. */
  onFollowupMethodTap(e: WechatMiniprogram.BaseEvent) {
    const method = e.currentTarget.dataset.method as string;
    if (!method) {
      return;
    }
    this.setData({ followupMethod: method });
  },

  onFollowupContentInput(e: WechatMiniprogram.Input) {
    const content = e.detail.value || "";
    this.setData({ followupContent: content, followupLen: content.length, formError: "" });
  },

  /** 登记跟进提交：内容 1-500 字校验 → POST 新端点 → toast → navigateBack. */
  submitFollowup() {
    if (this.data.submitting) {
      return;
    }
    const content = this.data.followupContent.trim();
    if (!content) {
      this.setData({ formError: "请填写跟进内容" });
      return;
    }
    if (content.length > MAX_REMARK) {
      this.setData({ formError: `内容最多 ${MAX_REMARK} 字` });
      return;
    }
    this.setData({ followupContent: content, followupLen: content.length });
    void this.doSubmit("followup");
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
      // 实时折算单价（元/㎡）：仅有效输入且面积可用时展示
      evalUnitText: valid ? unitPriceText(Number(value), this.data.area) : "",
      formError: "",
    });
    // 价格不再单独决定可提交：由 syncVerdictState 统一按「三项齐全」判定
    this.syncVerdictState();
    if (!valid) {
      this.setData({ canConfirm: false, confirmText: verb });
    }
  },

  /** 点选房源条件分（1-5 单一综合分，Q1 口径：评分必填）. */
  onScoreTap(e: WechatMiniprogram.BaseEvent) {
    const v = Number(e.currentTarget.dataset.v);
    if (!v || v < 1 || v > 5) {
      return;
    }
    this.setData({ score: v, formError: "" });
    this.syncVerdictState();
  },

  /** 装修后可售天数输入（连续值，档位由纯函数派生，不入库）. */
  onSaleDaysInput(e: WechatMiniprogram.Input) {
    this.setData({ saleDays: (e.detail.value || "").trim(), formError: "" });
    this.syncVerdictState();
  },

  /** 快捷档位 chips：直接写入代表值（点了仍可改数字 —— chips 是入口不是约束）. */
  onQuickDayTap(e: WechatMiniprogram.BaseEvent) {
    const d = Number(e.currentTarget.dataset.d);
    if (!d) {
      return;
    }
    this.setData({ saleDays: String(d), formError: "" });
    this.syncVerdictState();
  },

  /**
   * 同步评分/天数派生态与提交闸门.
   *
   * 提交闸门（approve/adjust）：评估价 + 评分 + 天数**三项齐全**才允许提交 ——
   * 不允许再产出「只有价格」的评估反馈（这是本迭代的核心动因）。
   */
  syncVerdictState() {
    const { score, saleDays, evalPrice } = this.data;
    const days = saleDays === "" ? null : Number(saleDays);
    const tier = daysTier(days);
    const scoreWord = score >= 1 && score <= 5 ? SCORE_LABELS[score as 1 | 2 | 3 | 4 | 5] : "";
    const scoreHint =
      score >= 1 && score <= 5
        ? `${score} 分 · ${scoreWord} —— ${SCORE_ANCHORS[score as 1 | 2 | 3 | 4 | 5]}`
        : "1 难售 · 2 偏弱 · 3 一般 · 4 良好 · 5 优质";

    const priceValid = isValidEvalPrice(evalPrice);
    const verdictValid = score >= 1 && score <= 5 && days != null && days >= 1 && days <= 365;
    const valid = priceValid && verdictValid;
    const verb = this.confirmVerb();

    this.setData({
      scoreWord,
      scoreHint,
      dayTier: tier || "",
      dayTierWord: tier ? daysTierLabel(days) || "" : "",
      daySayText: days != null ? daysSay(days) : "",
      canConfirm: valid,
      confirmText: valid ? `${verb} ¥${evalPrice} 万` : verb,
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

  /**
   * approve 成功后就地切换为只读详情（viewMode），不返回工作台。
   *
   * 为什么用原地切换而非 redirectTo：本页持有 EventChannel 传入的全景数据，
   * redirectTo 会丢弃且闪一下白屏；原地 setData 即可保留参数宫格、图片、备注等既有内容，
   * 同时把底部操作栏换成「分享给客户」+「更新跟进」。
   *
   * 金额与结论取值：优先后端已返回的 eval_price；评分/周期来自刚才表单提交的值
   * （approve 成功后本地就是最新真值，无需再发一次详情请求）。
   */
  enterViewModeAfterApprove() {
    const meta = VIEW_STATUS_META.pending_visit ?? { text: "待看房", cls: "green" };
    const price = Number(this.data.evalPrice);
    this.setData({
      panelMode: "",
      viewMode: true,
      canAdjust: true,
      canFollowup: true,
      statusTagText: meta.text,
      statusTagClass: meta.cls,
      hasEvalPrice: Number.isFinite(price) && price > 0,
      evalPriceText: Number.isFinite(price) && price > 0 ? `${price}` : "",
      shareConditionScore: this.data.score >= 1 ? this.data.score : null,
      shareExpectedSaleDays: this.data.saleDays ? Number(this.data.saleDays) : null,
      canShareVerdict: Number.isFinite(price) && price > 0,
      auditTimeText: formatDate(new Date().toISOString(), true),
    });
    // 刷新双段历史（评估历史要有刚才那条）与跟进记录
    void this.fetchEvalHistories();
    void this.fetchFollowups();
  },

  /**
   * 转发评估结果卡片给客户（open-type=share 触发）。
   *
   * 落地页 = pages/valuation/detail（需求指定）。该页仅线索创建人可打开：
   * 后端 GET /public/leads/{id} 硬校验 creator_id == 当前用户，其他人 403「无权查看」。
   * 因此分享的对象**只能是提交这条评估的客户本人**（员工互转会看到无权提示）。
   *
   * 标题只放客户关心的三件事：小区 + 评估价 + 可售周期，不放内部评分术语。
   */
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    const price = this.data.evalPriceText;
    const score = this.data.shareConditionScore;
    const days = this.data.shareExpectedSaleDays;
    const parts: string[] = [];
    if (price) {
      parts.push(`评估价 ${price} 万`);
    }
    if (score != null && score >= 1 && score <= 5) {
      parts.push(`房源条件${SCORE_LABELS[score as 1 | 2 | 3 | 4 | 5]}`);
    }
    if (days != null) {
      parts.push(`装修后约 ${days} 天可售`);
    }
    const title = parts.length > 0 ? `${this.data.community_name} · ${parts.join(" · ")}` : `${this.data.community_name} 评估结果`;
    return {
      title,
      path: `/pages/valuation/detail/index?id=${this.data.leadId}`,
    };
  },

  async doSubmit(action: SubmitAction) {
    this.setData({ submitting: true, formError: "" });
    try {
      if (action === "adjust") {
        // 再次评估：追加评估历史 + 刷 eval_price，不改状态（语义对齐 admin「调整评估价」）
        const body: components["schemas"]["LeadEvalHistoryCreate"] = {
          eval_price: Number(this.data.evalPrice),
          condition_score: this.data.score,
          expected_sale_days: Number(this.data.saleDays),
          ...(this.data.remark ? { remark: this.data.remark } : {}),
        };
        await request<unknown>({
          url: `/public/leads/my/acquired/${this.data.leadId}/evaluations`,
          method: "POST",
          data: body,
        });
        wx.showToast({ title: "评估价已更新", icon: "success" });
        setTimeout(() => wx.navigateBack(), 600);
        return;
      }
      if (action === "followup") {
        // 登记跟进：写 lead_followups 并同步刷 last_follow_up_at（服务端）
        const body: components["schemas"]["PublicFollowupCreate"] = {
          method: this.data.followupMethod as components["schemas"]["PublicFollowupCreate"]["method"],
          content: this.data.followupContent,
        };
        await request<unknown>({
          url: `/public/leads/my/acquired/${this.data.leadId}/follow-ups`,
          method: "POST",
          data: body,
        });
        wx.showToast({ title: "已登记跟进", icon: "success" });
        setTimeout(() => wx.navigateBack(), 600);
        return;
      }
      const body: components["schemas"]["LeadAssessmentAuthorizeRequest"] = {
        action,
        ...(action === "approve"
          ? {
              eval_price: Number(this.data.evalPrice),
              condition_score: this.data.score,
              expected_sale_days: Number(this.data.saleDays),
            }
          : {}),
        ...(this.data.remark ? { remark: this.data.remark } : {}),
      };
      await request<AuthorizeResponse>({
        url: `/public/leads/my/acquired/${this.data.leadId}/authorize-assessment`,
        method: "POST",
        data: body,
      });
      const toastText = action === "approve" ? "已批准约看" : action === "reject" ? "已放弃该线索" : "已标记他司成交";
      wx.showToast({ title: toastText, icon: "success" });
      // approve 成功后**不返回工作台**，原地切到只读详情（viewMode）：
      // 1) 员工能立刻看到刚出具的评估结论（评分/周期/价格）；
      // 2) 页面出现「分享给客户」按钮，把结论卡片发给客户 —— 需求要求的闭环出口。
      // reject/lost 无结论可看，仍返回工作台。
      if (action === "approve") {
        setTimeout(() => this.enterViewModeAfterApprove(), 600);
        return;
      }
      setTimeout(() => wx.navigateBack(), 600);
    } catch (err) {
      const statusCode = (err as { statusCode?: number } | undefined)?.statusCode;
      const errBody = (err as { body?: { message?: string } | undefined }).body;
      if (statusCode === 409) {
        // 幂等/状态防护：按动作选择对应冲突文案，弹窗引导返回并刷新列表
        const copy =
          action === "adjust"
            ? CONFLICT_COPY.adjust
            : action === "lost"
              ? CONFLICT_COPY.lost
              : action === "followup"
                ? CONFLICT_COPY.followup
                : CONFLICT_COPY.default;
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
    wx.navigateBack();
  },

  onBack() {
    wx.navigateBack();
  },
});
