/**
 * 区域伙伴招募计划 · 招募详情页（单页承载全部报名能力）.
 *
 * 页面职责：
 * - 内容展示：固定营销落地页 7 段式（Hero → 数据 → 痛点 → 优势 → 流程 → 评价 → 报名）
 * - 报名留资：主营商圈文本框（必填）+ 隐私协议 checkbox（默认不勾，按钮始终可点，
 *   校验通过才调起 getPhoneNumber）+ 一键授权留资
 * - 成功态：双层徽标 + 报名信息回执卡 + 返回首页 / 查看合作流程
 * - 访问埋点：onShow 创建访问记录 → onHide/onUnload 上报停留时长与深度浏览（>=3s）
 * - 员工侧：识别内部员工，分享 path 携带 referrer（自身 user_id）+ 未读新线索角标
 * - 员工侧（招募计划二期）：「我的线索」入口（未读角标取数改 /public/recruit/my/leads）、
 *   生成海报（canvas 竖版 5:8，绘制与布局全部在 utils/recruit-poster.ts）、
 *   「分享给客户/生成海报」tap 手势内同步发起订阅消息授权（utils/recruit-employee.ts）
 *
 * 归因链路：客户经员工分享链接进入（query 带 referrer）→ 报名时透传 referrer →
 * 后端首次留资写入归属员工。本页不参与归因判定，仅透传身份标识。
 *
 * 注：本文件超 500 行——一期定型逻辑（留资/埋点/分享）不可移动；二期新增的
 * 海报绘制、员工取数、订阅授权已全部外置 utils，页面仅保留最小编排。
 */
import type { components } from "../../../types/api-types";
import { request, type HttpResponseError } from "../../../utils/request";
import { getAccessToken, getCAccessToken, getUserIdFromAccessToken } from "../../../utils/token";
import { resolveAssetUrl } from "../../../utils/url";
import {
  buildShareEventPayload,
  buildSharePath,
  buildShareQuery,
  checkRecruitForm,
  isDeepView,
  parseRecruitQuery,
  parseSceneCode,
  RECRUIT_LANDING_CONTENT,
  type RecruitLandingContent,
  type RecruitSource,
} from "../../../utils/recruit-logic";
import { createPosterTempFile, savePosterToAlbum } from "../../../utils/recruit-poster-render";
import { fetchEmployeeIdentity, requestLeadSubscribe } from "../../../utils/recruit-employee";

type RecruitCampaignDetailResponse = components["schemas"]["RecruitCampaignDetailResponse"];
type RecruitLeadSubmitResponse = components["schemas"]["RecruitLeadSubmitResponse"];
type RecruitVisitResponse = components["schemas"]["RecruitVisitResponse"];

/** 留资接口 401：令牌过期或受众不匹配（admin 令牌访问 /public/* 接口）. */
const HTTP_UNAUTHORIZED = 401;

/** 格式化提交时间为 YYYY-MM-DD HH:mm（客户端 Date）. */
function formatSubmitTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 数据卡滚动动画时长（ms）. */
const STAT_ANIM_DURATION = 1500;
/** 数据卡滚动动画帧间隔（ms，约 60fps）. */
const STAT_ANIM_TICK = 16;

interface PageData {
  // 落地页固定营销内容
  landing: RecruitLandingContent;
  // 数据卡当前滚动值（从 0 滚动到 target）
  statValues: number[];
  // 活动（仅用于归因 + 导航栏标题）
  campaignId: string;
  campaign: RecruitCampaignDetailResponse | null;
  loading: boolean;
  error: boolean;
  notFound: boolean;
  // 进入参数
  referrer: string;
  source: RecruitSource;
  // 报名表单
  mainBusinessArea: string;
  agreed: boolean;
  /** 表单是否校验通过（商圈非空 && 协议已勾），派生按钮视觉态. */
  formValid: boolean;
  submitting: boolean;
  submitted: boolean;
  /** 校验是否已通过（通过后按钮切换为 open-type=getPhoneNumber 触发授权）. */
  authReady: boolean;
  // 成功态回执
  leadId: string;
  submitTime: string;
  // 登录态
  loggedIn: boolean;
  // 员工侧
  isEmployee: boolean;
  employeeId: string;
  badgeCount: number;
  // 海报（招募计划二期）
  /** 海报预览弹层是否展示. */
  posterVisible: boolean;
  /** 海报导出的临时文件路径（弹层预览 + 保存相册共用）. */
  posterImagePath: string;
  /** 海报生成中（按钮 loading 防重入）. */
  posterLoading: boolean;
  // 埋点
  visitId: string;
  enterTime: number;
  clickedAuth: boolean;
}

