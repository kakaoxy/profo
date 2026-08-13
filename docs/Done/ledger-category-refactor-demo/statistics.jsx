// ===========================================================
// Page 02 — 统计卡片：完整复刻 docs/ledger-cashflow-dashboard
// 对应 plan §6.5 统计卡片迭代目标
// 结构：Hero + 8 KPI + 利润三层结构 + 明细表 + 4 阶段时间轴 + 图例 + 说明
// 数据：与 docs/ledger-cashflow-dashboard/index.html 一致（agent / wholesale 双模式）
// ===========================================================

const { useState } = React;

// ── 格式化（与 cashflow-dashboard 一致）──
function fmt(n) {
  if (Math.abs(n) >= 10000) return "¥" + (n / 10000).toFixed(2) + "万";
  return "¥" + n.toFixed(2);
}
function fmtPct(n) {
  return (n * 100).toFixed(2) + "%";
}

// ── 模拟数据：代理美化（业主底价 300 万，卖出 380 万）──
const agentData = {
  meta: {
    project: "浦东 · 仁恒河滨城",
    stage: "已售",
    days: 240,
    bizLabel: "代理美化",
  },
  kpi: {
    totalExpense: 722600,   // 72.26万 - 全周期支出
    initial: 595000,        // 59.50万 - 前期投入（保证金5 + 佣金3 + 装修43 + 营销8.5）
    gross: 340000,          // 34.00万 - 毛利
    net: 127400,            // 12.74万 - 净利
    income: 800000,         // 80.00万 - 增值服务费
    days: 240,
    roi: 0.2141,            // 21.41%
    annual: 0.3256,         // 32.56%
  },
  ladder: {
    l1: { title: "增值服务费", formula: "= 卖出价 − 业主底价<br>= 380万 − 300万", value: 800000 },
    l2: { formula: "= 收入 − 收房佣金 − 装修类<br>= 80 − 3 − 43", value: 340000 },
    l3: { formula: "= 34 − 15.80 − 5.46", value: 127400 },
  },
  breakdown: [
    { layer: "① 收入", item: "增值服务费", formula: "卖出价 − 业主底价 = 380 − 300", amount: 800000, type: "in" },
    { layer: "② 毛利扣减", item: "收房佣金", formula: "签约渠道佣金（含线索+签约成本）", amount: -30000, type: "out" },
    { layer: "② 毛利扣减", item: "装修类", formula: "设计费 8 + 装修款 25 + 软装采购 10", amount: -430000, type: "out" },
    { layer: "毛利", item: "毛利 = 收入 − 直接成本", formula: "80 − 3 − 43", amount: 340000, type: "in", isTotal: true },
    { layer: "③ 运营费用", item: "营销类", formula: "推广 4.5 + 销售额外激励 2.5 + 营销其他 1.5", amount: -85000, type: "out" },
    { layer: "③ 运营费用", item: "营销推广费", formula: "卖出价 × 0.5% = 380 × 0.5%", amount: -19000, type: "out" },
    { layer: "③ 运营费用", item: "运营服务费", formula: "卖出价 × 1% = 380 × 1%", amount: -38000, type: "out" },
    { layer: "③ 运营费用", item: "差额税费", formula: "卖房佣金差额 差价×1% + 个税 差价×1% = 0.8 + 0.8", amount: -16000, type: "out" },
    { layer: "③ 融资成本", item: "项目分润", formula: "融资方利润分成（净利 30%）", amount: -54600, type: "finance" },
    { layer: "净利润", item: "净利 = 毛利 − 运营费用 − 融资成本", formula: "34 − 15.80 − 5.46", amount: 127400, type: "in", isTotal: true },
  ],
  stages: [
    {
      key: "signing", icon: "✍️", name: "签约", sub: "阶段一 · 资金注入",
      flows: [
        { type: "finance", label: "项目投资款收入", amount: 3500000 },
        { type: "out", label: "履约保证金", amount: -50000, note: "可退" },
        { type: "out", label: "收房佣金", amount: -30000, note: "含线索+签约" },
      ],
    },
    {
      key: "renovation", icon: "🔨", name: "装修", sub: "阶段二 · 改造投入",
      flows: [
        { type: "out", label: "设计费", amount: -80000 },
        { type: "out", label: "装修款", amount: -250000 },
        { type: "out", label: "软装采购", amount: -100000 },
        { type: "pair", label: "暂支款（垫付）", amount: -200000, note: "⇄ 核销" },
      ],
    },
    {
      key: "listing", icon: "🏷️", name: "在售", sub: "阶段三 · 营销推广",
      flows: [
        { type: "out", label: "推广费用", amount: -45000 },
        { type: "out", label: "销售额外激励", amount: -25000 },
        { type: "out", label: "营销支出（其他）", amount: -15000 },
        { type: "pair", label: "暂支款核销", amount: 200000, note: "⇄ 收回" },
      ],
    },
    {
      key: "sold", icon: "✅", name: "已售", sub: "阶段四 · 收入实现",
      flows: [
        { type: "in", label: "增值服务费 ★", amount: 800000, note: "380 − 300" },
        { type: "out", label: "运营服务费", amount: -38000, note: "380 × 1%" },
        { type: "out", label: "营销推广费", amount: -19000, note: "380 × 0.5%" },
        { type: "out", label: "卖房佣金差额", amount: -8000, note: "差价 × 1%" },
        { type: "out", label: "个税", amount: -8000, note: "差价 × 1%" },
        { type: "pair", label: "业主保证金回退", amount: 50000, note: "⇄ 退回" },
        { type: "finance", label: "投资款支出（还本）", amount: -3500000 },
        { type: "finance", label: "项目分润", amount: -54600 },
      ],
    },
  ],
};

