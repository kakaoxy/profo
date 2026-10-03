import { calcLoan, clampDownPct, downAmountBounds, downAmountToPct, fmtBp, fmtPct2, fmtWan1, fmtYuanInt,
  parseBargainInput, DOWN_MIN, DOWN_NOTE, LOAN_DEFAULTS, LOAN_YEARS, METHOD_DESC, METHOD_NAME,
  MODE_NAME, stepBp, stepFundAmt, stepLpr } from "../../utils/loan-calc";
import type { LoanMode, LoanParams, RepayMethod } from "../../utils/loan-calc";

/** 还款计划弹窗单行展示数据（全部预格式化，WXML 零数值运算）. */
interface ScheduleRowView {
  no: number;
  pay: string;
  pri: string;
  int: string;
  bal: string;
}

interface PageData {
  /** 挂牌原价（万元，跳转参数）；非法时 invalid 态. */
  price: number;
  /** 期望总价（万元，砍价后生效）；null = 未砍价（spec K10）. */
  customPrice: number | null;
  /** 面积（㎡，仅房源摘要展示）. */
  area: string;
  /** 房源标题（仅摘要展示）. */
  title: string;
  /** 分享人/顾问电话（「贷款专家咨询」拨打，spec K11）；缺失时点击 toast. */
  phone: string;
  /** 跳转参数 price 非法（直入/分享丢参）. */
  invalid: boolean;

  /* ── 房源摘要条价格行（砍价联动） ── */
  /** 摘要条展示价（期望价 ?? 挂牌价，万元 1 位小数）. */
  showPrice: string;
  /** 划线原价（仅已砍价时展示）. */
  wasPrice: string;
  /** 已砍价标记（控制划线原价/标签切换）. */
  isCut: boolean;
  /** 价格行标签：未砍「房屋总价」/ 已砍「期望总价 · 已砍 ¥X万」. */
  priceLabel: string;
  /** 砍价弹层是否展示. */
  bargainVisible: boolean;
  /** 砍价输入框当前值（再次打开回填当前期望价，空串=未砍）. */
  bargainInput: string;
  /** 砍价输入框 placeholder（挂牌原价）. */
  bargainPlaceholder: string;
  /** 自定义首付弹层是否展示（spec K12）. */
  customDownVisible: boolean;
  /** 自定义首付输入框当前值（打开时回填当前首付金额）. */
  customDownInput: string;
  /** 自定义首付输入 placeholder（首付下限金额）. */
  customDownPlaceholder: string;
  /** 自定义首付有效区间提示文案（如「可输入 72.9 ~ 388.8 万」）. */
  customDownHint: string;

  /* ── 派生展示（apply() 全量刷新） ── */
  mode: LoanMode;
  method: RepayMethod;
  downPct: number;
  years: number;
  lpr: number;
  bp: number;
  fundAmt: number;

  /** 结果卡：月供标签 / 月供 / 执行利率 / 贷款总额 / 利息 / 首付. */
  rModeText: string;
  rMonth: string;
  rRate: string;
  rLoan: string;
  rInterest: string;
  rDown: string;
  /** 等额本金附注（末月 + 递减额）；axi 模式隐藏. */
  prinVisible: boolean;
  rLast: string;
  rDec: string;
  /** 还款方式卡的利息合计. */
  mTotal: string;
  /** 还款方式说明文案. */
  mDesc: string;

  /** 首付卡：比例 / 金额 / 滑杆下限 / 下限提示. */
  cpPct: string;
  cpAmt: string;
  cpMin: number;
  cpMax: number;
  cpNote: string;
  /** 年限卡：档位与期数. */
  cyVal: string;
  cyN: number;
  /** 年限档渲染数组. */
  yearsList: { v: number; label: string }[];
  /** 首付快捷档渲染数组. */
  downChips: number[];

  /** 商贷执行利率徽标（comm / combo 卡共用）. */
  commExec: string;
  /** LPR / 加点显示值. */
  lprText: string;
  bpText: string;
  fundAmtText: string;

  /** 卡片显隐（mode 联动）. */
  showComm: boolean;
  showFund: boolean;
  showCombo: boolean;

  /** tab / seg / chips 高亮 key（WXML class 判断用）. */
  tabComm: boolean;
  tabFund: boolean;
  tabCombo: boolean;
  segAxi: boolean;
  segPrin: boolean;

  /* ── 还款计划弹窗 ── */
  scheduleVisible: boolean;
  scheduleSub: string;
  scheduleRows: ScheduleRowView[];
}

