/* global React, ReactDOM, window */
// ============================================================
// App：模拟 admin/leads 列表 + 触发抽屉
// ============================================================

const { useState } = React;
const { Icon, LeadDrawer } = window;
const { LEADS_LIST, LEAD_DETAIL, STATUS_LABELS, STATUS_CLASS_MAP, LEAD_STATUSES } = window;

function App() {
  const [selectedLead, setSelectedLead] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const openDrawer = (lead) => {
    setSelectedLead(lead);
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
  };

  return (
    <div>
      <TopBar />
      <main className="page">
        <div className="row between mb-16">
          <div>
            <div className="page-eyebrow">Admin / Leads</div>
            <h1 className="page-title">线索管理</h1>
            <p className="page-subtitle">
              点击列表中的线索打开右侧详情抽屉。点击下方"打开演示抽屉"按钮可直接查看典型线索详情（待评估状态）。
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => openDrawer(LEAD_DETAIL)}
          >
            <Icon name="eye" size={13} />
            打开演示抽屉
          </button>
        </div>

        <LeadList onRowClick={openDrawer} />

        <DemoNote />
      </main>

      <LeadDrawer
        lead={selectedLead}
        isOpen={isDrawerOpen}
        onClose={closeDrawer}
      />
    </div>
  );
}

function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a href="#" className="brand">
          <span className="brand-mark">P</span>
          Profo
          <span className="brand-sub">· admin</span>
        </a>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button className="btn btn-sm btn-ghost">线索</button>
          <button className="btn btn-sm btn-ghost">项目</button>
          <button className="btn btn-sm btn-ghost">财务</button>
          <button className="btn btn-sm btn-ghost">系统</button>
        </div>
      </div>
    </header>
  );
}

function LeadList({ onRowClick }) {
  return (
    <div className="lead-list">
      <div className="lead-list-header">
        <span>Case ID</span>
        <span>小区 / 户型</span>
        <span>报价</span>
        <span>单价</span>
        <span>区域</span>
        <span>录入人</span>
        <span>状态</span>
      </div>
      {LEADS_LIST.map((lead) => (
        <div
          className="lead-row"
          key={lead.id}
          onClick={() => onRowClick(lead)}
        >
          <span className="case-id">#{lead.id}</span>
          <span className="community">
            {lead.communityName}
            <span className="meta">{lead.layout} · {lead.area}㎡ · {lead.floorInfo || "—"}</span>
          </span>
          <span className="price tabular-nums">
            ¥{lead.totalPrice}
            <span className="unit">万</span>
          </span>
          <span className="price tabular-nums" style={{ fontSize: 13 }}>
            ¥{lead.unitPrice.toFixed(2)}
            <span className="unit">万/㎡</span>
          </span>
          <span className="creator">
            {lead.district}
            <div style={{ fontSize: 10, color: "var(--ash)" }}>{lead.businessArea}</div>
          </span>
          <span className="creator">{lead.creatorName}</span>
          <span className="status-cell">
            <span className={`status-badge ${STATUS_CLASS_MAP[lead.status]}`}>
              <span className="dot"></span>
              {STATUS_LABELS[lead.status]}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function DemoNote() {
  return (
    <div
      style={{
        marginTop: 24,
        padding: "16px 20px",
        background: "linear-gradient(135deg, #fffaf3, #fdf3e7)",
        border: "1px solid #f5d9c2",
        borderLeft: "3px solid var(--rust-3)",
        borderRadius: 12,
        fontSize: 13,
        color: "var(--graphite)",
        lineHeight: 1.7,
      }}
    >
      <strong style={{ color: "var(--rust)" }}>设计说明：</strong>
      本 demo 重新设计了 admin/leads 的线索详情抽屉，针对原方案信息密度低、缺失业主补充信息、数据大盘无法全屏三个问题做了优化。
      <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 12.5, color: "var(--graphite)" }}>
        <li><strong>1. Tab 减少到 2 个：</strong>原 4 个 Tab（决策面板/影像库/流转轨迹/数据大盘）压缩为「线索信息」「数据大盘」</li>
        <li><strong>2. 线索信息整合：</strong>KPI + 房屋参数 + <span style={{ color: "var(--rust)" }}>业主补充信息（C 端提交 remarks）</span> + 影像库横向缩略图 + 决策面板 + 价格历史 + 可折叠跟进时间线</li>
        <li><strong>3. 数据大盘全屏：</strong>Tab 内嵌精简看板 + 右上角"全屏"按钮切换为覆盖整屏的完整看板（含 Hero / KPI / 趋势图 / 供需 / 竞品 / AI 策略）</li>
        <li><strong>4. 信息密度优化：</strong>抽屉加宽至 720px，KPI 4 列、参数 4 列网格，流程步骤条改为紧凑横向 Pill，时间线可折叠</li>
        <li><strong>5. 视觉风格：</strong>沿用 docs/ledger-category-refactor-demo 的 Apricot Wash 暖色系（rust #5d2a1a / warm-grad #fbe1d1）</li>
      </ul>
      <div style={{ marginTop: 10, fontSize: 11, color: "var(--ash)" }}>
        快捷键：<code style={{ background: "#fff", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>ESC</code> 关闭抽屉 / 退出全屏
      </div>
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));
