/**
 * 我的客户 · 客户详情页（spec: add-miniapp-my-customers Task 9）.
 *
 * 页面职责（自上而下，对照设计稿 03/04 屏）：
 * - 状态 hero 卡：统一状态标签 + 留资时间 + 「状态×模块」建议文案
 * - 手机号深色卡：查看完整号码 → 拨号（缓存后二次点击直接拨打；
 *   招募线查看即 new→contacted 隐式流转，按返回状态就地刷新页面状态区）
 * - 业务信息栅格：按模块差异化字段（估价/预约/房源单/招募）
 * - 归因链路时间线：share/visit/deep_view/lead_submit，未发生节点灰点
 * - 状态流转卡：主链路 4 节点进度条 + 淘汰旁路说明 + 按统一流转矩阵生成的
 *   操作按钮（booking 无状态机仅提示；终态显示终态说明）
 * - 跟进记录：输入（≤500 字）+ 添加 → 倒序时间线
 * - 底部动作面板：目标状态单选（推荐 tag）+ eliminated 原因必填 + 备注选填
 *   → PUT 流转，成功后就地刷新详情与跟进；409/422 toast 展示后端 message
 *
 * 入口参数（与列表页约定）：module（valuation|booking|sheet|recruit）、
 * id（lead_id）、openFlow=1（可选，详情加载完成后自动打开流转面板）。
 * 404/401/403/参数缺失：空态兜底 + 返回，不清登录态、不报错误弹窗。
 *
 * 常量/展示构建纯函数拆分至同目录 constants.ts（控制单文件行数）。
 */
import { request } from "../../../utils/request";
import type { HttpResponseError } from "../../../utils/request";
import { getAccessToken, getCAccessToken } from "../../../utils/token";
import { formatLeadTime } from "../../../utils/recruit-logic";
import {
  ELIMINATE_REASONS,
  HTTP_FORBIDDEN,
  HTTP_NOT_FOUND,
  HTTP_UNAUTHORIZED,
  INFO_CARD_TITLES,
  MODULE_LABELS,
  STATUS_META,
  TERMINAL_NOTES,
  buildFlowActions,
  buildFlowNodes,
  buildFlowOptions,
  buildInfoItems,
  buildTimeline,
  extractErrorMessage,
  heroCopy,
  toFollowUpDisplay,
} from "./constants";
import type {
  CustomerDetail,
  FlowActionDisplay,
  FlowNodeDisplay,
  FlowOptionDisplay,
  FollowUpDisplay,
  FollowUpItem,
  GrowthModule,
  InfoItem,
  PhoneResponse,
  StatusUpdateResponse,
  TimelineDisplay,
  UnifiedLeadStatus,
} from "./constants";

interface PageData {
  loading: boolean;
  /** 404/401/403/参数缺失空态. */
  notFound: boolean;
  module: GrowthModule;
  moduleLabel: string;
  leadId: string;
  /** 当前统一状态原始值（phone 就地刷新比对用）. */
  statusValue: string;
  statusText: string;
  statusClass: string;
  createdTimeText: string;
  heroTitle: string;
  heroSub: string;
  phoneDisplay: string;
  hasPhone: boolean;
  phoneNote: string;
  infoCardTitle: string;
  infoItems: InfoItem[];
  timelineItems: TimelineDisplay[];
  flowNodes: FlowNodeDisplay[];
  flowActions: FlowActionDisplay[];
  terminalNote: string;
  /** 底部流转面板开合. */
  flowOpen: boolean;
  flowOptions: FlowOptionDisplay[];
  /** 面板目标状态单选当前值；空串=未选. */
  selectedStatus: string;
  /** 淘汰原因可选项（常量表透出给 wxml）. */
  reasonOptions: { value: string; label: string }[];
  reason: string;
  remark: string;
  submitting: boolean;
  followUpInput: string;
  followUps: FollowUpDisplay[];
  addingFollowUp: boolean;
}