type Custom = {
  apply(next?: Partial<LoanParams>): void;
  onModeTap(e: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { mode?: string }>): void;
  onSliderChanging(e: WechatMiniprogram.SliderChange): void;
  onSliderChange(e: WechatMiniprogram.SliderChange): void;
  onChipTap(e: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { v?: string }>): void;
  onYearTap(e: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { v?: string }>): void;
  onMethodTap(e: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { v?: string }>): void;
  onStepTap(e: WechatMiniprogram.BaseEvent<WechatMiniprogram.IAnyObject, { t?: string; d?: string }>): void;
  onReset(): void;
  onOpenSchedule(): void;
  onCloseSchedule(): void;
  onNothingTap(): void;
  stopPropagation(): void;
  /** 砍价入口：打开砍价弹层. */
  onBargainTap(): void;
  /** 砍价输入同步（bindinput）. */
  onBargainInput(e: WechatMiniprogram.Input): void;
  /** 砍价确认：解析校验 → 置期望价 → 全量重算. */
  onBargainOk(): void;
  /** 恢复原价：清期望价 → 关闭弹层 → 全量重算. */
  onBargainReset(): void;
  /** 自定义首付 chip：打开自定义首付弹层（spec K12）. */
  onCustomDownTap(): void;
  /** 自定义首付输入同步（bindinput）. */
  onCustomDownInput(e: WechatMiniprogram.Input): void;
  /** 自定义首付确认：金额换算比例（区间校验/双保险钳制）→ 重算. */
  onCustomDownOk(): void;
  /** 自定义首付弹层关闭. */
  onCustomDownClose(): void;
  /** 贷款专家咨询：拨打分享人/顾问电话（无电话 toast，取消静默）. */
  onCallTap(): void;
  /** 了解购房流程：跳转购房模拟器. */
  onSimulatorTap(): void;
  /** 当前生效参数（展示串由 apply() 派生进 data；实例属性随实例生命周期隔离）. */
  params: LoanParams;
  /** 期望总价（万元）；null = 未砍价，计算用 customPrice ?? price. */
  customPrice: number | null;
};

