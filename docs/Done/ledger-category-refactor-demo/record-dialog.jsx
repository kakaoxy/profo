// ===========================================================
// Page 01 — 记一笔弹窗：科目 → 节点 + 子项
// 三层模型：算账层级(分组) → 科目(大类，固定) → 节点 + 子项
// 选定科目后，用现金流流程图展示该科目在各节点上的子项分布
// 节点数量：agent 5 / wholesale 6（对齐 docs/profocw.html 流程图）
// 算账层级：9 层（对齐 docs/profocw.html 报表 6 大类）
// ===========================================================

const { useState, useMemo } = React;
const { SUBCATEGORIES, SUBJECTS, ACCOUNTING_LAYERS, STAGES, BUSINESS_FORM_LABEL, subjectsByForm, groupSubjectsByLayer, subcategoriesOf, subcategoryDistribution, getSubject, getStage } = window;

// ── 模拟近期流水（用于页面下方展示） ──
const RECENT_RECORDS = [
  { id: "r1", type: "expense", subject_label: "装修类", subcategory_name: "装修款", stage_label: "装修", amount: 80000, date: "2026-07-24", counterparty: "上海XX建材", receipt_count: 2 },
  { id: "r2", type: "expense", subject_label: "营销推广费", subcategory_name: "推广费", stage_label: "在售", amount: 12000, date: "2026-07-22", counterparty: "贝壳", receipt_count: 1 },
  { id: "r3", type: "income", subject_label: "增值服务费", subcategory_name: null, stage_label: "已售", amount: 35000, date: "2026-07-20", counterparty: "业主王某", receipt_count: 0 },
  { id: "r4", type: "expense", subject_label: "装修类", subcategory_name: "灯具", stage_label: "装修", amount: 6800, date: "2026-07-18", counterparty: "欧普照明", receipt_count: 1 },
  { id: "r5", type: "expense", subject_label: "运营服务费", subcategory_name: null, stage_label: "已售", amount: 2400, date: "2026-07-15", counterparty: "万科物业", receipt_count: 0 },
];

