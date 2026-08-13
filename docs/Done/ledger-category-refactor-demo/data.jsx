// ===========================================================
// 共享数据：科目(大类) + 节点 + 子项 三层模型
// 对齐 docs/profocw.html 财务逻辑（权威源）
// 对齐 docs/ledger-cashflow-dashboard 的"科目"与"节点"概念
//
// - 科目(大类)：固定算账科目，对应利润三层结构，业务不可增删
// - 节点：全周期现金流阶段（代理5+终结 / 收购6+终结），子项必须归属某个节点
// - 子项：在「科目 × 节点」交叉点上，系统预置 + 业务可加
//
// 关键对齐点（与 profocw.html 一致）：
//   1. 购房款 + 月供利息归 acquisition_cost（取得成本），已内化于"售房差额"，不重复扣减
//   2. 毛利扣减项 = 收房佣金 / 购房佣金 / 售房佣金 / 装修类（佣金在毛利层扣减）
//   3. 其他收入 + 结算差额单列层级，对齐 profocw.html 报表 6 大类
// ===========================================================

// 注：本文件以普通 <script> 加载（非 babel），顶层 var 自动成为 window 属性
// 以便其他 babel 脚本(admin/record-dialog/...)能直接通过 window 引用

// ── 算账层级（利润三层结构 + 配对 + 融资往来 + 取得成本 + 兜底）──
// in_pl: 是否进入损益计算
//   - revenue/direct_cost/operating/finance/other_income/settlement 进损益
//   - acquisition_cost/pair/financing 不进损益（取得成本已内化于差额；配对净额=0；融资本金往来）
var ACCOUNTING_LAYERS = [
  { code: "revenue", label: "① 收入层", short: "收入", color: "in", in_pl: true, desc: "收入实现，进入利润计算" },
  { code: "direct_cost", label: "② 直接成本", short: "直接成本", color: "out", in_pl: true, desc: "毛利扣减项（佣金 + 装修类）" },
  { code: "acquisition_cost", label: "取得成本", short: "取得成本", color: "neutral", in_pl: false, desc: "购房款 + 月供利息，已内化于售房差额，不重复扣减" },
  { code: "operating", label: "③ 运营费用", short: "运营", color: "out", in_pl: true, desc: "营销 + 运营 + 税费" },
  { code: "finance", label: "③ 融资成本", short: "融资", color: "finance", in_pl: true, desc: "项目分润（融资方利润分成）" },
  { code: "other_income", label: "其他收入", short: "他项", color: "in", in_pl: true, desc: "非主业收入（他项收入）" },
  { code: "pair", label: "配对核销", short: "配对", color: "pair", in_pl: false, desc: "净额归零，不进损益（保证金 / 暂支款）" },
  { code: "financing", label: "融资往来", short: "往来", color: "finance", in_pl: false, desc: "本金往来，不进损益（投资款收付）" },
  { code: "settlement", label: "兜底", short: "兜底", color: "out", in_pl: true, desc: "极端情况平账（结算差额，只出不进）" },
];

// ── 节点（全周期现金流阶段，对齐 profocw.html 流程图）──
// 代理：签约 → 装修 → 在售 → 已售 → 项目终结（5阶段+终结）
// 收购：签约/买入 → 持有期 → 装修 → 在售 → 已售 → 项目终结（6阶段+终结）
var STAGES = {
  agent: [
    { code: "signing", label: "签约", icon: "✍️", sub: "阶段一 · 资金注入" },
    { code: "renovation", label: "装修", icon: "🔨", sub: "阶段二 · 改造投入" },
    { code: "listing", label: "在售", icon: "🏷️", sub: "阶段三 · 营销推广" },
    { code: "sold", label: "已售", icon: "✅", sub: "阶段四 · 收入实现" },
    { code: "ending", label: "项目终结", icon: "🔚", sub: "兜底平账" },
  ],
  wholesale: [
    { code: "signing", label: "签约/买入", icon: "🏦", sub: "阶段一 · 产权登记" },
    { code: "holding", label: "持有期", icon: "📆", sub: "阶段二 · 按揭持有" },
    { code: "renovation", label: "装修", icon: "🔨", sub: "阶段三 · 改造投入" },
    { code: "listing", label: "在售", icon: "🏷️", sub: "阶段四 · 营销推广" },
    { code: "sold", label: "已售", icon: "✅", sub: "阶段五 · 差额回收" },
    { code: "ending", label: "项目终结", icon: "🔚", sub: "兜底平账" },
  ],
};

