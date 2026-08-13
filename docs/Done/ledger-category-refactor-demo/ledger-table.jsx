// ===========================================================
// Page 04 — 流水表格：科目 + 节点 两级筛选联动
// 对应 plan §6.3 流水表格调整（按新三层模型重写）
// 筛选：算账层级(可选) → 科目 → 节点 → 子项
// ===========================================================

const { useState, useMemo, useEffect } = React;
const { ACCOUNTING_LAYERS, STAGES, BUSINESS_FORM_LABEL, subjectsByForm, groupSubjectsByLayer, subcategoriesOf, subcategoryDistribution, getSubject, getLayer, getStage, formatMoney } = window;

// ── 模拟流水数据 ──
// 字段：subject_code / subject_label / accounting_layer / stage / subcategory_id / subcategory_name / receipt_urls
const RC = (n) => Array.from({ length: n }, (_, i) => "/uploads/receipts/r_" + (1000 + i) + ".jpg");
const LEDGER_RECORDS = [
  // 装修类 / 装修 节点
  { id: "L-2026-0726-01", type: "expense", subject_code: "renovation", subject_label: "装修类", accounting_layer: "direct_cost", stage: "renovation", subcategory_id: 102, subcategory_name: "装修款", amount: 80000, date: "2026-07-24", counterparty: "上海XX建材", operator: "张三", receipt_urls: RC(2) },
  { id: "L-2026-0726-02", type: "expense", subject_code: "renovation", subject_label: "装修类", accounting_layer: "direct_cost", stage: "renovation", subcategory_id: 105, subcategory_name: "灯具", amount: 6800, date: "2026-07-18", counterparty: "欧普照明", operator: "张三", receipt_urls: RC(1) },
  { id: "L-2026-0726-03", type: "expense", subject_code: "renovation", subject_label: "装修类", accounting_layer: "direct_cost", stage: "renovation", subcategory_id: 101, subcategory_name: "设计费", amount: 8000, date: "2026-07-15", counterparty: "设计工作室", operator: "张三", receipt_urls: null },
  { id: "L-2026-0726-04", type: "expense", subject_code: "renovation", subject_label: "装修类", accounting_layer: "direct_cost", stage: "renovation", subcategory_id: 103, subcategory_name: "软装采购", amount: 60000, date: "2026-07-12", counterparty: "顾家家居", operator: "李四", receipt_urls: RC(3) },
  { id: "L-2026-0726-05", type: "expense", subject_code: "renovation", subject_label: "装修类", accounting_layer: "direct_cost", stage: "renovation", subcategory_id: 104, subcategory_name: "定制柜", amount: 39000, date: "2026-07-10", counterparty: "索菲亚", operator: "李四", receipt_urls: RC(1) },
  // 收房佣金 / 签约 节点
  { id: "L-2026-0726-06", type: "expense", subject_code: "acquisition_commission", subject_label: "收房佣金", accounting_layer: "direct_cost", stage: "signing", subcategory_id: 140, subcategory_name: "渠道佣金", amount: 8000, date: "2026-06-20", counterparty: "贝壳渠道", operator: "王五", receipt_urls: null },
  // 营销类 / 在售 节点
  { id: "L-2026-0726-07", type: "expense", subject_code: "marketing", subject_label: "营销类", accounting_layer: "operating", stage: "listing", subcategory_id: 110, subcategory_name: "推广费", amount: 18000, date: "2026-07-22", counterparty: "贝壳找房", operator: "王五", receipt_urls: RC(1) },
  { id: "L-2026-0726-08", type: "expense", subject_code: "marketing", subject_label: "营销类", accounting_layer: "operating", stage: "listing", subcategory_id: 111, subcategory_name: "销售额外激励", amount: 12000, date: "2026-07-20", counterparty: "中介小张", operator: "王五", receipt_urls: null },
  { id: "L-2026-0726-09", type: "expense", subject_code: "marketing", subject_label: "营销类", accounting_layer: "operating", stage: "listing", subcategory_id: 112, subcategory_name: "营销其他", amount: 12000, date: "2026-07-15", counterparty: "抖音广告", operator: "王五", receipt_urls: null },
  // 差额税费 / 已售 节点
  { id: "L-2026-0726-10", type: "expense", subject_code: "tax_diff", subject_label: "差额税费", accounting_layer: "operating", stage: "sold", subcategory_id: 120, subcategory_name: "卖房佣金差额", amount: 13150, date: "2026-07-08", counterparty: "—", operator: "李四", receipt_urls: RC(1) },
  { id: "L-2026-0726-11", type: "expense", subject_code: "tax_diff", subject_label: "差额税费", accounting_layer: "operating", stage: "sold", subcategory_id: 121, subcategory_name: "个税", amount: 10000, date: "2026-07-08", counterparty: "税务", operator: "李四", receipt_urls: null },
  // 营销推广费 / 已售 节点
  { id: "L-2026-0726-12", type: "expense", subject_code: "marketing_fee", subject_label: "营销推广费", accounting_layer: "operating", stage: "sold", subcategory_id: null, subcategory_name: null, amount: 1750, date: "2026-07-08", counterparty: "贝壳", operator: "李四", receipt_urls: null },
  // 运营服务费 / 已售 节点
  { id: "L-2026-0726-13", type: "expense", subject_code: "operation_fee", subject_label: "运营服务费", accounting_layer: "operating", stage: "sold", subcategory_id: null, subcategory_name: null, amount: 3500, date: "2026-07-08", counterparty: "—", operator: "李四", receipt_urls: null },
  // 增值服务费 / 已售 节点（收入）
  { id: "L-2026-0726-14", type: "income", subject_code: "value_added_fee", subject_label: "增值服务费", accounting_layer: "revenue", stage: "sold", subcategory_id: null, subcategory_name: null, amount: 350000, date: "2026-07-20", counterparty: "业主王某", operator: "王五", receipt_urls: RC(2) },
  // 履约保证金 / 签约 节点（配对 - 缴纳）
  { id: "L-2026-0726-15", type: "expense", subject_code: "bond", subject_label: "履约保证金", accounting_layer: "pair", stage: "signing", subcategory_id: 150, subcategory_name: "保证金缴纳", amount: 50000, date: "2026-06-20", counterparty: "业主", operator: "张三", receipt_urls: RC(1) },
  // 履约保证金 / 已售 节点（配对 - 退回）
  { id: "L-2026-0726-16", type: "income", subject_code: "bond", subject_label: "履约保证金", accounting_layer: "pair", stage: "sold", subcategory_id: 151, subcategory_name: "保证金退回", amount: 50000, date: "2026-07-20", counterparty: "—", operator: "王五", receipt_urls: null },
  // 暂支款 / 装修 节点（配对 - 垫付）
  { id: "L-2026-0726-17", type: "expense", subject_code: "advance", subject_label: "暂支款", accounting_layer: "pair", stage: "renovation", subcategory_id: 160, subcategory_name: "暂支款垫付", amount: 20000, date: "2026-07-05", counterparty: "—", operator: "张三", receipt_urls: null },
  // 暂支款 / 已售 节点（配对 - 核销）
  { id: "L-2026-0726-18", type: "income", subject_code: "advance", subject_label: "暂支款", accounting_layer: "pair", stage: "sold", subcategory_id: 161, subcategory_name: "暂支款核销", amount: 20000, date: "2026-07-20", counterparty: "—", operator: "张三", receipt_urls: null },
  // 项目投资款 / 签约 节点（融资 - 收入）
  { id: "L-2026-0726-19", type: "income", subject_code: "investment", subject_label: "项目投资款", accounting_layer: "financing", stage: "signing", subcategory_id: 170, subcategory_name: "投资款收入", amount: 300000, date: "2026-06-18", counterparty: "融资方", operator: "王五", receipt_urls: null },
  // 项目投资款 / 已售 节点（融资 - 还本）
  { id: "L-2026-0726-20", type: "expense", subject_code: "investment", subject_label: "项目投资款", accounting_layer: "financing", stage: "sold", subcategory_id: 171, subcategory_name: "投资款还本", amount: 300000, date: "2026-07-20", counterparty: "融资方", operator: "王五", receipt_urls: null },
  // 项目分润 / 已售 节点（融资成本）
  { id: "L-2026-0726-21", type: "expense", subject_code: "project_profit", subject_label: "项目分润", accounting_layer: "finance", stage: "sold", subcategory_id: null, subcategory_name: null, amount: 30000, date: "2026-07-20", counterparty: "融资方", operator: "王五", receipt_urls: null },
];