function RecordDialog({ isOpen, onClose, businessForm, onSubmit }) {
  const [selectedSubjectCode, setSelectedSubjectCode] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [selectedSubId, setSelectedSubId] = useState(null);
  const [amount, setAmount] = useState("");
  const [recordDate, setRecordDate] = useState("2026-07-26");
  const [counterparty, setCounterparty] = useState("");
  const [remark, setRemark] = useState("");
  // 票据上传：模拟 receipt_urls（实际为后端返回的图片 URL 列表）
  // demo 中以 { id, name, size } 模拟已上传文件，提交时映射为 mock URL
  const [receipts, setReceipts] = useState([]);
  const MAX_RECEIPTS = 9;

  // 当前业务形式下的全部科目（按算账层级分组）
  const subjects = useMemo(() => subjectsByForm(businessForm), [businessForm]);
  const groupedSubjects = useMemo(() => groupSubjectsByLayer(subjects), [subjects]);

  // 当前选中科目
  const selectedSubject = useMemo(
    () => (selectedSubjectCode ? getSubject(selectedSubjectCode) : null),
    [selectedSubjectCode]
  );

  // 当前业务形式下的全部节点
  const stages = STAGES[businessForm] || [];

  // 选中科目后，按节点分布的子项（用于流程图展示）
  const distribution = useMemo(
    () => (selectedSubjectCode ? subcategoryDistribution(selectedSubjectCode, businessForm) : []),
    [selectedSubjectCode, businessForm]
  );

  // 当前选中节点下可选的子项
  const stageSubs = useMemo(() => {
    if (!selectedSubjectCode || !selectedStage) return [];
    return subcategoriesOf(selectedSubjectCode, businessForm, selectedStage);
  }, [selectedSubjectCode, businessForm, selectedStage]);

  function selectSubject(code) {
    if (code === selectedSubjectCode) return;
    setSelectedSubjectCode(code);
    // 重置节点为科目的默认节点
    const sub = getSubject(code);
    setSelectedStage(sub ? sub.default_stage : null);
    setSelectedSubId(null);
  }

  function selectStage(stageCode) {
    if (stageCode === selectedStage) return;
    setSelectedStage(stageCode);
    setSelectedSubId(null);
  }

  function handleSubmit() {
    if (!selectedSubject || !amount) return;
    const stageObj = getStage(selectedStage, businessForm);
    const subObj = selectedSubId
      ? SUBCATEGORIES.find((s) => s.id === selectedSubId)
      : null;
    // 票据映射为 mock URL（实际项目由后端 OSS 返回）
    const receiptUrls = receipts.map((r) => "/uploads/receipts/" + r.id + "_" + r.name);
    onSubmit({
      type: ["revenue"].includes(selectedSubject.accounting_layer) ? "income" : "expense",
      subject_code: selectedSubject.code,
      subject_label: selectedSubject.label,
      accounting_layer: selectedSubject.accounting_layer,
      stage: selectedStage,
      stage_label: stageObj ? stageObj.label : null,
      subcategory_id: selectedSubId,
      subcategory_name: subObj ? subObj.name : null,
      amount: parseFloat(amount),
      record_date: recordDate,
      counterparty: counterparty || null,
      remark: remark || null,
      receipt_urls: receiptUrls.length > 0 ? receiptUrls : null,
    });
    // 重置
    setSelectedSubjectCode(null);
    setSelectedStage(null);
    setSelectedSubId(null);
    setAmount("");
    setCounterparty("");
    setRemark("");
    setReceipts([]);
    onClose();
  }

  // 模拟票据上传（demo 不走真实后端，仅记录文件名）
  function handleReceiptPick(e) {
    const files = Array.from(e.target.files || []);
    const remain = MAX_RECEIPTS - receipts.length;
    if (remain <= 0) return;
    const picked = files.slice(0, remain).map((f, i) => ({
      id: "rc_" + Date.now() + "_" + i,
      name: f.name,
      size: f.size,
    }));
    setReceipts((prev) => [...prev, ...picked]);
    e.target.value = ""; // 允许重复选同一文件
  }

  function removeReceipt(id) {
    setReceipts((prev) => prev.filter((r) => r.id !== id));
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  if (!isOpen) return null;

  return React.createElement(
    "div",
    { className: "modal-backdrop", onClick: onClose },
    React.createElement(
      "div",
      { className: "modal", onClick: (e) => e.stopPropagation(), style: { maxWidth: 720 } },
      // —— Header ——
      React.createElement(
        "div",
        { className: "modal-header" },
        React.createElement("h2", { className: "modal-title" }, "记一笔"),
        React.createElement(
          "p",
          { className: "modal-subtitle" },
          "业务形式：",
          React.createElement("strong", { style: { color: "var(--rust)" } }, BUSINESS_FORM_LABEL[businessForm]),
          " · 科目固定，节点框定位置"
        )
      ),
      // —— Body ——
      React.createElement(
        "div",
        { className: "modal-body" },
        // 1. 第一步：选科目（按算账层级分组）
        React.createElement(
          "div",
          { className: "mb-16" },
          React.createElement(
            "div",
            { className: "label" },
            "① 选科目 ",
            React.createElement("span", { className: "text-ash text-xs" }, "· 按算账层级分组 · 业务不可增删")
          ),
          ACCOUNTING_LAYERS.map((layer) => {
            const subs = groupedSubjects[layer.code] || [];
            if (subs.length === 0) return null;
            return React.createElement(
              "div",
              { key: layer.code, className: "layer-group" },
              React.createElement(
                "div",
                { className: "layer-group-label" },
                React.createElement("span", { className: "layer-pill " + layer.color },
                  React.createElement("span", { className: "layer-dot " + layer.color }),
                  layer.label
                ),
                React.createElement("span", { className: "text-xs text-ash" }, layer.desc)
              ),
              React.createElement(
                "div",
                { className: "cat-chips" },
                subs.map((sub) =>
                  React.createElement(
                    "button",
                    {
                      key: sub.code,
                      className: "subject-chip" + (sub.code === selectedSubjectCode ? " selected" : ""),
                      onClick: () => selectSubject(sub.code),
                      title: sub.formula || sub.code,
                    },
                    React.createElement("span", null, sub.label),
                    sub.is_pair
                      ? React.createElement("span", { className: "pair-mark" }, "配对")
                      : null,
                    React.createElement(
                      "span",
                      { className: "stage-mark" },
                      "· " + (getStage(sub.default_stage, businessForm)?.label || sub.default_stage)
                    )
                  )
                )
              )
            );
          })
        ),
        // 2. 第二步：选节点 + 子项（流程图样式）
        selectedSubject
          ? React.createElement(
              "div",
              { className: "mb-16 fade-in" },
              React.createElement(
                "div",
                { className: "label" },
                "② 选节点 + 子项 ",
                React.createElement("span", { className: "text-ash text-xs" },
                  "· 隶属于「" + selectedSubject.label + "」· 在流程图上定位"
                )
              ),
              React.createElement(
                "div",
                { className: "flowchart" },
                React.createElement(
                  "div",
                  { className: "flowchart-stages", style: { gridTemplateColumns: "repeat(" + stages.length + ", 1fr)" } },
                  distribution.map((dist) => {
                    const isSelected = dist.stage === selectedStage;
                    const isDefault = dist.stage === selectedSubject.default_stage;
                    return React.createElement(
                      "div",
                      { key: dist.stage, className: "flowchart-stage-col" },
                      React.createElement("div", { className: "flowchart-stage-marker" },
                        (getStage(dist.stage, businessForm) || {}).icon || "•"
                      ),
                      React.createElement("div", { className: "flowchart-stage-name" }, dist.stage_label),
                      React.createElement("div", { className: "flowchart-stage-sub" },
                        isDefault ? "默认节点" : "可选节点"
                      ),
                      React.createElement(
                        "div",
                        {
                          className:
                            "flowchart-stage-card clickable" +
                            (isSelected ? " selected" : "") +
                            (dist.items.length > 0 ? " has-items" : ""),
                          onClick: () => selectStage(dist.stage),
                        },
                        dist.items.length === 0
                          ? React.createElement("div", { className: "flow-empty" }, "无子项")
                          : dist.items.map((item) =>
                              React.createElement(
                                "div",
                                {
                                  key: item.id,
                                  className: "flow-item",
                                  onClick: (e) => {
                                    e.stopPropagation();
                                    selectStage(dist.stage);
                                    setSelectedSubId(item.id === selectedSubId ? null : item.id);
                                  },
                                  style: item.id === selectedSubId ? {
                                    background: "var(--warm-grad)",
                                    borderRadius: 6,
                                  } : null,
                                },
                                React.createElement(
                                  "span",
                                  { className: "flow-item-name" },
                                  item.is_system
                                    ? React.createElement("span", { className: "sys-tag" }, "SYS")
                                    : React.createElement("span", { className: "custom-tag" }, "业务"),
                                  React.createElement("span", null, item.name)
                                )
                              )
                            )
                      )
                    );
                  })
                )
              ),
              // 节点选择按钮组（备选交互方式，更明确）
              React.createElement(
                "div",
                { className: "row gap-8 mt-16", style: { flexWrap: "wrap" } },
                React.createElement("span", { className: "text-xs text-ash" }, "当前节点："),
                React.createElement(
                  "div",
                  { className: "stage-btn-group" },
                  stages.map((st) =>
                    React.createElement(
                      "button",
                      {
                        key: st.code,
                        className: "stage-btn" + (st.code === selectedStage ? " selected" : ""),
                        onClick: () => selectStage(st.code),
                      },
                      React.createElement("span", { className: "stage-icon" }, st.icon),
                      st.label,
                      st.code === selectedSubject.default_stage
                        ? React.createElement("span", { className: "text-xs", style: { opacity: 0.7 } }, "·默认")
                        : null
                    )
                  )
                )
              ),
              // 当前节点下子项 chips（点击选择/取消）
              stageSubs.length > 0
                ? React.createElement(
                    "div",
                    { className: "mt-16" },
                    React.createElement(
                      "div",
                      { className: "text-xs text-ash mb-8" },
                      "「" + (getStage(selectedStage, businessForm) || {}).label + "」节点下的子项（可选）："
                    ),
                    React.createElement(
                      "div",
                      { className: "cat-chips" },
                      stageSubs.map((sub) =>
                        React.createElement(
                          "button",
                          {
                            key: sub.id,
                            className: "sub-chip" + (sub.id === selectedSubId ? " selected" : ""),
                            onClick: () => setSelectedSubId(sub.id === selectedSubId ? null : sub.id),
                          },
                          React.createElement("span", null, sub.name),
                          sub.is_system
                            ? React.createElement("span", { className: "sys-mark" }, "SYS")
                            : React.createElement("span", { className: "sys-mark", style: { color: "var(--rust)" } }, "业务")
                        )
                      )
                    )
                  )
                : React.createElement(
                    "div",
                    { className: "text-ash text-sm mt-16", style: { padding: "8px 0" } },
                    "该节点暂无预置子项，可直接记账（不选子项），或到「子项管理后台」该节点下添加"
                  )
            )
          : null,
        // 3. 金额 / 日期
        React.createElement(
          "div",
          { className: "row wrap mb-16", style: { gap: 12 } },
          React.createElement(
            "div",
            { style: { flex: "1 1 200px" } },
            React.createElement("label", { className: "label" }, "金额（元）"),
            React.createElement("input", {
              className: "input",
              type: "number",
              placeholder: "0.00",
              value: amount,
              onChange: (e) => setAmount(e.target.value),
            })
          ),
          React.createElement(
            "div",
            { style: { flex: "1 1 160px" } },
            React.createElement("label", { className: "label" }, "记账日期"),
            React.createElement("input", {
              className: "input",
              type: "date",
              value: recordDate,
              onChange: (e) => setRecordDate(e.target.value),
            })
          )
        ),
        // 4. 交易对手
        React.createElement(
          "div",
          { className: "mb-16" },
          React.createElement("label", { className: "label" }, "交易对手（选填）"),
          React.createElement("input", {
            className: "input",
            placeholder: "如：上海XX装修公司",
            value: counterparty,
            onChange: (e) => setCounterparty(e.target.value),
          })
        ),
        // 5. 备注
        React.createElement(
          "div",
          { className: "mb-16" },
          React.createElement("label", { className: "label" }, "备注（选填）"),
          React.createElement("input", {
            className: "input",
            placeholder: "补充说明",
            value: remark,
            onChange: (e) => setRemark(e.target.value),
          })
        ),
        // 6. 票据上传（支持多张，最多 9 张）
        React.createElement(
          "div",
          null,
          React.createElement(
            "label",
            { className: "label" },
            "票据（选填 · 最多 " + MAX_RECEIPTS + " 张）",
            receipts.length > 0
              ? React.createElement("span", { className: "text-xs text-ash", style: { marginLeft: 6 } }, "已上传 " + receipts.length + " 张")
              : null
          ),
          React.createElement(
            "div",
            { className: "receipt-upload-area" },
            receipts.length < MAX_RECEIPTS
              ? React.createElement(
                  "label",
                  { className: "receipt-pick", title: "点击或拖拽图片上传票据" },
                  React.createElement("input", {
                    type: "file",
                    accept: "image/*",
                    multiple: true,
                    style: { display: "none" },
                    onChange: handleReceiptPick,
                  }),
                  React.createElement("span", { className: "receipt-pick-icon" }, "+"),
                  React.createElement("span", { className: "receipt-pick-text" }, "上传票据"),
                  React.createElement("span", { className: "receipt-pick-hint" }, "支持 JPG / PNG")
                )
              : null,
            receipts.map((rc) =>
              React.createElement(
                "div",
                { key: rc.id, className: "receipt-thumb" },
                React.createElement("div", { className: "receipt-thumb-icon" }, "🖼"),
                React.createElement(
                  "div",
                  { className: "receipt-thumb-meta" },
                  React.createElement("div", { className: "receipt-thumb-name", title: rc.name }, rc.name),
                  React.createElement("div", { className: "receipt-thumb-size" }, formatFileSize(rc.size))
                ),
                React.createElement(
                  "button",
                  {
                    type: "button",
                    className: "receipt-thumb-remove",
                    onClick: () => removeReceipt(rc.id),
                    title: "移除",
                  },
                  "×"
                )
              )
            )
          ),
          React.createElement(
            "div",
            { className: "text-xs text-ash mt-8" },
            "票据与流水绑定，支持后续补传；导出项目账本时票据图片随 CSV 一并打包为 zip"
          )
        )
      ),
      // —— Footer ——
      React.createElement(
        "div",
        { className: "modal-footer" },
        React.createElement(
          "div",
          { className: "text-xs text-ash" },
          selectedSubject
            ? React.createElement(
                React.Fragment,
                null,
                "将提交：",
                React.createElement("strong", { style: { color: "var(--ink)" } }, selectedSubject.label),
                React.createElement("span", { className: "text-ash" }, " / "),
                React.createElement(
                  "strong",
                  { style: { color: "var(--rust)" } },
                  (getStage(selectedStage, businessForm) || {}).label || "未选节点"
                ),
                selectedSubId
                  ? React.createElement(
                      React.Fragment,
                      null,
                      React.createElement("span", { className: "text-ash" }, " / "),
                      React.createElement(
                        "strong",
                        { style: { color: "var(--rust)" } },
                        SUBCATEGORIES.find((s) => s.id === selectedSubId)?.name
                      )
                    )
                  : null,
                receipts.length > 0
                  ? React.createElement(
                      React.Fragment,
                      null,
                      React.createElement("span", { className: "text-ash" }, " / "),
                      React.createElement(
                        "strong",
                        { style: { color: "var(--pair)" } },
                        "票据 " + receipts.length + " 张"
                      )
                    )
                  : null
              )
            : "请先选择科目"
        ),
        React.createElement(
          "div",
          { className: "row gap-8" },
          React.createElement("button", { className: "btn", onClick: onClose }, "取消"),
          React.createElement(
            "button",
            {
              className: "btn btn-primary",
              onClick: handleSubmit,
              disabled: !selectedSubject || !amount,
              style: !selectedSubject || !amount ? { opacity: 0.5, cursor: "not-allowed" } : null,
            },
            "保存"
          )
        )
      )
    )
  );
}

function RecordRow({ record }) {
  const hasReceipt = record.receipt_count > 0;
  return React.createElement(
    "tr",
    null,
    React.createElement("td", null, record.date),
    React.createElement(
      "td",
      null,
      React.createElement(
        "div",
        { className: "col gap-4", style: { gap: 2 } },
        React.createElement(
          "span",
          { className: "font-medium" },
          record.subject_label,
          record.stage_label
            ? React.createElement(
                "span",
                { className: "text-ash", style: { fontWeight: 400 } },
                " · " + record.stage_label
              )
            : null
        ),
        record.subcategory_name
          ? React.createElement("span", { className: "text-xs text-ash" }, "↳ " + record.subcategory_name)
          : null,
        record.counterparty
          ? React.createElement("span", { className: "text-xs text-ash" }, record.counterparty)
          : null
      )
    ),
    React.createElement(
      "td",
      null,
      React.createElement(
        "span",
        { className: "tag " + (record.type === "expense" ? "tag-inactive" : "tag-active") },
        record.type === "expense" ? "支出" : "收入"
      )
    ),
    React.createElement(
      "td",
      { className: "text-center" },
      hasReceipt
        ? React.createElement(
            "span",
            { className: "receipt-badge", title: "已上传 " + record.receipt_count + " 张票据" },
            "🖼 ", record.receipt_count
          )
        : React.createElement("span", { className: "text-ash text-xs" }, "—")
    ),
    React.createElement(
      "td",
      { className: "amount " + (record.type === "expense" ? "text-out" : "text-in") },
      (record.type === "expense" ? "-" : "+") + "¥" + record.amount.toLocaleString("zh-CN")
    )
  );
}

function App() {
  const [businessForm, setBusinessForm] = useState("agent"); // agent / wholesale
  const [dialogOpen, setDialogOpen] = useState(false);
  const [records, setRecords] = useState(RECENT_RECORDS);

  function handleSubmit(record) {
    const newRecord = {
      id: "r" + (records.length + 1),
      type: record.type,
      subject_label: record.subject_label,
      subcategory_name: record.subcategory_name,
      stage_label: record.stage_label,
      amount: record.amount,
      date: record.record_date,
      counterparty: record.counterparty,
      receipt_count: record.receipt_urls ? record.receipt_urls.length : 0,
    };
    setRecords([newRecord, ...records]);
  }

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(TopNav, { activeKey: "record" }),
    React.createElement(
      "main",
      { className: "page" },
      React.createElement(
        PageHeader,
        {
          eyebrow: "01 · 记一笔弹窗",
          title: "科目 → 节点 + 子项：三层定位",
          subtitle:
            "科目（大类）按算账层级分组，固定不可增删；选定科目后用全周期现金流流程图展示该科目在各节点上的子项分布，让用户直观看到「这笔账加在哪个节点」。科目框定算账范围，节点框定增加位置。",
        },
        React.createElement(
          "div",
          { className: "row wrap mt-16", style: { gap: 16 } },
          React.createElement(
            "div",
            { className: "row gap-8" },
            React.createElement("span", { className: "text-sm text-ash" }, "业务形式："),
            React.createElement(
              "div",
              { className: "mode-switch" },
              React.createElement(
                "button",
                {
                  className: "mode-btn agent" + (businessForm === "agent" ? " active" : ""),
                  onClick: () => setBusinessForm("agent"),
                },
                React.createElement("span", { className: "mode-dot" }),
                "代理美化"
              ),
              React.createElement(
                "button",
                {
                  className: "mode-btn wholesale" + (businessForm === "wholesale" ? " active" : ""),
                  onClick: () => setBusinessForm("wholesale"),
                },
                React.createElement("span", { className: "mode-dot" }),
                "收购美化"
              )
            )
          ),
          React.createElement(
            "button",
            { className: "btn btn-primary", onClick: () => setDialogOpen(true) },
            "+ 记一笔"
          )
        )
      ),
      React.createElement(
        Callout,
        null,
        "三层模型：", React.createElement("strong", null, "算账层级（分组）→ 科目（大类，固定）→ 节点 + 子项"),
        "。科目对应利润三层结构的算账维度（9 层：收入 / 直接成本 / 取得成本 / 运营 / 融资 / 他项 / 配对 / 往来 / 兜底），节点对应全周期现金流阶段（agent 5 / wholesale 6）。同一科目可跨节点存在子项，但每个子项必须归属于一个具体节点。"
      ),
      React.createElement(
        "div",
        { className: "card" },
        React.createElement(
          "div",
          { className: "row between mb-16" },
          React.createElement("h3", { className: "card-title", style: { margin: 0 } }, "近期流水（模拟）"),
          React.createElement("span", { className: "text-xs text-ash" }, records.length, " 条")
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
              React.createElement("th", null, "日期"),
              React.createElement("th", null, "科目 / 节点 / 子项"),
              React.createElement("th", null, "收支"),
              React.createElement("th", { className: "text-center", style: { width: 80 } }, "票据"),
              React.createElement("th", { style: { textAlign: "right" } }, "金额")
            )
          ),
          React.createElement(
            "tbody",
            null,
            records.map((r) => React.createElement(RecordRow, { key: r.id, record: r }))
          )
        )
      ),
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
              ["大类来源", "前端硬编码 LEDGER_CATEGORY_DATA", "接口拉取 /admin/finance/subjects（固定科目）"],
              ["选择层级", "单层（直接选大类）", "三层（算账层级 → 科目 → 节点 + 子项）"],
              ["节点定位", "无概念", "现金流流程图展示该科目在各节点的子项分布"],
              ["业务形式过滤", "前端按 BusinessType 三段分组", "后端按 business_forms 字段过滤"],
              ["提交字段", "category", "subject_code + stage + subcategory_id + subcategory_name"],
              ["票据上传", "已有 receipt_urls（最多 9 张）", "保留 receipt_urls，随三层分类一同提交"],
              ["新增子项", "改 3 处代码（枚举/校验/前端）", "后台管理界面在节点上添加"],
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
    ),
    React.createElement(RecordDialog, {
      isOpen: dialogOpen,
      onClose: () => setDialogOpen(false),
      businessForm: businessForm,
      onSubmit: handleSubmit,
    })
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));

Object.assign(window, { RecordDialog });