// ── 科目（大类）：固定算账科目，对齐 profocw.html 完整科目清单 ──
// 字段：code / label / accounting_layer / business_forms / default_stage / is_pair（配对核销项）
//   - accounting_layer: 对应 ACCOUNTING_LAYERS.code
//   - default_stage: 该科目默认归属的节点（子项可跨节点，但有默认归属）
//   - is_pair: 配对核销项，有正向和反向两笔（如保证金缴纳 / 退回）
//   - internalized: 是否已内化于其他科目公式（取得成本内化于售房差额，不参与毛利扣减）
var SUBJECTS = [
  // —— 收入层 ——
  { code: "value_added_fee", label: "增值服务费", accounting_layer: "revenue", business_forms: ["agent"], default_stage: "sold", is_pair: false,
    formula: "卖出价 − 业主底价（记账与合同的正式科目名）" },
  { code: "house_sale_diff", label: "售房差额", accounting_layer: "revenue", business_forms: ["wholesale"], default_stage: "sold", is_pair: false,
    formula: "卖出价 −（购房定金+首付+贷款+贷款差额+交易税费+尾款+名额费+月供利息）" },

  // —— 直接成本（毛利扣减）—— 佣金统一在毛利层扣减
  { code: "acquisition_commission", label: "收房佣金", accounting_layer: "direct_cost", business_forms: ["agent"], default_stage: "signing", is_pair: false,
    formula: "签约渠道佣金（含线索 + 签约成本）" },
  { code: "purchase_commission", label: "购房佣金", accounting_layer: "direct_cost", business_forms: ["wholesale"], default_stage: "signing", is_pair: false,
    formula: "购房渠道佣金" },
  { code: "selling_commission", label: "售房佣金", accounting_layer: "direct_cost", business_forms: ["wholesale"], default_stage: "sold", is_pair: false,
    formula: "差额部分售房佣金" },
  { code: "renovation", label: "装修类", accounting_layer: "direct_cost", business_forms: ["agent", "wholesale"], default_stage: "renovation", is_pair: false,
    formula: "设计费 + 装修款 + 软装采购 + 定制柜 + ..." },

  // —— 取得成本（已内化于售房差额，不参与毛利扣减）——
  // 仅作展示与节点定位，不进入损益计算
  { code: "purchase_price", label: "购房款", accounting_layer: "acquisition_cost", business_forms: ["wholesale"], default_stage: "signing", is_pair: false, internalized: true,
    formula: "定金 + 首付 + 尾款 + 贷款差额 + 交易税费 + 名额费（已含于售房差额）" },
  { code: "holding_interest", label: "月供利息", accounting_layer: "acquisition_cost", business_forms: ["wholesale"], default_stage: "holding", is_pair: false, internalized: true,
    formula: "持有期按揭利息（内化于售房差额，月供本金不另列支）" },

  // —— 运营费用 ——
  { code: "marketing", label: "营销类", accounting_layer: "operating", business_forms: ["agent", "wholesale"], default_stage: "listing", is_pair: false,
    formula: "推广 + 销售激励 + 营销其他" },
  { code: "marketing_fee", label: "营销推广费", accounting_layer: "operating", business_forms: ["agent", "wholesale"], default_stage: "sold", is_pair: false,
    formula: "卖出价 × 0.5%" },
  { code: "operation_fee", label: "运营服务费", accounting_layer: "operating", business_forms: ["agent", "wholesale"], default_stage: "sold", is_pair: false,
    formula: "卖出价 × 1%" },
  { code: "tax_diff", label: "差额税费", accounting_layer: "operating", business_forms: ["agent", "wholesale"], default_stage: "sold", is_pair: false,
    formula: "卖房佣金差额 + 个税 + 卖方税费" },

  // —— 融资成本 ——
  { code: "project_profit", label: "项目分润", accounting_layer: "finance", business_forms: ["agent", "wholesale"], default_stage: "sold", is_pair: false,
    formula: "融资方利润分成" },

  // —— 其他收入（进损益，非主业收入）——
  { code: "other_income", label: "他项收入", accounting_layer: "other_income", business_forms: ["agent", "wholesale"], default_stage: "ending", is_pair: false,
    formula: "非主业收入" },

  // —— 配对核销（不进损益）——
  { code: "bond", label: "履约保证金", accounting_layer: "pair", business_forms: ["agent"], default_stage: "signing", is_pair: true,
    pair_note: "签约时缴纳 ⇄ 已售时退回" },
  { code: "advance", label: "暂支款", accounting_layer: "pair", business_forms: ["agent", "wholesale"], default_stage: "renovation", is_pair: true,
    pair_note: "装修时垫付 ⇄ 已售时核销收回" },

  // —— 融资往来（本金，不进损益）——
  { code: "investment", label: "项目投资款", accounting_layer: "financing", business_forms: ["agent", "wholesale"], default_stage: "signing", is_pair: true,
    pair_note: "签约时收入 ⇄ 已售时还本" },

  // —— 兜底 ——
  { code: "settlement_diff", label: "结算差额", accounting_layer: "settlement", business_forms: ["agent", "wholesale"], default_stage: "ending", is_pair: false,
    formula: "极端兜底平账，只出不进" },
];