// ── 模拟数据：收购美化（买进 500 万，卖出 650 万）──
const wholesaleData = {
  meta: {
    project: "徐汇 · 尚海湾豪庭",
    stage: "已售",
    days: 360,
    bizLabel: "收购美化",
  },
  kpi: {
    totalExpense: 2967500,  // 296.75万 - 全周期支出（含购房自有资金+运营+融资）
    initial: 2720000,        // 272万 - 前期投入（购房自有支出+装修+营销）
    gross: 400000,           // 40万 - 毛利
    net: 82500,              // 8.25万 - 净利
    income: 900000,          // 90万 - 售房差额
    days: 360,
    roi: 0.0303,             // 3.03%
    annual: 0.0461,          // 4.61%
  },
  ladder: {
    l1: { title: "售房差额", formula: "= 卖出价 − 买进总成本<br>= 650 − (500 + 月供利息 40 + 税费 15 + 名额费 5)", value: 900000 },
    l2: { formula: "= 收入 − 购房佣金 − 售房佣金 − 装修类<br>= 90 − 5 − 5 − 40", value: 400000 },
    l3: { formula: "= 40 − 19.75 − 12.00", value: 82500 },
  },
  breakdown: [
    { layer: "① 收入", item: "售房差额", formula: "卖出价 − 买进总成本（含月供利息）", amount: 900000, type: "in" },
    { layer: "② 毛利扣减", item: "购房佣金", formula: "购房渠道佣金", amount: -50000, type: "out" },
    { layer: "② 毛利扣减", item: "售房佣金", formula: "差额部分售房佣金", amount: -50000, type: "out" },
    { layer: "② 毛利扣减", item: "装修类", formula: "设计费 10 + 装修款 30", amount: -400000, type: "out" },
    { layer: "毛利", item: "毛利 = 收入 − 直接成本", formula: "90 − 5 − 5 − 40", amount: 400000, type: "in", isTotal: true },
    { layer: "③ 运营费用", item: "营销类", formula: "推广 4 + 销售额外激励 2 + 营销其他 1", amount: -70000, type: "out" },
    { layer: "③ 运营费用", item: "营销推广费", formula: "卖出价 × 0.5% = 650 × 0.5%", amount: -32500, type: "out" },
    { layer: "③ 运营费用", item: "运营服务费", formula: "卖出价 × 1% = 650 × 1%", amount: -65000, type: "out" },
    { layer: "③ 运营费用", item: "差额税费", formula: "公司承担卖方税费（代持个人=代理中的业主）", amount: -30000, type: "out" },
    { layer: "③ 融资成本", item: "项目分润", formula: "融资方利润分成", amount: -120000, type: "finance" },
    { layer: "净利润", item: "净利 = 毛利 − 运营费用 − 融资成本", formula: "40 − 19.75 − 12.00", amount: 82500, type: "in", isTotal: true },
  ],
  stages: [
    {
      key: "signing", icon: "🏦", name: "签约/买入", sub: "阶段一 · 产权登记至个人",
      flows: [
        { type: "finance", label: "项目投资款收入", amount: 5000000 },
        { type: "out", label: "购房定金", amount: -200000 },
        { type: "out", label: "购房首付", amount: -1500000 },
        { type: "out", label: "购房尾款", amount: -300000 },
        { type: "out", label: "购房贷款差额", amount: 0, note: "已含于贷款" },
        { type: "out", label: "购房交易税费", amount: -150000 },
        { type: "out", label: "购房名额使用费", amount: -50000 },
        { type: "out", label: "购房佣金", amount: -50000 },
      ],
    },
    {
      key: "holding", icon: "📆", name: "持有期", sub: "阶段二 · 按揭持有",
      flows: [
        { type: "out", label: "月供利息", amount: -400000, note: "已含于差额" },
      ],
    },
    {
      key: "renovation", icon: "🔨", name: "装修", sub: "阶段三 · 改造投入",
      flows: [
        { type: "out", label: "设计费", amount: -100000 },
        { type: "out", label: "装修款", amount: -300000 },
        { type: "pair", label: "暂支款（垫付）", amount: -100000, note: "⇄ 核销" },
      ],
    },
    {
      key: "sold", icon: "✅", name: "已售", sub: "阶段四 · 差额回收",
      flows: [
        { type: "in", label: "售房差额 ★", amount: 900000, note: "650 − 560" },
        { type: "out", label: "差额税费", amount: -30000, note: "含卖方税费" },
        { type: "out", label: "营销推广费", amount: -32500, note: "650 × 0.5%" },
        { type: "out", label: "运营服务费", amount: -65000, note: "650 × 1%" },
        { type: "pair", label: "暂支款核销", amount: 100000, note: "⇄ 收回" },
        { type: "finance", label: "投资款支出（还本）", amount: -5000000 },
        { type: "finance", label: "项目分润", amount: -120000 },
      ],
    },
  ],
};