interface PageCustom {
  hasToken(): boolean;
  applyDetail(d: CustomerDetail): void;
  loadDetail(): Promise<void>;
  loadFollowUps(): Promise<void>;
  openFlowPanel(): void;
  dial(phone: string): void;
  onViewPhone(): void;
  onGoRules(): void;
  onGoBack(): void;
  onFlowAction(e: WechatMiniprogram.BaseEvent): void;
  onPickStatus(e: WechatMiniprogram.BaseEvent): void;
  onPickReason(e: WechatMiniprogram.BaseEvent): void;
  onRemarkInput(e: WechatMiniprogram.Input): void;
  onCloseFlow(): void;
  onConfirmFlow(): void;
  onFollowInput(e: WechatMiniprogram.Input): void;
  onAddFollowUp(): void;
  /** openFlow=1 时详情加载完成自动打开面板. */
  openFlowPending?: boolean;
  /** 已查看的完整号码（二次点击直接拨打）. */
  phoneFull?: string;
}

Page<PageData, PageCustom>({
  data: {
    loading: true,
    notFound: false,
    module: "valuation",
    moduleLabel: "估价",
    leadId: "",
    statusValue: "",
    statusText: "",
    statusClass: "",
    createdTimeText: "",
    heroTitle: "",
    heroSub: "",
    phoneDisplay: "",
    hasPhone: false,
    phoneNote: "",
    infoCardTitle: "",
    infoItems: [],
    timelineItems: [],
    flowNodes: [],
    flowActions: [],
    terminalNote: "",
    flowOpen: false,
    flowOptions: [],
    selectedStatus: "",
    reasonOptions: ELIMINATE_REASONS,
    reason: "",
    remark: "",
    submitting: false,
    followUpInput: "",
    followUps: [],
    addingFollowUp: false,
  },

  onLoad(options: Record<string, string | undefined>) {
    const raw = options as Record<string, string | undefined>;
    const module = raw.module as GrowthModule;
    const isValidModule =
      module === "valuation" || module === "booking" || module === "sheet" || module === "recruit";
    if (!isValidModule || !raw.id) {
      // 参数缺失：不发请求，直接空态兜底
      this.setData({ loading: false, notFound: true });
      return;
    }
    this.openFlowPending = raw.openFlow === "1";
    this.setData({ module, moduleLabel: MODULE_LABELS[module], leadId: raw.id });
    if (!this.hasToken()) {
      // 游客：不发请求，空态兜底（同 401 口径，不清登录态）
      this.setData({ loading: false, notFound: true });
      return;
    }
    // 详情与跟进互不依赖，并行加载（消除请求瀑布）
    Promise.all([this.loadDetail(), this.loadFollowUps()]);
  },

  hasToken() {
    return !!getCAccessToken() || !!getAccessToken();
  },

  /** 详情响应 → 页面状态区就地渲染（状态流转/查看号码后的就地刷新复用）. */
  applyDetail(d: CustomerDetail) {
    const status = d.unified_status;
    const meta = STATUS_META[status] ?? { text: status, cls: "stg-out" };
    const hero = heroCopy(status, d.module);
    this.setData({
      statusValue: status,
      statusText: meta.text,
      statusClass: meta.cls,
      heroTitle: hero.title,
      heroSub: hero.sub,
      createdTimeText: formatLeadTime(d.created_at),
      phoneDisplay: d.phone_masked || "未提供",
      hasPhone: !!d.phone_masked,
      phoneNote:
        d.module === "recruit"
          ? "查看完整号码后，新线索将自动流转为已联系；仅归属员工可查看。"
          : "仅归属员工可查看。",
      infoCardTitle: INFO_CARD_TITLES[d.module],
      infoItems: buildInfoItems(d.module, d),
      timelineItems: buildTimeline(d),
      flowNodes: buildFlowNodes(status),
      flowActions: buildFlowActions(status, d.module),
      terminalNote: TERMINAL_NOTES[status],
      loading: false,
      notFound: false,
    });
  },

  /** 加载详情；404/401/403 空态兜底，openFlow=1 首次加载成功后自动打开面板. */
  async loadDetail() {
    const { module, leadId } = this.data;
    if (!leadId) {
      return;
    }
    try {
      const res = await request<CustomerDetail>({
        url: `/public/customers/my/${module}/${encodeURIComponent(leadId)}`,
      });
      this.applyDetail(res);
      if (this.openFlowPending) {
        this.openFlowPending = false;
        this.openFlowPanel();
      }
    } catch (err) {
      const statusCode = (err as HttpResponseError).statusCode;
      if (statusCode === HTTP_NOT_FOUND || statusCode === HTTP_UNAUTHORIZED || statusCode === HTTP_FORBIDDEN) {
        this.setData({ loading: false, notFound: true });
        return;
      }
      this.setData({ loading: false });
      wx.showToast({ title: "加载失败，请重试", icon: "none" });
    }
  },

  /** 跟进记录（倒序）；失败静默（主内容为详情，404/401/403 已由详情兜底）. */
  async loadFollowUps() {
    const { module, leadId } = this.data;
    if (!leadId) {
      return;
    }
    try {
      const res = await request<FollowUpItem[]>({
        url: `/public/customers/my/${module}/${encodeURIComponent(leadId)}/follow-ups`,
      });
      this.setData({ followUps: (res || []).map(toFollowUpDisplay) });
    } catch {
      // 静默
    }
  },

  /** 打开流转面板：选项按当前状态矩阵生成，默认选中首位（推荐位）. */
  openFlowPanel() {
    const options = buildFlowOptions(this.data.statusValue as UnifiedLeadStatus, this.data.module);
    this.setData({
      flowOpen: true,
      flowOptions: options,
      selectedStatus: options.length ? options[0].status : "",
      reason: "",
      remark: "",
    });
  },

  /** 调起系统拨号；用户取消（fail）静默. */
  dial(phone: string) {
    wx.makePhoneCall({
      phoneNumber: phone,
      fail: () => {},
    });
  },

  /**
   * 「查看完整号码」：首次点击拉取完整号码并缓存后拨号；
   * 二次点击直接拨打；返回状态变化（招募 new→contacted）时就地刷新状态区.
   */
  async onViewPhone() {
    if (this.phoneFull) {
      this.dial(this.phoneFull);
      return;
    }
    const { module, leadId } = this.data;
    try {
      const res = await request<PhoneResponse>({
        url: `/public/customers/my/${module}/${encodeURIComponent(leadId)}/phone`,
      });
      if (!res.phone) {
        wx.showToast({ title: "未提供联系方式", icon: "none" });
        return;
      }
      this.phoneFull = res.phone;
      if (res.unified_status !== this.data.statusValue) {
        // 状态发生变化（招募线查看即流转）：就地刷新 hero/进度条/按钮
        this.loadDetail();
      }
      this.dial(res.phone);
    } catch (err) {
      const statusCode = (err as HttpResponseError).statusCode;
      if (statusCode === HTTP_NOT_FOUND || statusCode === HTTP_UNAUTHORIZED || statusCode === HTTP_FORBIDDEN) {
        // 与详情口径一致：静默（详情区已空态兜底）
        return;
      }
      wx.showToast({ title: extractErrorMessage(err, "获取号码失败，请重试"), icon: "none" });
    }
  },

  /** 流转规则页. */
  onGoRules() {
    wx.navigateTo({ url: "/pages/customers/rules/index" });
  },

  /** 空态返回；无上一页（分享/扫码直达）时回「我的」. */
  onGoBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: "/pages/profile/index/index" });
      },
    });
  },

  /** 流转卡操作按钮：打开底部面板（选项在面板打开时按当前状态生成）. */
  onFlowAction(_e: WechatMiniprogram.BaseEvent) {
    this.openFlowPanel();
  },

  /** 面板目标状态单选（重复点击不重置原因/备注）. */
  onPickStatus(e: WechatMiniprogram.BaseEvent) {
    const status = String(e.currentTarget.dataset.status ?? "");
    if (!status || status === this.data.selectedStatus) {
      return;
    }
    this.setData({ selectedStatus: status });
  },

  /** 淘汰原因单选（catchtap 阻断冒泡，不触发外层 onPickStatus）. */
  onPickReason(e: WechatMiniprogram.BaseEvent) {
    const reason = String(e.currentTarget.dataset.reason ?? "");
    if (!reason) {
      return;
    }
    this.setData({ reason });
  },

  onRemarkInput(e: WechatMiniprogram.Input) {
    this.setData({ remark: e.detail.value });
  },

  /** 关闭面板（遮罩点击 / ✕）. */
  onCloseFlow() {
    this.setData({ flowOpen: false });
  },

  /** 确认流转：eliminated 原因必填；成功关面板+toast+就地刷新详情与跟进；409/422 toast 后端 message. */
  async onConfirmFlow() {
    if (this.data.submitting) {
      return;
    }
    const status = this.data.selectedStatus as UnifiedLeadStatus;
    if (!status) {
      wx.showToast({ title: "请选择目标状态", icon: "none" });
      return;
    }
    const remark = this.data.remark.trim();
    if (status === "eliminated" && !this.data.reason) {
      wx.showToast({ title: "请选择淘汰原因", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    try {
      await request<StatusUpdateResponse>({
        url: `/public/customers/my/${this.data.module}/${encodeURIComponent(this.data.leadId)}/status`,
        method: "PUT",
        data: {
          status,
          ...(status === "eliminated" ? { reason: this.data.reason } : {}),
          ...(remark ? { remark } : {}),
        },
      });
      this.setData({ flowOpen: false });
      wx.showToast({ title: `已流转为「${STATUS_META[status].text}」`, icon: "none" });
      // 就地刷新：详情（状态区）与跟进（remark 会落一条系统记录）
      await Promise.all([this.loadDetail(), this.loadFollowUps()]);
    } catch (err) {
      const statusCode = (err as HttpResponseError).statusCode;
      if (statusCode === HTTP_UNAUTHORIZED || statusCode === HTTP_FORBIDDEN) {
        // 登录态/权限异常：静默（与页面空态兜底口径一致）
        return;
      }
      // 409（非法流转/预约线）与 422（缺原因等）：展示后端 message
      wx.showToast({ title: extractErrorMessage(err, "流转失败，请重试"), icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },

  onFollowInput(e: WechatMiniprogram.Input) {
    this.setData({ followUpInput: e.detail.value });
  },

  /** 添加跟进：成功清空输入并重拉列表（倒序）；空内容拦截. */
  async onAddFollowUp() {
    if (this.data.addingFollowUp) {
      return;
    }
    const content = this.data.followUpInput.trim();
    if (!content) {
      wx.showToast({ title: "请输入跟进内容", icon: "none" });
      return;
    }
    this.setData({ addingFollowUp: true });
    try {
      await request<FollowUpItem>({
        url: `/public/customers/my/${this.data.module}/${encodeURIComponent(this.data.leadId)}/follow-ups`,
        method: "POST",
        data: { content },
      });
      this.setData({ followUpInput: "" });
      await this.loadFollowUps();
      wx.showToast({ title: "已添加", icon: "success" });
    } catch (err) {
      const statusCode = (err as HttpResponseError).statusCode;
      if (statusCode === HTTP_UNAUTHORIZED || statusCode === HTTP_FORBIDDEN) {
        return;
      }
      wx.showToast({ title: extractErrorMessage(err, "添加失败，请重试"), icon: "none" });
    } finally {
      this.setData({ addingFollowUp: false });
    }
  },
});
