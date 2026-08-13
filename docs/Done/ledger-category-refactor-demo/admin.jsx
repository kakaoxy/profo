// ===========================================================
// Page 03 — 子项管理后台
// 核心为全周期现金流流程图：N 节点 × M 科目 交叉展示
//   - agent: 5 节点（签约→装修→在售→已售→项目终结）
//   - wholesale: 6 节点（签约/买入→持有期→装修→在售→已售→项目终结）
// 增加子项时，节点已固定（点击哪个节点列就在哪个节点加）
// 科目只读，子项可增删改停用
// 路由：/admin/finance/categories
// ===========================================================

const { useState, useMemo, useEffect } = React;
const { SUBCATEGORIES, SUBJECTS, ACCOUNTING_LAYERS, STAGES, BUSINESS_FORM_LABEL, subjectsByForm, groupSubjectsByLayer, getLayer, getStage } = window;

// ── 深拷贝子项作为可变状态 ──
function cloneSubcategories() {
  return JSON.parse(JSON.stringify(SUBCATEGORIES));
}

// ── 新建/编辑子项弹窗 ──
function SubcategoryDialog({ isOpen, onClose, onSubmit, defaultStage, defaultSubject, businessForm, editingItem }) {
  const [name, setName] = useState("");
  const [parentCode, setParentCode] = useState("");
  const [stage, setStage] = useState("");
  const [sortOrder, setSortOrder] = useState(100);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setName(editingItem?.name || "");
      setParentCode(editingItem?.parent_code || defaultSubject || "");
      setStage(editingItem?.stage || defaultStage || "");
      setSortOrder(editingItem?.sort_order ?? 100);
      setError("");
    }
  }, [isOpen, editingItem, defaultStage, defaultSubject]);

  if (!isOpen) return null;

  // 当前业务形式下的可选科目（按算账层级分组）
  const availableSubjects = subjectsByForm(businessForm);
  const grouped = groupSubjectsByLayer(availableSubjects);
  const stages = STAGES[businessForm] || [];

  function handleSubmit() {
    if (!name.trim()) return setError("子项名称必填");
    if (!parentCode) return setError("请选择归属科目");
    if (!stage) return setError("请选择归属节点");
    onSubmit({
      id: editingItem?.id,
      name: name.trim(),
      parent_code: parentCode,
      stage: stage,
      sort_order: sortOrder,
    });
    onClose();
  }

  return React.createElement(
    "div",
    { className: "modal-backdrop", onClick: onClose },
    React.createElement(
      "div",
      { className: "modal", onClick: (e) => e.stopPropagation(), style: { maxWidth: 520 } },
      React.createElement(
        "div",
        { className: "modal-header" },
        React.createElement("h2", { className: "modal-title" }, editingItem ? "编辑子项" : "新增子项"),
        React.createElement(
          "p",
          { className: "modal-subtitle" },
          editingItem ? "修改子项名称、归属、排序" : "在指定节点上增加子项 · 业务形式：" + BUSINESS_FORM_LABEL[businessForm]
        )
      ),
      React.createElement(
        "div",
        { className: "modal-body col gap-16" },
        // 1. 归属科目
        React.createElement(
          "div",
          null,
          React.createElement("label", { className: "label" }, "归属科目 ", React.createElement("span", { className: "text-rust" }, "*")),
          ACCOUNTING_LAYERS.map((layer) => {
            const subs = grouped[layer.code] || [];
            if (subs.length === 0) return null;
            return React.createElement(
              "div",
              { key: layer.code, className: "mb-8" },
              React.createElement(
                "div",
                { className: "text-xs text-ash mb-8" },
                React.createElement("span", { className: "layer-pill " + layer.color },
                  React.createElement("span", { className: "layer-dot " + layer.color }),
                  layer.label
                )
              ),
              React.createElement(
                "div",
                { className: "cat-chips" },
                subs.map((sub) =>
                  React.createElement(
                    "button",
                    {
                      key: sub.code,
                      type: "button",
                      className: "subject-chip" + (sub.code === parentCode ? " selected" : ""),
                      onClick: () => { setParentCode(sub.code); setError(""); },
                      title: sub.formula || sub.code,
                    },
                    React.createElement("span", null, sub.label),
                    sub.is_pair ? React.createElement("span", { className: "pair-mark" }, "配对") : null
                  )
                )
              )
            );
          })
        ),
        // 2. 归属节点
        React.createElement(
          "div",
          null,
          React.createElement("label", { className: "label" }, "归属节点 ", React.createElement("span", { className: "text-rust" }, "*")),
          React.createElement(
            "div",
            { className: "stage-btn-group" },
            stages.map((st) =>
              React.createElement(
                "button",
                {
                  key: st.code,
                  type: "button",
                  className: "stage-btn" + (st.code === stage ? " selected" : ""),
                  onClick: () => { setStage(st.code); setError(""); },
                },
                React.createElement("span", { className: "stage-icon" }, st.icon),
                st.label
              )
            )
          ),
          React.createElement("div", { className: "text-xs text-ash mt-8" },
            "节点框定子项在全周期现金流中的位置，与科目共同决定该子项的算账归属"
          )
        ),
        // 3. 子项名称
        React.createElement(
          "div",
          null,
          React.createElement("label", { className: "label" }, "子项名称 ", React.createElement("span", { className: "text-rust" }, "*")),
          React.createElement("input", {
            className: "input",
            placeholder: "如：灯具",
            value: name,
            onChange: (e) => { setName(e.target.value); setError(""); },
          })
        ),
        // 4. 排序
        React.createElement(
          "div",
          null,
          React.createElement("label", { className: "label" }, "排序"),
          React.createElement("input", {
            className: "input",
            type: "number",
            value: sortOrder,
            onChange: (e) => setSortOrder(parseInt(e.target.value) || 0),
          })
        ),
        React.createElement(
          "div",
          { className: "callout", style: { marginBottom: 0, fontSize: 12 } },
          React.createElement("span", { className: "callout-icon" }, "!"),
          React.createElement(
            "div",
            null,
            "新建子项 ", React.createElement("strong", null, "is_system=false"),
            "（业务子项），可随时停用 / 软删；系统子项仅可停用，不可删除。"
          )
        ),
        error
          ? React.createElement("div", { style: { color: "var(--out)", fontSize: 12 } }, "⚠ ", error)
          : null
      ),
      React.createElement(
        "div",
        { className: "modal-footer" },
        React.createElement("button", { className: "btn", onClick: onClose }, "取消"),
        React.createElement("button", { className: "btn btn-primary", onClick: handleSubmit }, editingItem ? "保存" : "创建")
      )
    )
  );
}