// ── KPI 卡 ──
function KpiCard({ label, value, suffix, warm, accent }) {
  return React.createElement(
    "div",
    { className: "cfd-kpi-card" + (warm ? " warm" : "") },
    React.createElement("p", { className: "cfd-kpi-label" }, label),
    React.createElement(
      "p",
      { className: "cfd-kpi-value tabular-nums" + (accent ? " accent-rust" : "") },
      value,
      suffix ? React.createElement("span", { className: "cfd-kpi-suffix" }, suffix) : null
    )
  );
}

// ── 利润三层结构 ──
function ProfitLadder({ ladder }) {
  return React.createElement(
    "div",
    { className: "cfd-profit-ladder" },
    // L1 收入
    React.createElement(
      "div",
      { className: "cfd-ladder-card l1" },
      React.createElement(
        "div",
        { className: "cfd-ladder-step" },
        React.createElement("span", { className: "num" }, "1"),
        "收入层"
      ),
      React.createElement("h3", { className: "cfd-ladder-title" }, ladder.l1.title),
      React.createElement("p", {
        className: "cfd-ladder-formula",
        dangerouslySetInnerHTML: { __html: ladder.l1.formula },
      }),
      React.createElement("p", { className: "cfd-ladder-value tabular-nums" }, fmt(ladder.l1.value))
    ),
    // L2 毛利
    React.createElement(
      "div",
      { className: "cfd-ladder-card l2" },
      React.createElement(
        "div",
        { className: "cfd-ladder-step" },
        React.createElement("span", { className: "num" }, "2"),
        "毛利层"
      ),
      React.createElement("h3", { className: "cfd-ladder-title" }, "收入 − 直接成本"),
      React.createElement("p", {
        className: "cfd-ladder-formula",
        dangerouslySetInnerHTML: { __html: ladder.l2.formula },
      }),
      React.createElement("p", { className: "cfd-ladder-value tabular-nums" }, fmt(ladder.l2.value))
    ),
    // L3 净利
    React.createElement(
      "div",
      { className: "cfd-ladder-card l3" },
      React.createElement(
        "div",
        { className: "cfd-ladder-step" },
        React.createElement("span", { className: "num" }, "3"),
        "净利层"
      ),
      React.createElement("h3", { className: "cfd-ladder-title" }, "毛利 − 运营费用 − 融资成本"),
      React.createElement("p", {
        className: "cfd-ladder-formula",
        dangerouslySetInnerHTML: { __html: ladder.l3.formula },
      }),
      React.createElement("p", { className: "cfd-ladder-value tabular-nums" }, fmt(ladder.l3.value))
    )
  );
}