// ── 子项：归属科目 + 节点 ──
// 字段：id / parent_code / stage / name / is_system / is_active / sort_order
var SUBCATEGORIES = [
  // 装修类（renovation 节点）—— agent + wholesale 共用
  { id: 101, parent_code: "renovation", stage: "renovation", name: "设计费", is_system: true, is_active: true, sort_order: 10 },
  { id: 102, parent_code: "renovation", stage: "renovation", name: "装修款", is_system: true, is_active: true, sort_order: 20 },
  { id: 103, parent_code: "renovation", stage: "renovation", name: "软装采购", is_system: true, is_active: true, sort_order: 30 },
  { id: 104, parent_code: "renovation", stage: "renovation", name: "定制柜", is_system: true, is_active: true, sort_order: 40 },
  { id: 105, parent_code: "renovation", stage: "renovation", name: "灯具", is_system: false, is_active: true, sort_order: 50 }, // 业务新增
  { id: 106, parent_code: "renovation", stage: "renovation", name: "窗户", is_system: false, is_active: false, sort_order: 60 }, // 业务新增（已停用）

  // 营销类（listing 节点）—— agent + wholesale 共用
  { id: 110, parent_code: "marketing", stage: "listing", name: "推广费", is_system: true, is_active: true, sort_order: 10 },
  { id: 111, parent_code: "marketing", stage: "listing", name: "销售额外激励", is_system: true, is_active: true, sort_order: 20 },
  { id: 112, parent_code: "marketing", stage: "listing", name: "营销其他", is_system: true, is_active: true, sort_order: 30 },

  // 差额税费（sold 节点）—— 子项视业务形式而定
  { id: 120, parent_code: "tax_diff", stage: "sold", name: "卖房佣金差额", is_system: true, is_active: true, sort_order: 10 },
  { id: 121, parent_code: "tax_diff", stage: "sold", name: "个税", is_system: true, is_active: true, sort_order: 20 },
  { id: 122, parent_code: "tax_diff", stage: "sold", name: "卖方税费", is_system: true, is_active: true, sort_order: 30 }, // wholesale 专用

  // 购房款（signing 节点，wholesale 专用）—— 6 项取得成本，已含于售房差额
  { id: 130, parent_code: "purchase_price", stage: "signing", name: "购房定金", is_system: true, is_active: true, sort_order: 10 },
  { id: 131, parent_code: "purchase_price", stage: "signing", name: "购房首付", is_system: true, is_active: true, sort_order: 20 },
  { id: 132, parent_code: "purchase_price", stage: "signing", name: "购房尾款", is_system: true, is_active: true, sort_order: 30 },
  { id: 133, parent_code: "purchase_price", stage: "signing", name: "购房贷款差额", is_system: true, is_active: true, sort_order: 40 },
  { id: 134, parent_code: "purchase_price", stage: "signing", name: "购房交易税费", is_system: true, is_active: true, sort_order: 50 },
  { id: 135, parent_code: "purchase_price", stage: "signing", name: "购房名额使用费", is_system: true, is_active: true, sort_order: 60 },

  // 收房佣金（signing 节点，agent 专用）
  { id: 140, parent_code: "acquisition_commission", stage: "signing", name: "渠道佣金", is_system: true, is_active: true, sort_order: 10 },

  // 履约保证金（signing 节点，配对）—— agent 专用
  { id: 150, parent_code: "bond", stage: "signing", name: "保证金缴纳", is_system: true, is_active: true, sort_order: 10 },
  { id: 151, parent_code: "bond", stage: "sold", name: "保证金退回", is_system: true, is_active: true, sort_order: 20 },

  // 暂支款（垫付在装修节点，核销在已售节点，配对）—— agent + wholesale 共用
  { id: 160, parent_code: "advance", stage: "renovation", name: "暂支款垫付", is_system: true, is_active: true, sort_order: 10 },
  { id: 161, parent_code: "advance", stage: "sold", name: "暂支款核销", is_system: true, is_active: true, sort_order: 20 },

  // 项目投资款（signing 节点，融资往来）—— agent + wholesale 共用
  { id: 170, parent_code: "investment", stage: "signing", name: "投资款收入", is_system: true, is_active: true, sort_order: 10 },
  { id: 171, parent_code: "investment", stage: "sold", name: "投资款还本", is_system: true, is_active: true, sort_order: 20 },
];

