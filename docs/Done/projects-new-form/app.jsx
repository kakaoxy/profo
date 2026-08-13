const { useState, useMemo } = React;

/* ===== 常量 ===== */
const RENOVATION_STAGES = ["拆除", "设计", "水电", "木瓦", "油漆", "交付", "已完成"];
const ORIENTATIONS = ["南", "北", "东", "西", "南北", "东西", "东南", "西南", "东北", "西北"];
const DECORATION_STYLES = ["现代简约", "法式奢华", "中式典雅", "极简侘寂"];
const PROJECT_STATUSES = [
  { value: "在途", emoji: "🚀" },
  { value: "在售", emoji: "⭐" },
  { value: "已售", emoji: "✓" },
];
const COMMUNITIES = [
  { id: 1, name: "翡翠湾花园" },
  { id: 2, name: "云栖峰景" },
  { id: 3, name: "澜庭雅苑" },
];
const CONSULTANTS = [
  { id: "u1", nickname: "陈思远", username: "chensiyuan" },
  { id: "u2", nickname: "林晓彤", username: "linxiaotong" },
  { id: "u3", nickname: "周子墨", username: "zhouzimo" },
  { id: "u4", nickname: "苏婉清", username: "suwanqing" },
];

/* ===== 图标（内联 SVG，outline, 1.5-2px stroke） ===== */
const Icon = {
  arrowLeft: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>,
  upload: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>,
  building: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/></svg>,
  user: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  chevrons: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>,
  check: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>,
  x: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
};