Page<PageData, Custom>({
  data: {
    price: 0,
    customPrice: null,
    area: "",
    title: "",
    phone: "",
    invalid: false,

    showPrice: "",
    wasPrice: "",
    isCut: false,
    priceLabel: "房屋总价",
    bargainVisible: false,
    bargainInput: "",
    bargainPlaceholder: "",
    customDownVisible: false,
    customDownInput: "",
    customDownPlaceholder: "",
    customDownHint: "",

    mode: LOAN_DEFAULTS.mode,
    method: LOAN_DEFAULTS.method,
    downPct: LOAN_DEFAULTS.downPct,
    years: LOAN_DEFAULTS.years,
    lpr: LOAN_DEFAULTS.lpr,
    bp: LOAN_DEFAULTS.bp,
    fundAmt: LOAN_DEFAULTS.fundAmt,

    rModeText: "",
    rMonth: "",
    rRate: "",
    rLoan: "",
    rInterest: "",
    rDown: "",
    prinVisible: false,
    rLast: "",
    rDec: "",
    mTotal: "",
    mDesc: METHOD_DESC.axi,

    cpPct: "",
    cpAmt: "",
    cpMin: DOWN_MIN.comm,
    cpMax: 80,
    cpNote: DOWN_NOTE.comm,
    cyVal: "30年",
    cyN: 360,
    yearsList: LOAN_YEARS.map((v) => ({ v, label: `${v}年` })),
    downChips: [15, 20, 30, 50],

    commExec: "",
    lprText: "3.50",
    bpText: "−45",
    fundAmtText: "100",

    showComm: true,
    showFund: false,
    showCombo: false,

    tabComm: true,
    tabFund: false,
    tabCombo: false,
    segAxi: true,
    segPrin: false,

    scheduleVisible: false,
    scheduleSub: "",
    scheduleRows: [],
  },
  /**
   * 全量派生：calcLoan 一次 → 所有展示串一次 setData（幂等，滑杆高频拖动安全）.
   * 可传增量参数（如 tab 切换 + 首付抬升），不传则按当前 params 重算.
   */
  apply(next) {
    if (next) {
      this.params = { ...this.params, ...next };
    }
    const eff = this.customPrice ?? this.data.price;
    const r = calcLoan(eff, this.params);
    const isPrin = this.params.method === "prin";
    this.setData({
      customPrice: this.customPrice,
      mode: this.params.mode,
      method: this.params.method,
      downPct: this.params.downPct,
      years: this.params.years,
      lpr: this.params.lpr,
      bp: this.params.bp,
      fundAmt: this.params.fundAmt,

      /* 房源摘要条价格行（砍价联动，spec K10） */
      showPrice: fmtWan1(eff),
      wasPrice: fmtWan1(this.data.price),
      isCut: this.customPrice !== null,
      priceLabel: this.customPrice !== null
        ? `期望总价 · 已砍 ¥${fmtWan1(this.data.price - eff)}万`
        : "房屋总价",

      rModeText: isPrin ? "月供（等额本金 · 首月）" : "月供（等额本息）",
      rMonth: fmtYuanInt(r.first),
      rRate: r.execRate.toFixed(2) + "%",
      rLoan: fmtWan1(r.loanWan),
      rInterest: fmtYuanInt(r.interestYuan),
      rDown: fmtWan1(r.downWan),
      prinVisible: isPrin,
      rLast: fmtYuanInt(r.last),
      rDec: fmtYuanInt(r.dec),
      mTotal: fmtYuanInt(r.interestYuan) + "元",
      mDesc: METHOD_DESC[this.params.method],

      cpPct: fmtPct2(this.params.downPct) + "%",
      cpAmt: fmtWan1(r.downWan) + "万",
      cpMin: DOWN_MIN[this.params.mode],
      cpNote: DOWN_NOTE[this.params.mode],

      cyVal: this.params.years + "年",
      cyN: this.params.years * 12,

      commExec: "执行 " + r.commRate.toFixed(2) + "%",
      lprText: this.params.lpr.toFixed(2),
      bpText: fmtBp(this.params.bp),
      fundAmtText: String(this.params.fundAmt),

      showComm: this.params.mode === "comm",
      showFund: this.params.mode === "fund",
      showCombo: this.params.mode === "combo",

      tabComm: this.params.mode === "comm",
      tabFund: this.params.mode === "fund",
      tabCombo: this.params.mode === "combo",
      segAxi: this.params.method === "axi",
      segPrin: this.params.method === "prin",
    });
  },
  onLoad(options) {
    const raw = options as Record<string, string | undefined>;
    const price = Number(raw.price);
    // 每次进入先重置实例态（含 invalid 分支，避免同实例重进时残留旧参数）
    this.params = { ...LOAN_DEFAULTS };
    this.customPrice = null;
    if (!Number.isFinite(price) || price <= 0) {
      this.setData({ invalid: true });
      return;
    }
    this.setData({
      price,
      area: raw.area || "",
      title: raw.title ? decodeURIComponent(raw.title) : "",
      phone: raw.phone ? decodeURIComponent(raw.phone) : "",
      invalid: false,
    });
    this.apply();
  },
  /** 贷款方式 tab：切 mode；当前首付低于新方式下限时自动抬升至下限（spec K3）. */
  onModeTap(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode !== "comm" && mode !== "fund" && mode !== "combo") {
      return;
    }
    if (mode === this.params.mode) {
      return;
    }
    const downPct = clampDownPct(this.params.downPct, mode);
    this.apply({ mode, downPct });
  },
  /** 首付滑杆拖动中：实时重算. */
  onSliderChanging(e) {
    const downPct = clampDownPct(Number(e.detail.value), this.params.mode);
    this.apply({ downPct });
  },
  /** 首付滑杆松手：与拖动中同路径（apply 幂等）. */
  onSliderChange(e) {
    const downPct = clampDownPct(Number(e.detail.value), this.params.mode);
    this.apply({ downPct });
  },
  /** 首付快捷档（15/20/30/50%）：钳下限后生效. */
  onChipTap(e) {
    const v = Number(e.currentTarget.dataset.v);
    if (!Number.isFinite(v)) {
      return;
    }
    this.apply({ downPct: clampDownPct(v, this.params.mode) });
  },
  /** 年限档. */
  onYearTap(e) {
    const v = Number(e.currentTarget.dataset.v);
    if (!Number.isFinite(v)) {
      return;
    }
    this.apply({ years: v });
  },
  /** 还款方式切换. */
  onMethodTap(e) {
    const v = e.currentTarget.dataset.v;
    if (v !== "axi" && v !== "prin") {
      return;
    }
    this.apply({ method: v });
  },
  /** stepper（t: lpr / bp / fundAmt；d: ±1）. */
  onStepTap(e) {
    const t = e.currentTarget.dataset.t;
    const d = Number(e.currentTarget.dataset.d);
    if (!t || !Number.isFinite(d)) {
      return;
    }
    if (t === "lpr") {
      this.apply({ lpr: stepLpr(this.params.lpr, d) });
    } else if (t === "bp") {
      this.apply({ bp: stepBp(this.params.bp, d) });
    } else if (t === "fundAmt") {
      this.apply({ fundAmt: stepFundAmt(this.params.fundAmt, d) });
    }
  },
  /** 恢复默认口径（首套 · 30年 · LPR−45bp）：同时清除期望价（对齐设计稿 DEFAULTS.customPrice:null）. */
  onReset() {
    this.params = { ...LOAN_DEFAULTS };
    this.customPrice = null;
    this.apply();
  },
  /** 打开还款计划明细：按当前参数实时推演 360 期，格式化后一次 setData（spec K7）. */
  onOpenSchedule() {
    const r = calcLoan(this.customPrice ?? this.data.price, this.params);
    const rows: ScheduleRowView[] = r.rows.map((rw, i) => ({
      no: i + 1,
      pay: fmtYuanInt(rw.pay),
      pri: fmtYuanInt(rw.pri),
      int: fmtYuanInt(rw.int),
      bal: fmtYuanInt(rw.bal),
    }));
    this.setData({
      scheduleVisible: true,
      scheduleSub:
        `${MODE_NAME[this.params.mode]} · ${METHOD_NAME[this.params.method]} · 年利率 ` +
        `${r.execRate.toFixed(2)}% · 共 ${this.params.years * 12} 期 · 总利息 ${fmtYuanInt(r.interestYuan)}元`,
      scheduleRows: rows,
    });
  },
  /** 关闭弹窗（数据保留于 data，下次打开重算覆盖）. */
  onCloseSchedule() {
    this.setData({ scheduleVisible: false });
  },
  /** 遮罩空白点击关闭（内容区 catch 阻断）. */
  onNothingTap() {
    this.onCloseSchedule();
  },
  /** 阻断事件冒泡（弹窗内容区 / 弹窗内滚动区），空实现不触发关闭. */
  stopPropagation(): void {
    // 空实现：仅阻断冒泡
  },
  /** 砍价入口：回填当前期望价（未砍为空串），打开弹层（spec K10）. */
  onBargainTap() {
    this.setData({
      bargainInput: this.customPrice !== null ? String(this.customPrice) : "",
      bargainVisible: true,
    });
  },
  onBargainInput(e) {
    this.setData({ bargainInput: e.detail.value });
  },
  /** 砍价确认：非法输入 toast 且不关闭（Fail Loud），合法置期望价后全量重算. */
  onBargainOk() {
    const v = parseBargainInput(this.data.bargainInput);
    if (v === null) {
      wx.showToast({ title: "请输入有效价格（不超过 9999 万）", icon: "none" });
      return;
    }
    this.customPrice = v;
    this.setData({ bargainVisible: false });
    this.apply();
  },
  /** 恢复原价：清期望价 → 关闭弹层 → 全量重算. */
  onBargainReset() {
    this.customPrice = null;
    this.setData({ bargainVisible: false });
    this.apply();
  },
  /** 自定义首付 chip：回填当前首付金额（期望价口径），打开弹层（spec K12）. */
  onCustomDownTap() {
    const eff = this.customPrice ?? this.data.price;
    const bounds = downAmountBounds(eff, this.params.mode);
    this.setData({
      customDownInput: fmtWan1((eff * this.params.downPct) / 100),
      customDownPlaceholder: fmtWan1(bounds.min),
      customDownHint: `可输入 ${fmtWan1(bounds.min)} ~ ${fmtWan1(bounds.max)} 万`,
      customDownVisible: true,
    });
  },
  onCustomDownInput(e) {
    this.setData({ customDownInput: e.detail.value });
  },
  /**
   * 自定义首付确认：金额换算比例（四舍五入取整 + clampDownPct 双保险）.
   * 非法/越界 toast 且不关闭（Fail Loud）；合法置 downPct 后全量重算（spec K12）.
   */
  onCustomDownOk() {
    const raw = this.data.customDownInput;
    const amount = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(amount) || amount <= 0) {
      wx.showToast({ title: "请输入有效金额", icon: "none" });
      return;
    }
    const eff = this.customPrice ?? this.data.price;
    const bounds = downAmountBounds(eff, this.params.mode);
    if (amount < bounds.min) {
      wx.showToast({ title: `首付不低于 ${fmtWan1(bounds.min)} 万`, icon: "none" });
      return;
    }
    if (amount > bounds.max) {
      wx.showToast({ title: `首付不高于 ${fmtWan1(bounds.max)} 万`, icon: "none" });
      return;
    }
    this.setData({ customDownVisible: false });
    this.apply({ downPct: downAmountToPct(amount, eff, this.params.mode) });
  },
  /** 自定义首付弹层关闭（遮罩点击）. */
  onCustomDownClose() {
    this.setData({ customDownVisible: false });
  },
  /** 贷款专家咨询：拨打分享人/顾问电话（无电话 toast，用户取消静默）— spec K11. */
  onCallTap() {
    const phone = this.data.phone;
    if (!phone) {
      wx.showToast({ title: "暂未获取到联系方式", icon: "none" });
      return;
    }
    wx.makePhoneCall({
      phoneNumber: phone,
      fail: () => {
        // 用户取消拨号静默
      },
    });
  },
  /** 了解购房流程：跳转购房模拟器 — spec K11. */
  onSimulatorTap() {
    wx.navigateTo({ url: "/pages/house-simulator/index/index" });
  },
  /** 实例属性：随页面实例生命周期初始化（避免模块级变量在多实例/重进时间串状态）. */
  params: { ...LOAN_DEFAULTS },
  customPrice: null,
});