// ── 业务形式标签 ──
var BUSINESS_FORM_LABEL = { agent: "代理美化", wholesale: "收购美化" };

// ── 工具函数 ──

// 按业务形式过滤科目
function subjectsByForm(form) {
  return SUBJECTS.filter((s) => s.business_forms.includes(form));
}

// 按算账层级分组
function groupSubjectsByLayer(subjects) {
  const groups = {};
  for (const layer of ACCOUNTING_LAYERS) groups[layer.code] = [];
  for (const sub of subjects) {
    if (!groups[sub.accounting_layer]) groups[sub.accounting_layer] = [];
    groups[sub.accounting_layer].push(sub);
  }
  return groups;
}

// 获取科目下所有子项（按业务形式 + 节点过滤）
function subcategoriesOf(parentCode, form, stage) {
  const parent = SUBJECTS.find((s) => s.code === parentCode);
  if (!parent) return [];
  if (form && !parent.business_forms.includes(form)) return [];
  return SUBCATEGORIES.filter(
    (s) => s.parent_code === parentCode && s.is_active && (!stage || s.stage === stage)
  ).sort((a, b) => a.sort_order - b.sort_order);
}

// 获取科目在所有节点上的子项分布（用于流程图）
function subcategoryDistribution(parentCode, form) {
  const parent = SUBJECTS.find((s) => s.code === parentCode);
  if (!parent) return [];
  const stages = STAGES[form] || [];
  return stages.map((st) => ({
    stage: st.code,
    stage_label: st.label,
    items: SUBCATEGORIES.filter(
      (s) => s.parent_code === parentCode && s.stage === st.code && s.is_active
    ).sort((a, b) => a.sort_order - b.sort_order),
  }));
}

// 金额格式化（万元）
function formatMoney(amount, withSign = false) {
  const sign = withSign && amount > 0 ? "+" : "";
  const abs = Math.abs(amount);
  let str;
  if (abs >= 10000) {
    str = "¥" + (abs / 10000).toFixed(2) + " 万";
  } else {
    str = "¥" + abs.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return sign + str;
}

// 金额格式化（带正负号）
function formatSignedMoney(amount) {
  if (amount === 0) return "¥0.00";
  const sign = amount > 0 ? "+" : "-";
  return sign + "¥" + Math.abs(amount).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 获取科目对象
function getSubject(code) {
  return SUBJECTS.find((s) => s.code === code) || null;
}

// 获取算账层级对象
function getLayer(code) {
  return ACCOUNTING_LAYERS.find((l) => l.code === code) || null;
}

// 获取节点对象
function getStage(code, form) {
  const stages = STAGES[form] || [];
  return stages.find((s) => s.code === code) || null;
}