/* ===== 小区选择 ===== */
function CommunitySelect({ value, onChange }) {
  return (
    <div>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">选择小区</option>
        {COMMUNITIES.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
      </select>
    </div>
  );
}

/* ===== 顾问选择 ===== */
function ConsultantSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = CONSULTANTS.find((c) => c.id === value);
  return (
    <div className="field" style={{ position: "relative" }}>
      <label className="field-label">房源顾问</label>
      <button type="button" className="select-btn" onClick={() => setOpen((o) => !o)}>
        <div className="left">
          <span style={{ color: "var(--graphite)" }}>{Icon.user}</span>
          <span className={selected ? "" : "hint"}>{selected ? selected.nickname : "选择房源顾问..."}</span>
        </div>
        {Icon.chevrons}
      </button>
      {open && (
        <div className="select-pop">
          {CONSULTANTS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={"select-opt" + (value === c.id ? " on" : "")}
              onClick={() => { onChange(c.id); setOpen(false); }}
            >
              <div>
                <div className="opt-name">{c.nickname}</div>
                <div className="opt-username">{c.username}</div>
              </div>
              {value === c.id && <span className="check">{Icon.check}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ===== 楼层输入 ===== */
function FloorInput() {
  const [current, setCurrent] = useState("");
  const [total, setTotal] = useState("");
  return (
    <div className="field">
      <label className="field-label">楼层信息 <span className="req">*</span></label>
      <div className="floor-group">
        <div className="suffix-wrap">
          <input className="input h-sm input-center" placeholder="当前" inputMode="numeric" value={current}
            onChange={(e) => setCurrent(e.target.value.replace(/[^\d]/g, ""))} />
          <span className="suffix">层</span>
        </div>
        <span className="floor-slash">/</span>
        <div className="suffix-wrap">
          <input className="input h-sm input-center" placeholder="总" inputMode="numeric" value={total}
            onChange={(e) => setTotal(e.target.value.replace(/[^\d]/g, ""))} />
          <span className="suffix">层</span>
        </div>
      </div>
    </div>
  );
}

/* ===== 朝向选择 ===== */
function OrientationSelect({ value, onChange }) {
  return (
    <div className="field">
      <label className="field-label">朝向 <span className="req">*</span></label>
      <div className="chip-grid">
        {ORIENTATIONS.map((o) => (
          <button key={o} type="button" className={"chip" + (value === o ? " on" : "")} onClick={() => onChange(o)}>{o}</button>
        ))}
      </div>
    </div>
  );
}

/* ===== 标签输入 ===== */
function TagInputField({ value, onChange }) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setInput("");
  };
  return (
    <div className="tag-input">
      {value.map((t) => (
        <span key={t} className="tag">
          {t}
          <button type="button" className="x" onClick={() => onChange(value.filter((x) => x !== t))}>{Icon.x}</button>
        </span>
      ))}
      <input
        placeholder={value.length === 0 ? "添加标签，回车确认" : ""}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
      />
      {value.length === 0 && <span className="tag-hint" onClick={add}>+ 添加标签</span>}
    </div>
  );
}

/* ===== 发布状态切换 ===== */
function PublishToggle({ value, onChange }) {
  return (
    <div className="toggle-row">
      <div>
        <p className="toggle-title">发布状态</p>
        <p className="toggle-desc">房源是否在前端对外展示</p>
      </div>
      <div className="seg">
        <div className="seg-thumb" style={{ left: value === "发布" ? "4px" : "64px" }} />
        <button type="button" className={"seg-btn" + (value === "发布" ? " on" : "")} onClick={() => onChange("发布")}>发布</button>
        <button type="button" className={"seg-btn" + (value === "草稿" ? " on" : "")} onClick={() => onChange("草稿")}>草稿</button>
      </div>
    </div>
  );
}

/* ===== 单价联动 ===== */
function UnitPrice({ total, area }) {
  const price = useMemo(() => {
    if (total > 0 && area > 0) return (total / area).toFixed(2);
    return "";
  }, [total, area]);
  return (
    <div className="field">
      <label className="field-label">单价 (万元/㎡)</label>
      <div className="suffix-wrap">
        <input className="input h-md is-fog" readOnly value={price} placeholder="自动计算" />
        <span className="suffix pill">自动</span>
      </div>
    </div>
  );
}

/* ===== 表单卡片 ===== */
function Card({ title, en, desc, children }) {
  return (
    <section className="card">
      <h3 className="card-title">
        <span className="bar" />
        <span className="label">{title} <span className="en">{en}</span></span>
      </h3>
      {desc && <p className="card-desc">{desc}</p>}
      {children}
    </section>
  );
}

/* ===== 主表单 ===== */
function MiniProjectForm() {
  const [form, setForm] = useState({
    community_name: "",
    title: "",
    consultant_id: null,
    layout: "",
    area: "",
    orientation: "",
    total_price: "",
    publish_status: "发布",
    project_status: "在售",
    sort_order: 50,
    tags: [],
    decoration_style: "",
    stage_dates: {},
  });
  const set = (key, val) => setForm((s) => ({ ...s, [key]: val }));
  const total = parseFloat(form.total_price) || 0;
  const area = parseFloat(form.area) || 0;

  return (
    <div className="grid">
      {/* 左列 */}
      <div className="col-main stack">
        <div className="import-card">
          <div className="import-left">
            <div className="import-ico">{Icon.upload}</div>
            <div>
              <h4 className="import-title">从项目导入</h4>
              <p className="import-desc">从L3项目快速导入房源数据</p>
            </div>
          </div>
          <button className="btn-outline">{Icon.upload}<span style={{marginLeft:6}}>选择项目</span></button>
        </div>

        <Card title="基础信息" en="Basic Info">
          <div className="f-grid two">
            <div className="field">
              <label className="field-label">小区名称 <span className="req">*</span></label>
              <CommunitySelect value={form.community_name} onChange={(v) => set("community_name", v)} />
            </div>
            <div className="field">
              <label className="field-label">房源标题 <span className="req">*</span></label>
              <input className="input" placeholder="输入吸引人的房源标题" value={form.title} onChange={(e) => set("title", e.target.value)} />
            </div>
          </div>
          <div className="f-grid two" style={{ marginTop: 24 }}>
            <ConsultantSelect value={form.consultant_id} onChange={(v) => set("consultant_id", v)} />
          </div>
        </Card>

        <Card title="户型与规格" en="Layout & Specs">
          <div className="f-grid two">
            <div className="field">
              <label className="field-label">户型 <span className="req">*</span></label>
              <input className="input" placeholder="如：3室2厅2卫" value={form.layout} onChange={(e) => set("layout", e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">面积 (㎡) <span className="req">*</span></label>
              <div className="suffix-wrap">
                <input className="input h-sm" placeholder="例如：120.5" inputMode="decimal" value={form.area} onChange={(e) => set("area", e.target.value.replace(/[^\d.]/g, ""))} />
                <span className="suffix">㎡</span>
              </div>
            </div>
          </div>
          <div className="f-grid two" style={{ marginTop: 24 }}>
            <FloorInput />
            <OrientationSelect value={form.orientation} onChange={(v) => set("orientation", v)} />
          </div>
        </Card>

        <Card title="价格设置" en="Pricing">
          <div className="f-grid two">
            <div className="field">
              <label className="field-label">总价 (万元) <span className="req">*</span></label>
              <div className="suffix-wrap">
                <input className="input h-lg" placeholder="0" inputMode="decimal" value={form.total_price} onChange={(e) => set("total_price", e.target.value.replace(/[^\d.]/g, ""))} />
                <span className="suffix" style={{ fontSize: 14 }}>万</span>
              </div>
            </div>
            <UnitPrice total={total} area={area} />
          </div>
        </Card>

        <Card title="改造阶段完成时间" en="Stage Dates" desc="各改造阶段的完成日期，将展示在 C 端改造时间线。可留空。">
          <div className="f-grid two">
            {RENOVATION_STAGES.map((stage) => (
              <div className="field" key={stage}>
                <label className="field-label">{stage}阶段</label>
                <input
                  type="date"
                  className="input"
                  value={form.stage_dates[stage] || ""}
                  onChange={(e) => set("stage_dates", { ...form.stage_dates, [stage]: e.target.value })}
                />
              </div>
            ))}
          </div>
        </Card>

        <div className="photo-skeleton">
          <div className="skel-line" />
          <div className="skel-block" />
          <div className="skel-block tall" />
        </div>
      </div>

      {/* 右列 */}
      <div className="col-side stack">
        <Card title="发布设置" en="Settings">
          <PublishToggle value={form.publish_status} onChange={(v) => set("publish_status", v)} />
          <div className="divider" />
          <div className="field" style={{ gap: 12 }}>
            <p className="toggle-title">项目状态</p>
            <div className="status-grid">
              {PROJECT_STATUSES.map((s) => (
                <button key={s.value} type="button" className={"status-btn" + (form.project_status === s.value ? " on" : "")} onClick={() => set("project_status", s.value)}>
                  <span className="emoji">{s.emoji}</span>
                  <span className="txt">{s.value}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="divider" style={{ marginTop: 24 }} />
          <div>
            <div className="range-row">
              <span className="range-label">排序权重</span>
              <span className="range-val tnum">{form.sort_order}</span>
            </div>
            <input type="range" min="0" max="100" className="range" value={form.sort_order} onChange={(e) => set("sort_order", Number(e.target.value))} />
          </div>
        </Card>

        <Card title="标签与风格" en="Tags & Styles">
          <div className="field">
            <label className="field-label">房源标签
              <span style={{ marginLeft: 8, fontSize: 12, color: "rgba(76,76,76,0.7)", textTransform: "none" }}>({form.tags.length}/20)</span>
            </label>
            <TagInputField value={form.tags} onChange={(v) => set("tags", v)} />
          </div>
          <div className="field" style={{ marginTop: 24 }}>
            <label className="field-label">装修风格 <span style={{ marginLeft: 4, textTransform: "none", color: "var(--ash)", fontWeight: 400 }}>Style</span></label>
            <div className="chip-grid four">
              {DECORATION_STYLES.map((s) => (
                <button key={s} type="button" className={"chip-radio" + (form.decoration_style === s ? " on" : "")} onClick={() => set("decoration_style", s)}>{s}</button>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ===== 底部操作条 ===== */
function BottomBar() {
  return (
    <div className="bottom-bar">
      <div className="bottom-status">
        <span className="cap">当前状态</span>
        <div className="row">
          <span className="pulse-dot" />
          <span className="txt">正在创建新项目</span>
        </div>
      </div>
      <div className="bottom-sep" />
      <div className="bottom-actions">
        <button className="text-link" style={{ padding: "8px 12px" }}>取消</button>
        <button className="btn-primary">创建项目</button>
      </div>
    </div>
  );
}

/* ===== 页面外壳 ===== */
function App() {
  return (
    <div className="shell">
      <div className="page">
        <div className="page-header">
          <div className="header-left">
            <button className="icon-btn">{Icon.arrowLeft}</button>
            <div>
              <h1 className="page-title">创建新房源</h1>
              <p className="page-subtitle">填写房源基本信息以创建新的营销项目</p>
            </div>
          </div>
          <button className="text-link">取消</button>
        </div>
        <MiniProjectForm />
      </div>
      <BottomBar />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);