// ── 单个节点列内的子项卡片 ──
function StageSubItem({ item, subject, onToggle, onEdit, onDelete }) {
  const layer = getLayer(subject.accounting_layer);
  return React.createElement(
    "div",
    {
      className: "flow-item",
      style: {
        background: item.is_active ? "#fff" : "var(--bg-soft)",
        opacity: item.is_active ? 1 : 0.55,
        borderRadius: 6,
        padding: "8px 10px",
        border: "1px solid var(--line)",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 4,
      },
    },
    React.createElement(
      "div",
      { className: "row between", style: { gap: 8 } },
      React.createElement(
        "span",
        { className: "flow-item-name", style: { flex: 1 } },
        item.is_system
          ? React.createElement("span", { className: "sys-tag" }, "SYS")
          : React.createElement("span", { className: "custom-tag" }, "业务"),
        React.createElement("span", null, item.name)
      ),
      React.createElement(
        "div",
        { className: "col gap-4", style: { flexShrink: 0, alignItems: "stretch", width: 52 } },
        React.createElement(
          "button",
          {
            className: "btn btn-sm btn-ghost",
            onClick: () => onEdit(item),
            title: "编辑",
            style: { padding: "2px 4px", fontSize: 11, width: "100%", textAlign: "center" },
          },
          "编辑"
        ),
        React.createElement(
          "button",
          {
            className: "btn btn-sm btn-ghost",
            onClick: () => onToggle(item),
            title: item.is_active ? "停用" : "启用",
            style: { padding: "2px 4px", fontSize: 11, width: "100%", textAlign: "center" },
          },
          item.is_active ? "停用" : "启用"
        ),
        React.createElement(
          "button",
          {
            className: "btn btn-sm btn-ghost",
            onClick: () => onDelete(item),
            disabled: item.is_system,
            style: item.is_system
              ? { opacity: 0.4, cursor: "not-allowed", padding: "2px 4px", fontSize: 11, width: "100%", textAlign: "center" }
              : { padding: "2px 4px", fontSize: 11, width: "100%", textAlign: "center", color: "var(--out)" },
            title: item.is_system ? "系统子项不可删除，仅可停用" : "软删（is_active=false）",
          },
          "删除"
        )
      )
    ),
    React.createElement(
      "div",
      { className: "row gap-4", style: { fontSize: 10.5, color: "var(--ash)" } },
      React.createElement("span", { className: "layer-pill " + (layer?.color || "neutral") }, subject.label),
      item.is_active
        ? React.createElement("span", { className: "tag tag-active" }, "启用")
        : React.createElement("span", { className: "tag tag-inactive" }, "停用"),
      React.createElement("span", null, "排序 " + item.sort_order)
    )
  );
}