// ── 利润计算明细表 ──
function BreakdownTable({ rows }) {
  return React.createElement(
    "div",
    { className: "cfd-breakdown" },
    React.createElement("p", { className: "cfd-breakdown-title" }, "利润计算明细 · 与 HTML 财务逻辑一致"),
    React.createElement(
      "table",
      { className: "cfd-breakdown-table" },
      React.createElement(
        "thead",
        null,
        React.createElement(
          "tr",
          null,
          React.createElement("th", null, "层级"),
          React.createElement("th", null, "科目"),
          React.createElement("th", null, "计算公式"),
          React.createElement("th", { className: "amount" }, "金额")
        )
      ),
      React.createElement(
        "tbody",
        null,
        rows.map((row, idx) => {
          const sign = row.amount >= 0 ? "+" : "−";
          const abs = Math.abs(row.amount);
          return React.createElement(
            "tr",
            { key: idx, className: row.isTotal ? "total" : "" },
            React.createElement("td", { style: { color: "var(--ash)", fontSize: 12 } }, row.layer),
            React.createElement("td", null, row.item),
            React.createElement(
              "td",
              { style: { color: "var(--graphite)", fontSize: 12, fontFamily: "ui-monospace, monospace" } },
              row.formula
            ),
            React.createElement(
              "td",
              { className: "amount " + row.type },
              sign, " ", fmt(abs)
            )
          );
        })
      )
    )
  );
}