interface PageCustom {
  loadCampaign(): Promise<void>;
  onRetry(): void;
  onAreaInput(e: WechatMiniprogram.Input): void;
  onToggleAgree(): void;
  onAgreementTap(): void;
  onApplyTap(): void;
  onResetAuth(): void;
  onPhoneAuth(e: WechatMiniprogram.CustomEvent): void;
  submitLead(code: string): Promise<void>;
  ensureLogin(): boolean;
  createVisit(): void;
  reportVisit(): void;
  reportShareEvent(shareType: "card" | "poster"): void;
  resolveScene(code: string): Promise<void>;
  loadIdentityAndBadge(): void;
  onShareTap(): void;
  onPosterTap(): void;
  generatePoster(): Promise<void>;
  onPosterClose(): void;
  onPosterSave(): void;
  onMineTap(): void;
  noop(): void;
  animateStats(): void;
  clearStatAnim(): void;
  onBackHome(): void;
  onViewFlow(): void;
  onShow(): void;
  onHide(): void;
  onUnload(): void;
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent;
  onShareTimeline(): WechatMiniprogram.Page.ICustomTimelineContent;
  /** 数据卡滚动动画 timer（实例字段，无需 setData）. */
  statAnimTimer?: ReturnType<typeof setTimeout>;
}