// ── 自定义 Select（模拟 shadcn Select）──
function Select({ value, onChange, options, placeholder, disabled, style }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onDocClick() { setOpen(false); }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  return React.createElement(
    "div",
    { className: "select", style: { position: "relative", padding: 0, border: "none", ...style } },
    React.createElement(
      "button",
      {
        type: "button",
        disabled: disabled,
        onClick: (e) => { e.stopPropagation(); if (!disabled) setOpen(!open); },
        style: {
          width: "100%",
          textAlign: "left",
          padding: "8px 12px",
          background: "#fff",
          border: "1px solid " + (disabled ? "var(--line)" : "var(--line-2)"),
          borderRadius: 8,
          fontSize: 13,
          color: selected ? "var(--ink)" : "var(--ash)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        },
      },
      React.createElement("span", null, selected ? selected.label : placeholder),
      React.createElement("span", { style: { fontSize: 10, color: "var(--ash)" } }, open ? "▲" : "▼")
    ),
    open && !disabled
      ? React.createElement(
          "div",
          {
            style: {
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              background: "#fff",
              border: "1px solid var(--line-2)",
              borderRadius: 8,
              boxShadow: "var(--shadow-pop)",
              zIndex: 20,
              maxHeight: 320,
              overflowY: "auto",
            },
            onClick: (e) => e.stopPropagation(),
          },
          options.map((opt, idx) =>
            opt.isGroupHeader
              ? React.createElement(
                  "div",
                  {
                    key: "gh-" + idx,
                    style: {
                      padding: "6px 12px",
                      fontSize: 10.5,
                      color: "var(--ash)",
                      background: "var(--bg-soft)",
                      fontWeight: 600,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                    },
                  },
                  opt.label
                )
              : React.createElement(
                  "div",
                  {
                    key: opt.value || "opt-" + idx,
                    onClick: () => { onChange(opt.value); setOpen(false); },
                    style: {
                      padding: "8px 12px",
                      fontSize: 13,
                      cursor: "pointer",
                      background: opt.value === value ? "var(--bg-warm)" : "#fff",
                      color: opt.value === value ? "var(--rust)" : "var(--ink)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    },
                    onMouseEnter: (e) => { if (opt.value !== value) e.currentTarget.style.background = "var(--bg-soft)"; },
                    onMouseLeave: (e) => { if (opt.value !== value) e.currentTarget.style.background = "#fff"; },
                  },
                  React.createElement("span", null, opt.label),
                  opt.value === value ? React.createElement("span", { style: { color: "var(--rust)", fontSize: 12 } }, "✓") : null,
                  opt.hint ? React.createElement("span", { className: "text-xs text-ash" }, opt.hint) : null
                )
          )
        )
      : null
  );
}

function App() {
  const [businessForm, setBusinessForm] = useState("agent");
  const [layerFilter, setLayerFilter] = useState("all"); // accounting_layer or "all"
  const [subjectFilter, setSubjectFilter] = useState("all"); // subject_code or "all"
  const [stageFilter, setStageFilter] = useState("all"); // stage or "all"
  const [subcategoryFilter, setSubcategoryFilter] = useState("all"); // subcategory_id / "none" / "all"
  const [voucherFilter, setVoucherFilter] = useState("all"); // "all" / "with" / "without"
  const [keyword, setKeyword] = useState("");

  // 当前业务形式下的全部科目和节点
  const subjects = useMemo(() => subjectsByForm(businessForm), [businessForm]);
  const stages = STAGES[businessForm] || [];

  // 按算账层级分组的科目（用于 Select 分组）
  const groupedSubjects = useMemo(() => groupSubjectsByLayer(subjects), [subjects]);

  // 当前选中科目
  const selectedSubject = useMemo(
    () => (subjectFilter !== "all" ? getSubject(subjectFilter) : null),
    [subjectFilter]
  );

  // 当前选中科目在各节点上的子项分布（用于节点 Select 联动）
  const stageOptions = useMemo(() => {
    if (!selectedSubject) return stages.map((s) => ({ value: s.code, label: s.label, hint: s.sub }));
    // 仅展示该科目下有子项的节点
    const dist = subcategoryDistribution(selectedSubject.code, businessForm);
    return dist
      .filter((d) => d.items.length > 0)
      .map((d) => ({
        value: d.stage,
        label: d.stage_label,
        hint: d.items.length + " 个子项",
      }));
  }, [selectedSubject, businessForm, stages]);

  // 当前可选子项列表（联动科目 + 节点）
  const availableSubcategories = useMemo(() => {
    if (!selectedSubject) return [];
    return subcategoriesOf(selectedSubject.code, businessForm, stageFilter === "all" ? null : stageFilter);
  }, [selectedSubject, businessForm, stageFilter]);

  // 切换业务形式时重置所有筛选
  function switchBusinessForm(f) {
    setBusinessForm(f);
    setLayerFilter("all");
    setSubjectFilter("all");
    setStageFilter("all");
    setSubcategoryFilter("all");
    setVoucherFilter("all");
  }

  function switchLayer(layer) {
    setLayerFilter(layer);
    setSubjectFilter("all");
    setStageFilter("all");
    setSubcategoryFilter("all");
  }

  function switchSubject(code) {
    setSubjectFilter(code);
    setStageFilter("all");
    setSubcategoryFilter("all");
  }

  function switchStage(stage) {
    setStageFilter(stage);
    setSubcategoryFilter("all");
  }

  // 过滤流水
  const filteredRecords = useMemo(() => {
    return LEDGER_RECORDS.filter((r) => {
      // 业务形式过滤：流水若不属于当前业务形式，则过滤掉
      const sub = getSubject(r.subject_code);
      if (sub && !sub.business_forms.includes(businessForm)) return false;

      if (layerFilter !== "all" && r.accounting_layer !== layerFilter) return false;
      if (subjectFilter !== "all" && r.subject_code !== subjectFilter) return false;
      if (stageFilter !== "all" && r.stage !== stageFilter) return false;
      if (subcategoryFilter !== "all") {
        if (subcategoryFilter === "none") {
          if (r.subcategory_id !== null) return false;
        } else if (String(r.subcategory_id) !== subcategoryFilter) {
          return false;
        }
      }
      // 票据筛选
      const hasVoucher = !!(r.receipt_urls && r.receipt_urls.length > 0);
      if (voucherFilter === "with" && !hasVoucher) return false;
      if (voucherFilter === "without" && hasVoucher) return false;
      if (keyword.trim()) {
        const kw = keyword.trim().toLowerCase();
        const hay = (
          r.counterparty +
          r.subject_label +
          (r.subcategory_name || "") +
          r.id
        ).toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [businessForm, layerFilter, subjectFilter, stageFilter, subcategoryFilter, voucherFilter, keyword]);

  // 汇总
  const summary = useMemo(() => {
    const expense = filteredRecords.filter((r) => r.type === "expense").reduce((a, r) => a + r.amount, 0);
    const income = filteredRecords.filter((r) => r.type === "income").reduce((a, r) => a + r.amount, 0);
    const withVoucher = filteredRecords.filter((r) => r.receipt_urls && r.receipt_urls.length > 0).length;
    return {
      expense,
      income,
      net: income - expense,
      count: filteredRecords.length,
      withVoucher,
      withoutVoucher: filteredRecords.length - withVoucher,
    };
  }, [filteredRecords]);

  // 构造科目 Select 选项（按算账层级分组）
  const subjectOptions = useMemo(() => {
    const opts = [{ value: "all", label: "全部科目" }];
    for (const layer of ACCOUNTING_LAYERS) {
      const subs = groupedSubjects[layer.code] || [];
      if (subs.length === 0) continue;
      opts.push({ isGroupHeader: true, label: layer.label + "（" + layer.short + "）" });
      for (const sub of subs) {
        opts.push({
          value: sub.code,
          label: sub.label,
          hint: getStage(sub.default_stage, businessForm)?.label || sub.default_stage,
        });
      }
    }
    return opts;
  }, [groupedSubjects, businessForm]);

  // 节点 Select 选项
  const stageSelectOptions = useMemo(() => {
    const opts = [{ value: "all", label: selectedSubject ? "全部节点" : "请先选科目" }];
    if (selectedSubject) {
      opts.push(...stageOptions);
    }
    return opts;
  }, [selectedSubject, stageOptions]);

  // 子项 Select 选项（联动科目 + 节点）
  const subcategoryOptions = useMemo(() => {
    const opts = [{ value: "all", label: selectedSubject ? "全部子项" : "请先选科目" }];
    if (selectedSubject) {
      for (const sub of availableSubcategories) {
        opts.push({
          value: String(sub.id),
          label: sub.name,
          hint: sub.is_system ? "系统" : "业务",
        });
      }
      // 兼容历史流水
      opts.push({ value: "none", label: "（无子项 / 历史流水）" });
    }
    return opts;
  }, [selectedSubject, availableSubcategories]);

  // 算账层级 Select 选项
  const layerOptions = [
    { value: "all", label: "全部层级" },
    ...ACCOUNTING_LAYERS.map((l) => ({ value: l.code, label: l.label, hint: l.short })),
  ];

  // 票据 Select 选项
  const voucherOptions = [
    { value: "all", label: "全部流水" },
    { value: "with", label: "有票据", hint: "已上传" },
    { value: "without", label: "无票据", hint: "待补传" },
  ];

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(TopNav, { activeKey: "ledger" }),
    React.createElement(
      "main",
      { className: "page" },
      React.createElement(PageHeader, {
        eyebrow: "04 · 流水表格",
        title: "科目 + 节点 + 子项：三级筛选联动",
        subtitle:
          "对应 plan §6.3。流水表格筛选项按新三层模型重构：算账层级 → 科目 → 节点 → 子项 三级 Select 联动；行展示科目 + 节点 + 子项。科目框定算账范围，节点框定全周期位置。",
      }),
      React.createElement(
        Callout,
        null,
        "筛选 Select 三级联动：切换业务形式 → 重置全部；切换算账层级 → 重置科目/节点/子项；切换科目 → 重置节点/子项；节点列表仅为该科目下有子项的节点。历史流水（subcategory_id=null）通过「无子项」选项兼容展示。票据筛选（全部 / 有票据 / 无票据）独立于分类筛选，可与任意层级组合。"
      ),
      // 筛选区
      React.createElement(
        "div",
        { className: "card mb-24" },
        React.createElement(
          "div",
          { className: "row wrap", style: { gap: 16 } },
          // 业务形式
          React.createElement(
            "div",
            null,
            React.createElement("label", { className: "label" }, "业务形式"),
            React.createElement(
              "div",
              { className: "mode-switch" },
              React.createElement(
                "button",
                {
                  className: "mode-btn agent" + (businessForm === "agent" ? " active" : ""),
                  onClick: () => switchBusinessForm("agent"),
                },
                "代理"
              ),
              React.createElement(
                "button",
                {
                  className: "mode-btn wholesale" + (businessForm === "wholesale" ? " active" : ""),
                  onClick: () => switchBusinessForm("wholesale"),
                },
                "收购"
              )
            )
          ),
          // 算账层级
          React.createElement(
            "div",
            { style: { flex: "1 1 180px", minWidth: 180 } },
            React.createElement("label", { className: "label" }, "算账层级"),
            React.createElement(Select, {
              value: layerFilter,
              onChange: switchLayer,
              options: layerOptions,
              placeholder: "全部层级",
            })
          ),
          // 科目
          React.createElement(
            "div",
            { style: { flex: "1 1 220px", minWidth: 220 } },
            React.createElement("label", { className: "label" }, "科目（大类）"),
            React.createElement(Select, {
              value: subjectFilter,
              onChange: switchSubject,
              options: subjectOptions,
              placeholder: "全部科目",
            })
          ),
          // 节点
          React.createElement(
            "div",
            { style: { flex: "1 1 180px", minWidth: 180 } },
            React.createElement(
              "label",
              { className: "label" },
              "节点 ",
              selectedSubject
                ? React.createElement("span", { className: "text-xs text-ash" }, "· 隶属于「" + selectedSubject.label + "」")
                : null
            ),
            React.createElement(Select, {
              value: stageFilter,
              onChange: switchStage,
              options: stageSelectOptions,
              placeholder: "全部节点",
              disabled: !selectedSubject,
            })
          ),
          // 子项
          React.createElement(
            "div",
            { style: { flex: "1 1 180px", minWidth: 180 } },
            React.createElement(
              "label",
              { className: "label" },
              "子项 ",
              selectedSubject
                ? React.createElement("span", { className: "text-xs text-ash" }, "· 联动科目+节点")
                : null
            ),
            React.createElement(Select, {
              value: subcategoryFilter,
              onChange: (v) => setSubcategoryFilter(v),
              options: subcategoryOptions,
              placeholder: "请先选科目",
              disabled: !selectedSubject,
            })
          ),
          // 关键词
          React.createElement(
            "div",
            { style: { flex: "1 1 200px", minWidth: 200 } },
            React.createElement("label", { className: "label" }, "关键词"),
            React.createElement("input", {
              className: "input",
              placeholder: "搜索交易对手 / 科目 / 单号",
              value: keyword,
              onChange: (e) => setKeyword(e.target.value),
            })
          ),
          // 票据筛选
          React.createElement(
            "div",
            { style: { flex: "1 1 160px", minWidth: 160 } },
            React.createElement("label", { className: "label" }, "票据"),
            React.createElement(Select, {
              value: voucherFilter,
              onChange: setVoucherFilter,
              options: voucherOptions,
              placeholder: "全部流水",
            })
          )
        ),
        React.createElement(
          "div",
          { className: "row between mt-16", style: { paddingTop: 14, borderTop: "1px dashed var(--line-2)" } },
          React.createElement(
            "div",
            { className: "text-xs text-ash" },
            "共 ",
            React.createElement("strong", { style: { color: "var(--ink)" } }, summary.count),
            " 条 · ",
            BUSINESS_FORM_LABEL[businessForm],
            layerFilter !== "all" ? " · " + (getLayer(layerFilter)?.label || "") : "",
            subjectFilter !== "all" ? " · " + (selectedSubject?.label || "") : "",
            stageFilter !== "all" ? " / " + (getStage(stageFilter, businessForm)?.label || "") : "",
            subcategoryFilter !== "all" && subcategoryFilter !== "none"
              ? " / " + (availableSubcategories.find((s) => String(s.id) === subcategoryFilter)?.name || "")
              : subcategoryFilter === "none"
              ? " / 无子项"
              : "",
            voucherFilter !== "all"
              ? " / " + (voucherFilter === "with" ? "有票据" : "无票据")
              : ""
          ),
          React.createElement(
            "button",
            {
              className: "btn btn-sm btn-ghost",
              onClick: () => {
                setLayerFilter("all");
                setSubjectFilter("all");
                setStageFilter("all");
                setSubcategoryFilter("all");
                setVoucherFilter("all");
                setKeyword("");
              },
            },
            "重置筛选"
          )
        )
      ),
      // 汇总卡
      React.createElement(
        "div",
        { className: "row wrap mb-24", style: { gap: 16 } },
        [
          { label: "支出合计", value: summary.expense, color: "var(--out)" },
          { label: "收入合计", value: summary.income, color: "var(--in)" },
          { label: "净额", value: summary.net, color: summary.net >= 0 ? "var(--in)" : "var(--out)" },
          {
            label: "票据覆盖",
            value: summary.withVoucher + " / " + summary.count,
            color: summary.withVoucher === summary.count ? "var(--in)" : "var(--pair)",
            hint: summary.withoutVoucher > 0 ? summary.withoutVoucher + " 条待补传" : "全部已上传",
          },
        ].map((kpi, i) =>
          React.createElement(
            "div",
            {
              key: i,
              className: "card",
              style: { flex: "1 1 200px", minWidth: 200, padding: "18px 22px" },
            },
            React.createElement("div", { className: "text-xs text-ash mb-8" }, kpi.label),
            React.createElement(
              "div",
              {
                className: "tabular-nums",
                style: { fontSize: 24, fontWeight: 600, color: kpi.color, letterSpacing: "-0.3px" },
              },
              typeof kpi.value === "number"
                ? formatMoney(kpi.value)
                : kpi.value
            ),
            kpi.hint
              ? React.createElement("div", { className: "text-xs text-ash mt-8" }, kpi.hint)
              : null
          )
        )
      ),
      // 流水表格
      React.createElement(
        "div",
        { className: "card" },
        React.createElement(
          "div",
          { className: "row between mb-16" },
          React.createElement("h3", { className: "card-title", style: { margin: 0 } }, "流水明细"),
          React.createElement("span", { className: "text-xs text-ash" }, filteredRecords.length, " 条")
        ),
        React.createElement(
          "table",
          { className: "table" },
          React.createElement(
            "thead",
            null,
            React.createElement(
              "tr",
              null,
              React.createElement("th", { style: { width: "12%" } }, "单号"),
              React.createElement("th", { style: { width: "10%" } }, "日期"),
              React.createElement("th", { style: { width: "26%" } }, "科目 / 节点 / 子项"),
              React.createElement("th", { style: { width: "10%" } }, "层级"),
              React.createElement("th", { style: { width: "8%" } }, "收支"),
              React.createElement("th", { style: { width: "16%" } }, "交易对手"),
              React.createElement("th", { style: { width: "6%", textAlign: "center" } }, "票据"),
              React.createElement("th", { style: { width: "12%", textAlign: "right" } }, "金额")
            )
          ),
          React.createElement(
            "tbody",
            null,
            filteredRecords.length === 0
              ? React.createElement(
                  "tr",
                  null,
                  React.createElement(
                    "td",
                    { colSpan: 8, style: { textAlign: "center", padding: "40px 0", color: "var(--ash)" } },
                    "无符合筛选条件的流水"
                  )
                )
              : filteredRecords.map((r) => {
                  const layer = getLayer(r.accounting_layer);
                  const stageObj = getStage(r.stage, businessForm);
                  const receiptCount = r.receipt_urls ? r.receipt_urls.length : 0;
                  return React.createElement(
                    "tr",
                    { key: r.id },
                    React.createElement(
                      "td",
                      { className: "text-xs", style: { fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', color: "var(--ash)" } },
                      r.id
                    ),
                    React.createElement("td", null, r.date),
                    React.createElement(
                      "td",
                      null,
                      React.createElement(
                        "div",
                        { className: "col", style: { gap: 2 } },
                        React.createElement(
                          "span",
                          { className: "font-medium" },
                          r.subject_label
                        ),
                        React.createElement(
                          "span",
                          { className: "text-xs text-ash" },
                          "▸ ", stageObj ? stageObj.label : r.stage,
                          r.subcategory_name ? " / " + r.subcategory_name : " / 无子项"
                        )
                      )
                    ),
                    React.createElement(
                      "td",
                      null,
                      React.createElement("span", { className: "layer-pill " + (layer?.color || "neutral") },
                        React.createElement("span", { className: "layer-dot " + (layer?.color || "neutral") }),
                        layer?.short || ""
                      )
                    ),
                    React.createElement(
                      "td",
                      null,
                      React.createElement(
                        "span",
                        { className: "tag " + (r.type === "expense" ? "tag-inactive" : "tag-active") },
                        r.type === "expense" ? "支出" : "收入"
                      )
                    ),
                    React.createElement("td", { className: "text-graphite" }, r.counterparty),
                    React.createElement(
                      "td",
                      { className: "text-center" },
                      receiptCount > 0
                        ? React.createElement(
                            "span",
                            {
                              className: "receipt-badge",
                              title: "已上传 " + receiptCount + " 张票据，点击查看",
                              onClick: () => alert("查看票据（demo）\n" + r.receipt_urls.join("\n")),
                              style: { cursor: "pointer" },
                            },
                            "🖼 ", receiptCount
                          )
                        : React.createElement(
                            "span",
                            {
                              className: "text-ash text-xs",
                              title: "未上传票据",
                              style: { cursor: "pointer" },
                              onClick: () => alert("该流水暂无票据，可点击「补传」上传"),
                            },
                            "—"
                          )
                    ),
                    React.createElement(
                      "td",
                      { className: "amount " + (r.type === "expense" ? "text-out" : "text-in") },
                      (r.type === "expense" ? "-" : "+") + "¥" + r.amount.toLocaleString("zh-CN")
                    )
                  );
                })
          )
        )
      ),
      // 改造要点
      React.createElement(
        "div",
        { className: "card mt-24" },
        React.createElement("h3", { className: "card-title" }, "改造要点"),
        React.createElement(
          "table",
          { className: "table" },
          React.createElement(
            "thead",
            null,
            React.createElement(
              "tr",
              null,
              React.createElement("th", { style: { width: "30%" } }, "维度"),
              React.createElement("th", { style: { width: "35%" } }, "改造前"),
              React.createElement("th", { style: { width: "35%" } }, "改造后")
            )
          ),
          React.createElement(
            "tbody",
            null,
            [
              ["筛选项", "单层 Select（分类枚举）", "三层联动（算账层级 → 科目 → 节点 → 子项）+ 票据筛选"],
              ["行展示", "record.category 单字段", "subject_label + stage + subcategory_name + 票据徽标"],
              ["票据列", "已有 receipt_urls 缩略图", "保留票据列，徽标显示张数，点击查看/补传"],
              ["票据筛选", "无", "新增 voucherFilter（全部 / 有票据 / 无票据）"],
              ["节点概念", "无", "全周期现金流 N 阶段（agent 5 / wholesale 6）"],
              ["算账层级", "无", "9 层（收入/直接成本/取得成本/运营/融资/他项/配对/往来/兜底）"],
              ["Zod 校验", "category: z.string() 不严", "subject_code: z.enum([...]) + stage: z.enum([...]) + subcategory_id: z.number().nullable()"],
              ["老流水兼容", "—", "subcategory_id=null 行展示「无子项」"],
              ["筛选数据源", "前端硬编码 LEDGER_CATEGORY_DATA", "useSWR 拉取 /admin/finance/subjects + /admin/finance/stages"],
            ].map((row, i) =>
              React.createElement(
                "tr",
                { key: i },
                React.createElement("td", null, React.createElement("strong", null, row[0])),
                React.createElement("td", { className: "text-graphite" }, row[1]),
                React.createElement("td", { className: "text-rust" }, row[2])
              )
            )
          )
        )
      )
    )
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