// ── 阶段时间轴 ──
function Timeline({ stages }) {
  return React.createElement(
    "div",
    { className: "cfd-timeline" },
    stages.map((stage, idx) => {
      const visibleFlows = stage.flows.filter((f) => f.amount !== 0);
      const net = stage.flows.reduce((sum, f) => sum + (f.amount || 0), 0);
      const netCls = net >= 0 ? "pos" : "neg";
      const netSign = net >= 0 ? "+" : "−";
      const stageCls = "cfd-stage-" + (idx + 1);

      return React.createElement(
        "div",
        { key: stage.key, className: "cfd-stage " + stageCls },
        React.createElement("div", { className: "cfd-stage-marker" }, stage.icon),
        React.createElement("p", { className: "cfd-stage-name" }, stage.name),
        React.createElement("p", { className: "cfd-stage-sub" }, stage.sub),
        React.createElement(
          "div",
          { className: "cfd-stage-card" },
          visibleFlows.length === 0
            ? React.createElement(
                "div",
                { style: { color: "var(--ash)", fontSize: 12, textAlign: "center", padding: "20px 0" } },
                "无现金流"
              )
            : visibleFlows.map((f, i) =>
                React.createElement(
                  "div",
                  { key: i, className: "cfd-flow-row " + f.type },
                  React.createElement(
                    "div",
                    { className: "label" },
                    React.createElement("span", { className: "dot" }),
                    React.createElement("span", null, f.label),
                    f.note
                      ? React.createElement(
                          "span",
                          { style: { fontSize: 11, color: "var(--ash)", marginLeft: 4 } },
                          f.note
                        )
                      : null
                  ),
                  React.createElement(
                    "div",
                    { className: "amount" },
                    f.amount >= 0 ? "+" : "−",
                    " ",
                    fmt(Math.abs(f.amount))
                  )
                )
              ),
          React.createElement(
            "div",
            { className: "cfd-stage-summary" },
            React.createElement("span", { className: "lbl" }, "阶段净额"),
            React.createElement(
              "span",
              { className: "val " + netCls },
              netSign, " ", fmt(Math.abs(net))
            )
          )
        )
      );
    })
  );
}