Page<PageData, PageCustom>({
  data: {
    landing: RECRUIT_LANDING_CONTENT,
    statValues: RECRUIT_LANDING_CONTENT.stats.map(() => 0),
    campaignId: "",
    campaign: null,
    loading: false,
    error: false,
    notFound: false,
    referrer: "",
    source: "card",
    mainBusinessArea: "",
    agreed: false,
    formValid: false,
    submitting: false,
    submitted: false,
    authReady: false,
    leadId: "",
    submitTime: "",
    loggedIn: false,
    isEmployee: false,
    employeeId: "",
    badgeCount: 0,
    posterVisible: false,
    posterImagePath: "",
    posterLoading: false,
    visitId: "",
    enterTime: 0,
    clickedAuth: false,
  },

  onLoad(options) {
    const rawOptions = options as Record<string, string | undefined>;
    // 同步取当前登录员工 ID 作为 employeeId 初值：onShareAppMessage 是同步回调，
    // 无法 await loadIdentityAndBadge；先从 access_token 解析 sub 填充，确保进入后
    // 立即分享仍携带 referrer 归因（loadIdentityAndBadge 完成后由后端确认值覆盖）
    this.setData({ employeeId: getUserIdFromAccessToken() });
    // 扫码进入：options.scene 存在且无 campaign_id 时，从 scene（"code=xxx" 键值对）提取短码
    if (rawOptions.scene && !rawOptions.campaign_id) {
      const scene = decodeURIComponent(rawOptions.scene);
      const sceneCode = parseSceneCode(scene);
      if (!sceneCode) {
        // scene 无 code 键（非本活动小程序码），不发起无效请求
        this.setData({ notFound: true });
        return;
      }
      this.resolveScene(sceneCode);
      return;
    }
    const query = parseRecruitQuery(rawOptions);
    this.setData({
      campaignId: query.campaignId,
      referrer: query.referrer,
      source: query.source,
      enterTime: Date.now(),
    });
    // 启用分享菜单（右上角「分享给朋友」+「分享到朋友圈」）
    wx.showShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
    // 登录态判断（C 端令牌或后台令牌任一存在即视为潜在登录；实际身份由后续接口确认）
    const hasToken = !!getCAccessToken() || !!getAccessToken();
    this.setData({ loggedIn: hasToken });
    this.loadCampaign();
    // 内部员工识别 + 未读角标（仅后台令牌存在时尝试）
    this.loadIdentityAndBadge();
  },

  /** 解析 scene 短码（扫码进入），还原 campaignId/referrer/source=poster. */
  async resolveScene(code: string) {
    this.setData({ loading: true });
    // 标记是否已委托 loadCampaign 管理 loading（成功路径不重置，避免与 loadCampaign 的 loading 冲突）
    let delegated = false;
    try {
      const result = await request<{ campaign_id: string; referrer: string | null }>({
        url: `/public/recruit/qr/${code}`,
        skipAuth: true,
      });
      this.setData({
        campaignId: result.campaign_id,
        referrer: result.referrer || "",
        source: "poster",
        enterTime: Date.now(),
      });
      wx.showShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
      const hasToken = !!getCAccessToken() || !!getAccessToken();
      this.setData({ loggedIn: hasToken });
      // 访问埋点：扫码路径 onShow 先于异步解析完成触发（campaignId 尚空），
      // 此处补建 visit，否则扫码流量 PV/UV/深度浏览漏斗数据全部缺失
      if (hasToken) {
        this.createVisit();
      }
      this.loadCampaign();
      delegated = true;
      this.loadIdentityAndBadge();
    } catch {
      this.setData({ notFound: true });
    } finally {
      // 仅在未委托 loadCampaign 时（即短码解析失败）重置 loading
      if (!delegated) {
        this.setData({ loading: false });
      }
    }
  },

  onShow() {
    // 从登录页 navigateBack 返回时刷新登录态（进入报名的前置条件）
    const hasToken = !!getCAccessToken() || !!getAccessToken();
    if (hasToken !== this.data.loggedIn) {
      this.setData({ loggedIn: hasToken });
    }
    // 访问埋点：每次前台进入创建新 visit（PV +1，后台切回前台计新 PV）。
    // 必须同步重置会话状态：enterTime（否则 stayed_ms 沿用首次进入以来的累计
    // 时长，后续每次 visit 都被误判为深度浏览）、clickedAuth（避免授权点击
    // 重复记到新 visit）、visitId（新会话不继承旧 visit，防止离开时覆盖上报）
    if (hasToken && this.data.campaignId) {
      this.setData({ enterTime: Date.now(), clickedAuth: false, visitId: "" });
      this.createVisit();
    }
    // 从「我的线索」联系客户等操作返回：静默刷新新线索角标（badgeCount 仅
    // onLoad 加载一次会滞留旧值，如已联系后仍显示「N 条新线索待跟进」）
    if (this.data.isEmployee) {
      this.loadIdentityAndBadge();
    }
  },

  onHide() {
    this.reportVisit();
    this.clearStatAnim();
  },

  onUnload() {
    this.reportVisit();
    this.clearStatAnim();
  },

  /** 创建访问记录（埋点第 2 级 PV/UV 数据源）. */
  createVisit() {
    const { campaignId, referrer, source } = this.data;
    // 注意不可 skipAuth：该接口要求 customer 登录态（aud=c），跳过鉴权会 401 且被静默吞掉，
    // 导致 visitId 永远为空、漏斗 PV/UV/深度浏览/点击授权全链路埋点失效
    request<RecruitVisitResponse>({
      url: "/public/recruit/visits",
      method: "POST",
      data: { campaign_id: campaignId, referrer: referrer || undefined, source },
    })
      .then((res) => {
        if (res && res.id) {
          this.setData({ visitId: res.id });
        }
      })
      .catch(() => {
        // 埋点失败静默，不阻断用户
      });
  },

  /** 上报离开：停留时长 + 深度浏览 + 点击授权（埋点第 3/4 级）. */
  reportVisit() {
    const { visitId, enterTime, clickedAuth } = this.data;
    if (!visitId || !enterTime) {
      return;
    }
    const stayedMs = Date.now() - enterTime;
    const body = {
      stayed_ms: Math.max(0, stayedMs),
      is_deep_view: isDeepView(stayedMs),
      clicked_auth: clickedAuth,
    };
    // 同 createVisit：接口要求 customer 登录态，不可 skipAuth（否则上报恒 401 被静默吞掉）
    request<RecruitVisitResponse>({
      url: `/public/recruit/visits/${visitId}`,
      method: "PUT",
      data: body,
    }).catch(() => {
      // 上报失败静默
    });
  },

  /** 加载活动详情（游客可访问，skipAuth）；campaign 仅用于归因 + 导航栏标题. */
  async loadCampaign() {
    const { campaignId } = this.data;
    if (!campaignId) {
      this.setData({ notFound: true, loading: false });
      return;
    }
    this.setData({ loading: true, error: false, notFound: false });
    try {
      const campaign = await request<RecruitCampaignDetailResponse>({
        url: `/public/recruit/campaigns/${campaignId}`,
        skipAuth: true,
      });
      wx.setNavigationBarTitle({ title: campaign.title || "区域伙伴招募" });
      this.setData({ campaign, loading: false });
      // 活动加载完成、落地页渲染后触发数据卡滚动动画
      this.animateStats();
    } catch (err) {
      const statusCode = (err as HttpResponseError).statusCode;
      if (statusCode === 404) {
        this.setData({ notFound: true, loading: false });
        return;
      }
      this.setData({ error: true, loading: false });
    }
  },

  onRetry() {
    this.loadCampaign();
  },

  onAreaInput(e: WechatMiniprogram.Input) {
    const mainBusinessArea = e.detail.value;
    const formValid = mainBusinessArea.trim() !== "" && this.data.agreed;
    this.setData({ mainBusinessArea, formValid });
    this.onResetAuth();
  },

  onToggleAgree() {
    const agreed = !this.data.agreed;
    const formValid = this.data.mainBusinessArea.trim() !== "" && agreed;
    this.setData({ agreed, formValid });
    this.onResetAuth();
  },

  onAgreementTap() {
    wx.navigateTo({ url: "/pages/agreement/privacy/index/index" });
  },

  /** 校验登录态；未登录则引导登录并返回 false. */
  ensureLogin(): boolean {
    const hasToken = !!getCAccessToken() || !!getAccessToken();
    if (hasToken) {
      this.setData({ loggedIn: true });
      return true;
    }
    this.setData({ loggedIn: false });
    wx.showModal({
      title: "需要登录",
      content: "报名前需要先登录，是否前往登录？",
      confirmText: "去登录",
      cancelText: "取消",
      success: (res) => {
        if (res.confirm) {
          // from=recruit：登录成功后 navigateBack 返回本页（保留已填表单）
          wx.navigateTo({ url: "/pages/login/index/index?from=recruit" });
        }
      },
    });
    return false;
  },

  /**
   * 报名按钮第一步（普通 tap）.
   * 点击时依次校验：主营商圈非空 → 隐私协议勾选 → 登录态.
   * 校验失败仅 toast 提示，不触发授权弹窗；通过后置 authReady=true，
   * WXML 按钮切换为 open-type=getPhoneNumber 调起授权（第二步由用户点击触发）。
   */
  onApplyTap() {
    if (this.data.submitting || this.data.submitted) {
      return;
    }
    const errMsg = checkRecruitForm(this.data.mainBusinessArea, this.data.agreed);
    if (errMsg) {
      wx.showToast({ title: errMsg, icon: "none" });
      return;
    }
    if (!this.ensureLogin()) {
      return;
    }
    // 校验通过：切换按钮为授权态，等待用户点击触发 getPhoneNumber
    this.setData({ authReady: true });
  },

  /** 用户修改报名表单后重置授权态，需重新校验（保证协议/商圈最新）. */
  onResetAuth() {
    if (this.data.authReady) {
      this.setData({ authReady: false });
    }
  },

  /**
   * getPhoneNumber 授权回调（authReady=true 时按钮为 open-type=getPhoneNumber）.
   * detail.errMsg 含 "ok" 表示授权成功；detail.code 为换取手机号凭证.
   * 拒绝授权则终止流程，不记录任何数据。
   */
  onPhoneAuth(e: WechatMiniprogram.CustomEvent) {
    // 点击授权：置埋点 clicked_auth=true（漏斗第 4 级）
    this.setData({ clickedAuth: true });
    const detail = e.detail as { code?: string; errMsg?: string };
    if (detail.errMsg && !detail.errMsg.includes("ok")) {
      wx.showToast({ title: "授权失败，无法报名", icon: "none" });
      return;
    }
    if (!detail.code) {
      wx.showToast({ title: "获取手机号失败", icon: "none" });
      return;
    }
    this.submitLead(detail.code);
  },

  /** 调留资接口（归因引擎落库），成功切换为成功态视图（回执卡 + 返回首页）. */
  async submitLead(code: string) {
    if (this.data.submitting) {
      return;
    }
    this.setData({ submitting: true });
    const body = {
      code,
      campaign_id: this.data.campaignId || undefined,
      main_business_area: this.data.mainBusinessArea.trim(),
      referrer: this.data.referrer || undefined,
      source: this.data.source,
      visit_id: this.data.visitId || undefined,
    };
    try {
      const res = await request<RecruitLeadSubmitResponse>({
        url: "/public/recruit/leads",
        method: "POST",
        data: body,
      });
      this.setData({
        submitting: false,
        submitted: true,
        leadId: res.lead_id,
        submitTime: formatSubmitTime(new Date()),
      });
    } catch (err) {
      this.setData({ submitting: false });
      const statusCode = (err as HttpResponseError).statusCode;
      if (statusCode === HTTP_UNAUTHORIZED) {
        // 令牌过期或受众不匹配：
        // - 完全无令牌 → ensureLogin 弹登录 modal（返回 false）
        // - 持 admin 令牌（无 C 端令牌）访问 /public/* 受众不匹配 →
        //   ensureLogin 误判为已登录（返回 true），需显式引导切换到微信登录，
        //   否则用户授权码被消耗且无任何反馈（onPhoneAuth 已置 clickedAuth=true）
        if (!this.ensureLogin()) {
          return;
        }
        wx.showModal({
          title: "需要微信登录",
          content: "报名需使用微信登录身份，是否前往登录？",
          confirmText: "去登录",
          cancelText: "取消",
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({ url: "/pages/login/index/index?from=recruit" });
            }
          },
        });
        return;
      }
      wx.showToast({ title: "提交失败，请重试", icon: "none" });
    }
  },

  /**
   * 员工身份识别 + 未读新线索角标.
   * 仅后台令牌存在时执行（内部员工）；失败/无权限静默降级，不阻断分享。
   * 角标取数（二期）：由 /admin/recruit/leads 改为 /public/recruit/my/leads 取 total
   * （见 utils/recruit-employee.ts，失败静默），其余逻辑不动。
   */
  async loadIdentityAndBadge() {
    const adminToken = getAccessToken();
    if (!adminToken) {
      return;
    }
    try {
      const identity = await fetchEmployeeIdentity();
      this.setData({
        isEmployee: true,
        employeeId: identity.employeeId,
        badgeCount: identity.badgeCount,
      });
    } catch {
      // 403（无 recruit:read）/401 等：静默隐藏角标，员工可正常浏览/分享
    }
  },

  /**
   * 员工区块「分享给客户」tap：手势内同步发起订阅授权（Task 9，拒绝/失败静默）.
   * 分享本身由 open-type="share" 调起（onShareAppMessage 逻辑不动）.
   */
  onShareTap() {
    if (this.data.isEmployee) {
      requestLeadSubscribe(this.data.campaign?.subscribe_template_id);
    }
  },

  /**
   * 员工区块「生成海报」tap：手势内同步发起订阅授权（Task 9），随后生成海报.
   */
  onPosterTap() {
    if (this.data.isEmployee) {
      requestLeadSubscribe(this.data.campaign?.subscribe_template_id);
    }
    if (this.data.posterLoading) {
      return;
    }
    this.generatePoster();
  },

  /**
   * 生成海报：取员工专属小程序码 → canvas 绘制（utils/recruit-poster.ts）→
   * 导出临时文件 → 弹层预览。生成成功上报 poster 分享事件（漏斗第 1 级，复用既有上报）.
   */
  async generatePoster() {
    const { campaignId, campaign } = this.data;
    if (!campaignId || !campaign || this.data.posterLoading) {
      return;
    }
    this.setData({ posterLoading: true });
    wx.showLoading({ title: "生成中…", mask: true });
    try {
      const posterImagePath = await createPosterTempFile(this, campaignId, campaign);
      this.setData({ posterImagePath, posterVisible: true, posterLoading: false });
      wx.hideLoading();
      this.reportShareEvent("poster");
    } catch (err) {
      this.setData({ posterLoading: false });
      wx.hideLoading();
      const statusCode = (err as HttpResponseError).statusCode;
      // qrcode 接口要求 C 端登录态：401（员工仅有 admin 令牌/未登录）单独提示
      const title =
        statusCode === HTTP_UNAUTHORIZED ? "生成海报需先微信登录" : "海报生成失败，请重试";
      wx.showToast({ title, icon: "none" });
    }
  },

  /** 海报弹层「保存到相册」：权限拒绝时引导去设置并自动重试（utils/recruit-poster.ts）. */
  onPosterSave() {
    const { posterImagePath } = this.data;
    if (!posterImagePath) {
      return;
    }
    savePosterToAlbum(posterImagePath);
  },

  /** 关闭海报预览弹层（点遮罩/关闭按钮）. */
  onPosterClose() {
    this.setData({ posterVisible: false });
  },

  /** 员工区块「我的线索」入口：请求订阅授权后携带活动信息进入我的线索页. */
  onMineTap() {
    if (this.data.isEmployee) {
      requestLeadSubscribe(this.data.campaign?.subscribe_template_id);
    }
    const { campaignId } = this.data;
    const subscribeTemplateId = this.data.campaign?.subscribe_template_id || "";
    let url = "/pages/recruit/mine/index";
    const params: string[] = [];
    if (campaignId) {
      params.push(`campaign_id=${encodeURIComponent(campaignId)}`);
    }
    if (subscribeTemplateId) {
      params.push(`subscribe_template_id=${encodeURIComponent(subscribeTemplateId)}`);
    }
    if (params.length > 0) {
      url += "?" + params.join("&");
    }
    wx.navigateTo({ url });
  },

  /** 阻止海报弹层内容区冒泡（遮罩点击关闭）. */
  noop() {
    // 空实现：仅承接 catchtap
  },

  /**
   * 数据卡滚动动画：从 0 滚动到各 target，使用 easeOutQuart 缓动.
   * 触发时机：loadCampaign 成功后（落地页渲染、数据卡可见）.
   * 离开页面（onHide/onUnload）时清理 timer 避免销毁后 setData.
   */
  animateStats() {
    this.clearStatAnim();
    const targets = RECRUIT_LANDING_CONTENT.stats.map((s) => s.target);
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / STAT_ANIM_DURATION);
      // easeOutQuart: 1 - (1 - t)^4，前期快、后期慢，数字「跳起来」更有冲击力
      const eased = 1 - Math.pow(1 - t, 4);
      const values = targets.map((target) => Math.round(target * eased));
      this.setData({ statValues: values });
      if (t < 1) {
        this.statAnimTimer = setTimeout(tick, STAT_ANIM_TICK);
      } else {
        this.statAnimTimer = undefined;
      }
    };
    tick();
  },

  /** 清理数据卡滚动动画 timer（onHide/onUnload 调用）. */
  clearStatAnim() {
    if (this.statAnimTimer) {
      clearTimeout(this.statAnimTimer);
      this.statAnimTimer = undefined;
    }
  },

  /** 成功态「返回首页」：跳转房源 tab. */
  onBackHome() {
    wx.switchTab({ url: "/pages/projects/list/index" });
  },

  /** 成功态「查看合作流程」：滚动回流程区. */
  onViewFlow() {
    wx.pageScrollTo({ selector: "#flow-section", duration: 300 });
  },

  /** 分享卡片：referrer 用自身员工 ID（登录态），未登录则透传进入时的 referrer. */
  onShareAppMessage() {
    const { campaignId, employeeId, referrer, campaign } = this.data;
    const shareReferrer = employeeId || referrer;
    const path = buildSharePath(campaignId, shareReferrer, "card");
    const share: WechatMiniprogram.IAnyObject = {
      title: campaign?.title || "区域伙伴招募计划",
      path,
    };
    const imageUrl = resolveAssetUrl(campaign?.image_url || "");
    if (imageUrl) {
      share.imageUrl = imageUrl;
    }
    // 上报分享事件（漏斗第 1 级数据源），未登录/失败静默不阻断分享
    this.reportShareEvent("card");
    return share;
  },

  onShareTimeline() {
    const { campaignId, employeeId, referrer, campaign } = this.data;
    const shareReferrer = employeeId || referrer;
    const query = buildShareQuery(campaignId, shareReferrer, "poster");
    const share: WechatMiniprogram.IAnyObject = {
      title: campaign?.title || "区域伙伴招募计划",
      query,
    };
    const imageUrl = resolveAssetUrl(campaign?.image_url || "");
    if (imageUrl) {
      share.imageUrl = imageUrl;
    }
    // 上报分享事件（漏斗第 1 级数据源），未登录/失败静默不阻断分享
    this.reportShareEvent("poster");
    return share;
  },

  /** 上报分享事件，失败静默（不阻断分享流程）. */
  reportShareEvent(shareType: "card" | "poster") {
    const { campaignId } = this.data;
    if (!campaignId) return;
    // 仅登录态上报（未登录静默跳过，避免匿名刷量）
    if (!getCAccessToken() && !getAccessToken()) return;
    const payload = buildShareEventPayload(campaignId, shareType);
    request<{ id: string }>({
      url: "/public/recruit/share-events",
      method: "POST",
      data: payload,
    }).catch(() => {
      // 失败静默，不影响分享
    });
  },
});