// ── 节点列 ──
function StageColumn({ stageObj, items, subjectsMap, onAddSub, onToggleSub, onEditSub, onDeleteSub }) {
  const itemsInStage = items
    .filter((it) => it.stage === stageObj.code)
    .sort((a, b) => {
      const sa = subjectsMap[a.parent_code]?.sort_order || 0;
      const sb = subjectsMap[b.parent_code]?.sort_order || 0;
      if (sa !== sb) return sa - sb;
      return a.sort_order - b.sort_order;
    });

  return React.createElement(
    "div",
    { className: "flowchart-stage-col" },
    React.createElement("div", { className: "flowchart-stage-marker" }, stageObj.icon),
    React.createElement("div", { className: "flowchart-stage-name" }, stageObj.label),
    React.createElement("div", { className: "flowchart-stage-sub" }, stageObj.sub),
    React.createElement(
      "div",
      {
        className: "flowchart-stage-card has-items",
        style: { minHeight: 200, padding: 10 },
      },
      itemsInStage.length === 0
        ? React.createElement("div", { className: "flow-empty", style: { padding: "20px 0" } }, "该节点暂无子项")
        : itemsInStage.map((item) => {
            const subject = subjectsMap[item.parent_code];
            if (!subject) return null;
            return React.createElement(StageSubItem, {
              key: item.id,
              item: item,
              subject: subject,
              onToggle: (it) => onToggleSub(it),
              onEdit: (it) => onEditSub(it, stageObj),
              onDelete: (it) => onDeleteSub(it),
            });
          }),
      React.createElement(
        "button",
        {
          className: "flow-item-add",
          onClick: () => onAddSub(stageObj),
        },
        "+ 在「", stageObj.label, "」节点添加子项"
      )
    )
  );
}

