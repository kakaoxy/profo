/* global React, window */
// ============================================================
// 主抽屉容器：720px 宽 + 2 tabs + 数据大盘全屏切换
// ============================================================

const { useState, useEffect } = React;
const { Icon, InfoTab, MonitorTab, MonitorFullscreen } = window;
const { LEAD_STATUSES, STATUS_LABELS, STATUS_CLASS_MAP } = window;

const LIFECYCLE_STEPS = [
  { status: LEAD_STATUSES.PENDING_ASSESSMENT, label: "待评估", step: 0 },
  { status: LEAD_STATUSES.PENDING_VISIT, label: "待看房", step: 1 },
  { status: LEAD_STATUSES.VISITED, label: "已看房", step: 2 },
  { status: LEAD_STATUSES.SIGNED, label: "已签约", step: 3 },
];

function getStepState(lead) {
  if (lead.status === LEAD_STATUSES.REJECTED) return "rejected";
  const idx = LIFECYCLE_STEPS.findIndex((s) => s.status === lead.status);
  return idx;
}

function LeadDrawer({ lead, isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState("info");
  const [isMonitorFullscreen, setIsMonitorFullscreen] = useState(false);

  // 切换线索时重置 tab
  useEffect(() => {
    if (isOpen) {
      setActiveTab("info");
      setIsMonitorFullscreen(false);
    }
  }, [isOpen, lead?.id]);

  // ESC 关闭
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === "Escape") {
        if (isMonitorFullscreen) setIsMonitorFullscreen(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, isMonitorFullscreen, onClose]);

  if (!isOpen || !lead) return null;

  const stepIdx = getStepState(lead);
  const isRejected = lead.status === LEAD_STATUSES.REJECTED;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="线索详情">
        <DrawerHeader lead={lead} onClose={onClose} />
        <LifecycleBar stepIdx={stepIdx} isRejected={isRejected} />
        <TabsNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          imagesCount={lead.images.length}
          isMonitorFullscreen={isMonitorFullscreen}
          onToggleFullscreen={() => setIsMonitorFullscreen((v) => !v)}
        />
        <div className="drawer-body no-scrollbar">
          {activeTab === "info" ? (
            <InfoTab lead={lead} />
          ) : (
            <MonitorTab
              lead={lead}
              isFullscreen={isMonitorFullscreen}
              onToggleFullscreen={() => setIsMonitorFullscreen((v) => !v)}
            />
          )}
        </div>
      </aside>

      {isMonitorFullscreen && activeTab === "monitor" && (
        <MonitorFullscreen
          lead={lead}
          onExit={() => setIsMonitorFullscreen(false)}
        />
      )}
    </>
  );
}

// —— 抽屉头部 ——
function DrawerHeader({ lead, onClose }) {
  const statusClass = STATUS_CLASS_MAP[lead.status];
  return (
    <header className="drawer-header">
      <div className="drawer-header-row1">
        <div className="drawer-header-left">
          <div className="drawer-case-id">
            <span>Case #{lead.id}</span>
            <span className={`status-badge ${statusClass}`}>
              <span className="dot"></span>
              {STATUS_LABELS[lead.status]}
            </span>
          </div>
          <h2 className="drawer-title">{lead.communityName}</h2>
          <div className="drawer-header-meta">
            <span className="item">
              <Icon name="mapPin" size={12} />
              <span className="label">区域</span>
              <span>{lead.district} · {lead.businessArea}</span>
            </span>
            <span className="item">
              <Icon name="user" size={12} />
              <span className="label">录入</span>
              <span>{lead.creatorName}</span>
            </span>
            <span className="item">
              <Icon name="clock" size={12} />
              <span className="label">建档</span>
              <span>{lead.createdAt}</span>
            </span>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="关闭">
          <Icon name="close" size={16} />
        </button>
      </div>
    </header>
  );
}

// —— 流程步骤条（紧凑横版）——
function LifecycleBar({ stepIdx, isRejected }) {
  if (isRejected) {
    return (
      <div className="lifecycle-bar">
        <span className="lifecycle-step rejected">
          <span className="num">✕</span>
          已驳回
        </span>
        <span className="lifecycle-arrow">·</span>
        <span className="lifecycle-step">
          <span className="num">1</span>
          待评估
        </span>
        <span className="lifecycle-arrow">→</span>
        <span className="lifecycle-step">
          <span className="num">2</span>
          待看房
        </span>
        <span className="lifecycle-arrow">→</span>
        <span className="lifecycle-step">
          <span className="num">3</span>
          已看房
        </span>
        <span className="lifecycle-arrow">→</span>
        <span className="lifecycle-step">
          <span className="num">4</span>
          已签约
        </span>
      </div>
    );
  }

  return (
    <div className="lifecycle-bar no-scrollbar">
      {LIFECYCLE_STEPS.map((step, idx) => {
        const cls = idx < stepIdx ? "done" : idx === stepIdx ? "active" : "";
        return (
          <React.Fragment key={step.status}>
            <span className={`lifecycle-step ${cls}`}>
              <span className="num">{idx < stepIdx ? "✓" : idx + 1}</span>
              {step.label}
            </span>
            {idx < LIFECYCLE_STEPS.length - 1 && (
              <span className="lifecycle-arrow">→</span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// —— Tab 导航 ——
function TabsNav({ activeTab, onTabChange, imagesCount, isMonitorFullscreen, onToggleFullscreen }) {
  return (
    <div className="drawer-tabs">
      <div className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === "info" ? "active" : ""}`}
          onClick={() => onTabChange("info")}
        >
          <Icon name="fileCheck" size={14} />
          线索信息
          <span className="badge-num">{imagesCount + 6}</span>
        </button>
        <button
          className={`tab-btn ${activeTab === "monitor" ? "active" : ""}`}
          onClick={() => onTabChange("monitor")}
        >
          <Icon name="activity" size={14} />
          数据大盘
        </button>
      </div>
      <div className="tabs-actions">
        {activeTab === "monitor" && (
          <button
            className="btn btn-sm"
            onClick={onToggleFullscreen}
            title={isMonitorFullscreen ? "退出全屏" : "全屏看板"}
          >
            <Icon name={isMonitorFullscreen ? "minimize" : "maximize"} size={13} />
            {isMonitorFullscreen ? "退出全屏" : "全屏"}
          </button>
        )}
        <button className="icon-btn" title="导出">
          <Icon name="download" size={14} />
        </button>
        <button className="icon-btn" title="分享">
          <Icon name="share" size={14} />
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { LeadDrawer });