// ── App ──
function App() {
  const [mode, setMode] = useState("agent");
  const data = mode === "agent" ? agentData : wholesaleData;

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(TopNav, { activeKey: "statistics" }),
    // —— Hero + 业务模式切换 ——
    React.createElement(
      "main",
      null,
      React.createElement(
        "section",
        { className: "cfd-hero" },
        React.createElement(
          "div",
          { className: "page", style: { maxWidth: 1200 } },
          React.createElement(
            "div",
            { style: { display: "flex", justifyContent: "flex-end", marginBottom: 24 } },
            React.createElement(
              "div",
              { className: "mode-switch", role: "tablist", "aria-label": "业务模式切换" },
              React.createElement(
                "button",
                {
                  className: "mode-btn agent" + (mode === "agent" ? " active" : ""),
                  role: "tab",
                  "aria-selected": mode === "agent",
                  onClick: () => setMode("agent"),
                },
                React.createElement("span", { className: "mode-dot" }),
                "代理美化"
              ),
              React.createElement(
                "button",
                {
                  className: "mode-btn wholesale" + (mode === "wholesale" ? " active" : ""),
                  role: "tab",
                  "aria-selected": mode === "wholesale",
                  onClick: () => setMode("wholesale"),
                },
                React.createElement("span", { className: "mode-dot" }),
                "收购美化"
              )
            )
          ),
          React.createElement("h1", { className: "font-display" }, "项目资金账本"),
          React.createElement("p", { className: "sub" }, "全周期现金流量表 · 财务数据实时追踪与统计分析"),
          React.createElement(
            "div",
            { className: "cfd-hero-meta" },
            React.createElement("span", { className: "cfd-meta-chip" }, "📌 ", data.meta.project),
            React.createElement("span", { className: "cfd-meta-chip" }, "📍 阶段：", data.meta.stage),
            React.createElement("span", { className: "cfd-meta-chip" }, "⏱ 资金占用 ", data.meta.days, " 天")
          ),
          // —— KPI 网格 ——
          React.createElement(
            "div",
            { className: "cfd-kpi-grid" },
            // Row 1: warm
            React.createElement(KpiCard, { label: "项目总支出", value: fmt(data.kpi.totalExpense), warm: true, accent: true }),
            React.createElement(KpiCard, { label: "项目前期投入", value: fmt(data.kpi.initial), warm: true, accent: true }),
            React.createElement(KpiCard, { label: "项目毛利", value: fmt(data.kpi.gross), warm: true }),
            React.createElement(KpiCard, { label: "项目净利", value: fmt(data.kpi.net), warm: true }),
            // Row 2: white
            React.createElement(KpiCard, { label: "项目收入", value: fmt(data.kpi.income), accent: true }),
            React.createElement(KpiCard, { label: "资金占用时间", value: data.kpi.days, suffix: "天" }),
            React.createElement(KpiCard, { label: "投资回报率", value: fmtPct(data.kpi.roi) }),
            React.createElement(KpiCard, { label: "年化回报率", value: fmtPct(data.kpi.annual) })
          )
        )
      ),
      // —— Section 1: 利润三层结构 ——
      React.createElement(
        "section",
        { className: "cfd-section white" },
        React.createElement(
          "div",
          { className: "page", style: { maxWidth: 1200 } },
          React.createElement("p", { className: "cfd-section-title" }, "PROFIT STRUCTURE"),
          React.createElement(
            "h2",
            { className: "cfd-section-heading" },
            "利润三层结构",
            React.createElement("span", { className: "cfd-badge" }, "权责发生制")
          ),
          React.createElement(ProfitLadder, { ladder: data.ladder }),
          React.createElement(BreakdownTable, { rows: data.breakdown })
        )
      ),
      // —— Section 2: 全周期阶段现金流时间轴 ——
      React.createElement(
        "section",
        { className: "cfd-section soft" },
        React.createElement(
          "div",
          { className: "page", style: { maxWidth: 1200 } },
          React.createElement("p", { className: "cfd-section-title" }, "PROJECT LIFECYCLE CASHFLOW"),
          React.createElement(
            "h2",
            { className: "cfd-section-heading" },
            "全周期阶段现金流量表",
            React.createElement("span", { className: "cfd-badge" }, "4 阶段")
          ),
          React.createElement(Timeline, { stages: data.stages }),
          React.createElement(
            "div",
            { className: "cfd-legend" },
            React.createElement(
              "div",
              { className: "cfd-legend-item" },
              React.createElement("span", { className: "cfd-legend-dot in" }),
              "流入（收入 / 配对回退 / 融资流入）"
            ),
            React.createElement(
              "div",
              { className: "cfd-legend-item" },
              React.createElement("span", { className: "cfd-legend-dot out" }),
              "流出（支出 / 税费）"
            ),
            React.createElement(
              "div",
              { className: "cfd-legend-item" },
              React.createElement("span", { className: "cfd-legend-dot pair" }),
              "配对核销（净额归零，不进损益）"
            ),
            React.createElement(
              "div",
              { className: "cfd-legend-item" },
              React.createElement("span", { className: "cfd-legend-dot finance" }),
              "融资往来（本金往来不进损益）"
            )
          ),
          React.createElement(
            "div",
            { className: "cfd-footer-note" },
            React.createElement("strong", null, "💡 设计说明："),
            "本看板按项目全周期现金流呈现，与 ",
            React.createElement("code", null, "docs/profocw.html"),
            " 财务逻辑一致。",
            React.createElement("br", null),
            "① 收入层在已售阶段实现（增值服务费 / 售房差额），毛利层扣减佣金与装修，净利层扣减运营费用、融资成本与差额税费。",
            React.createElement("br", null),
            "② ",
            React.createElement("strong", null, "履约保证金 ⇄ 业主保证金回退"),
            "、",
            React.createElement("strong", null, "暂支款 ⇄ 暂支款核销"),
            " 为配对核销项，净额归零，不进损益。",
            React.createElement("br", null),
            "③ ",
            React.createElement("strong", null, "投资款本金"),
            "为资产负债往来，不进损益；仅 ",
            React.createElement("strong", null, "项目分润"),
            " 作为融资成本扣减。",
            React.createElement("br", null),
            "④ 收购美化中，",
            React.createElement("strong", null, "月供利息"),
            '作为取得成本内化于「售房差额」公式；首付资金机会成本在跟投逻辑中计算，不在项目中体现。'
          )
        )
      )
    )
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