function App() {
  const [businessForm, setBusinessForm] = useState("agent");
  const [items, setItems] = useState(cloneSubcategories);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDefaultStage, setDialogDefaultStage] = useState(null);
  const [dialogDefaultSubject, setDialogDefaultSubject] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [log, setLog] = useState([
    { time: "2026-07-26 14:32", action: "创建子项", target: "灯具 → 装修类 / 装修", operator: "admin" },
    { time: "2026-07-26 14:08", action: "停用子项", target: "窗户 → 装修类 / 装修", operator: "admin" },
    { time: "2026-07-25 18:21", action: "创建子项", target: "个税 → 差额税费 / 已售", operator: "admin" },
  ]);

  // 当前业务形式下的全部科目
  const subjects = useMemo(() => subjectsByForm(businessForm), [businessForm]);
  const subjectsMap = useMemo(() => {
    const m = {};
    for (const s of subjects) m[s.code] = s;
    return m;
  }, [subjects]);

  // 当前业务形式下的全部节点
  const stages = STAGES[businessForm] || [];

  // 当前业务形式下可见的子项（按 parent_code 所属科目的 business_forms 过滤）
  const visibleItems = useMemo(() => {
    return items.filter((it) => {
      const sub = subjectsMap[it.parent_code];
      return sub && sub.business_forms.includes(businessForm);
    });
  }, [items, subjectsMap, businessForm]);

  function addLog(action, target) {
    const now = new Date();
    const time = now.toISOString().slice(0, 16).replace("T", " ");
    setLog([{ time, action, target, operator: "admin" }, ...log].slice(0, 20));
  }

  function handleAddSub(stageObj) {
    setEditingItem(null);
    setDialogDefaultStage(stageObj.code);
    setDialogDefaultSubject(null);
    setDialogOpen(true);
  }

  function handleEditSub(item, stageObj) {
    setEditingItem(item);
    setDialogDefaultStage(item.stage);
    setDialogDefaultSubject(item.parent_code);
    setDialogOpen(true);
  }

  function handleSubmitSub(data) {
    if (editingItem) {
      // 编辑
      setItems((prev) =>
        prev.map((it) =>
          it.id === data.id
            ? { ...it, name: data.name, parent_code: data.parent_code, stage: data.stage, sort_order: data.sort_order }
            : it
        )
      );
      const subj = subjectsMap[data.parent_code];
      const stg = STAGES[businessForm].find((s) => s.code === data.stage);
      addLog("编辑子项", data.name + " → " + (subj?.label || "") + " / " + (stg?.label || ""));
    } else {
      // 新建
      const newId = Math.max(0, ...items.map((s) => s.id)) + 1;
      setItems((prev) => [
        ...prev,
        {
          id: newId,
          parent_code: data.parent_code,
          stage: data.stage,
          name: data.name,
          is_system: false,
          is_active: true,
          sort_order: data.sort_order,
        },
      ]);
      const subj = subjectsMap[data.parent_code];
      const stg = STAGES[businessForm].find((s) => s.code === data.stage);
      addLog("创建子项", data.name + " → " + (subj?.label || "") + " / " + (stg?.label || ""));
    }
  }

  function handleToggleSub(item) {
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, is_active: !it.is_active } : it))
    );
    const subj = subjectsMap[item.parent_code];
    const stg = STAGES[businessForm].find((s) => s.code === item.stage);
    addLog(item.is_active ? "停用子项" : "启用子项", item.name + " → " + (subj?.label || "") + " / " + (stg?.label || ""));
  }

  function handleDeleteSub(item) {
    if (item.is_system) return;
    if (!confirm("确认软删子项「" + item.name + "」？\n\n历史流水通过 subcategory_name 冗余字段保持展示。")) return;
    setItems((prev) => prev.filter((it) => it.id !== item.id));
    const subj = subjectsMap[item.parent_code];
    const stg = STAGES[businessForm].find((s) => s.code === item.stage);
    addLog("软删子项", item.name + " → " + (subj?.label || "") + " / " + (stg?.label || ""));
  }

  // 统计
  const totalSubs = visibleItems.length;
  const systemSubs = visibleItems.filter((s) => s.is_system).length;
  const customSubs = totalSubs - systemSubs;
  const activeSubs = visibleItems.filter((s) => s.is_active).length;

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(TopNav, { activeKey: "admin" }),
    React.createElement(
      "main",
      { className: "page" },
      React.createElement(PageHeader, {
        eyebrow: "03 · 子项管理后台",
        title: "全周期现金流流程图 · 节点上定位新增子项",
        subtitle:
          "科目（大类）由迁移脚本预置，业务不可增删改；子项管理界面以全周期现金流流程图为核心，N 节点列（agent 5 / wholesale 6）展示该节点下所有子项（横跨各科目），点击节点列上的「+ 添加」按钮即在指定节点新增子项。",
      }),
      // 业务形式切换 + KPI
      React.createElement(
        "div",
        { className: "row between wrap mb-24", style: { gap: 16 } },
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
          "div",
          { className: "row wrap", style: { gap: 12 } },
          [
            { label: "科目总数", value: subjects.length, suffix: "项 · 系统预置", color: "var(--ink)" },
            { label: "子项总数", value: totalSubs, suffix: "项", color: "var(--ink)" },
            { label: "系统子项", value: systemSubs, suffix: "项 · 不可删", color: "var(--pair)" },
            { label: "业务子项", value: customSubs, suffix: "项 · 可软删", color: "var(--rust)" },
          ].map((kpi, i) =>
            React.createElement(
              "div",
              {
                key: i,
                className: "card",
                style: { padding: "12px 16px", minWidth: 130 },
              },
              React.createElement("div", { className: "text-xs text-ash mb-8" }, kpi.label),
              React.createElement(
                "div",
                { className: "row between", style: { alignItems: "baseline", gap: 8 } },
                React.createElement(
                  "span",
                  {
                    className: "tabular-nums",
                    style: { fontSize: 22, fontWeight: 600, color: kpi.color, letterSpacing: "-0.3px" },
                  },
                  kpi.value
                ),
                React.createElement("span", { className: "text-xs text-ash" }, kpi.suffix)
              )
            )
          )
        )
      ),
      React.createElement(
        Callout,
        null,
        "核心交互：", React.createElement("strong", null, "节点列定位新增位置，科目框定算账归属"),
        "。流程图横向 " + stages.length + " 列对应全周期现金流 " + stages.length + " 节点（" +
          stages.map((s) => s.label).join(" → ") +
          "），每列展示该节点下所有子项（按科目分组排序）；点击节点列内的「+ 添加」按钮即在该节点新增子项，弹窗内只需选科目 + 填名称。"
      ),
      // 核心现金流流程图
      React.createElement(
        "div",
        { className: "flowchart" },
        React.createElement(
          "div",
          { className: "flowchart-stages", style: { gridTemplateColumns: "repeat(" + stages.length + ", 1fr)" } },
          stages.map((st) =>
            React.createElement(StageColumn, {
              key: st.code,
              stageObj: st,
              items: visibleItems,
              subjectsMap: subjectsMap,
              onAddSub: handleAddSub,
              onToggleSub: handleToggleSub,
              onEditSub: handleEditSub,
              onDeleteSub: handleDeleteSub,
            })
          )
        )
      ),
      // 科目一览表（只读）
      React.createElement(
        "div",
        { className: "card mt-24" },
        React.createElement(
          "div",
          { className: "row between mb-16" },
          React.createElement("h3", { className: "card-title", style: { margin: 0 } }, "科目一览（只读 · 系统预置）"),
          React.createElement("span", { className: "text-xs text-ash" }, subjects.length, " 个科目 · 按算账层级分组")
        ),
        ACCOUNTING_LAYERS.map((layer) => {
          const subs = subjects.filter((s) => s.accounting_layer === layer.code);
          if (subs.length === 0) return null;
          return React.createElement(
            "div",
            { key: layer.code, className: "mb-16" },
            React.createElement(
              "div",
              { className: "layer-group-label mb-8" },
              React.createElement("span", { className: "layer-pill " + layer.color },
                React.createElement("span", { className: "layer-dot " + layer.color }),
                layer.label
              ),
              React.createElement("span", { className: "text-xs text-ash" }, layer.desc)
            ),
            React.createElement(
              "table",
              { className: "table", style: { fontSize: 12.5 } },
              React.createElement(
                "thead",
                null,
                React.createElement(
                  "tr",
                  null,
                  React.createElement("th", { style: { width: "20%" } }, "科目 code"),
                  React.createElement("th", { style: { width: "20%" } }, "名称"),
                  React.createElement("th", { style: { width: "12%" } }, "默认节点"),
                  React.createElement("th", { style: { width: "12%" } }, "配对"),
                  React.createElement("th", { style: { width: "36%" } }, "算账公式 / 说明")
                )
              ),
              React.createElement(
                "tbody",
                null,
                subs.map((sub) =>
                  React.createElement(
                    "tr",
                    { key: sub.code },
                    React.createElement(
                      "td",
                      { style: { fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 11.5 } },
                      sub.code
                    ),
                    React.createElement("td", null, sub.label),
                    React.createElement("td", null, getStage(sub.default_stage, businessForm)?.label || sub.default_stage),
                    React.createElement(
                      "td",
                      null,
                      sub.is_pair ? React.createElement("span", { className: "tag tag-system" }, "配对") : "—"
                    ),
                    React.createElement("td", { className: "text-graphite", style: { fontSize: 12 } }, sub.formula || sub.pair_note || "—")
                  )
                )
              )
            )
          );
        })
      ),
      // 操作日志
      React.createElement(
        "div",
        { className: "card mt-24" },
        React.createElement("h3", { className: "card-title" }, "操作日志（最近 20 条）"),
        React.createElement(
          "table",
          { className: "table" },
          React.createElement(
            "thead",
            null,
            React.createElement(
              "tr",
              null,
              React.createElement("th", { style: { width: "18%" } }, "时间"),
              React.createElement("th", { style: { width: "16%" } }, "操作"),
              React.createElement("th", { style: { width: "50%" } }, "对象"),
              React.createElement("th", { style: { width: "16%" } }, "操作人")
            )
          ),
          React.createElement(
            "tbody",
            null,
            log.map((entry, i) =>
              React.createElement(
                "tr",
                { key: i },
                React.createElement("td", { className: "text-ash" }, entry.time),
                React.createElement(
                  "td",
                  null,
                  React.createElement(
                    "span",
                    {
                      className:
                        "tag " +
                        (entry.action.includes("创建")
                          ? "tag-active"
                          : entry.action.includes("删")
                          ? "tag-inactive"
                          : entry.action.includes("停用")
                          ? "tag-inactive"
                          : "tag-system"),
                    },
                    entry.action
                  )
                ),
                React.createElement("td", null, entry.target),
                React.createElement("td", { className: "text-ash" }, entry.operator)
              )
            )
          )
        )
      ),
      React.createElement(SubcategoryDialog, {
        isOpen: dialogOpen,
        onClose: () => setDialogOpen(false),
        onSubmit: handleSubmitSub,
        defaultStage: dialogDefaultStage,
        defaultSubject: dialogDefaultSubject,
        businessForm: businessForm,
        editingItem: editingItem,
      })
    )
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
