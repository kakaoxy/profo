/* global React, window */
// ============================================================
// 线索信息 Tab：
// KPI + 房屋参数 + 业主补充信息 + 影像库缩略图 + 决策面板
// + 价格历史 + 可折叠跟进时间线
// ============================================================

const { useState } = React;
const { Icon } = window;
const { LEAD_STATUSES, FOLLOW_UPS, PRICE_HISTORY } = window;

function InfoTab({ lead }) {
  return (
    <div>
      <KpiRow lead={lead} />
      <ParamsSection lead={lead} />
      <OwnerNotesSection lead={lead} />
      <ImagesSection lead={lead} />
      <DecisionPanel lead={lead} />
      <PriceHistorySection />
      <FollowUpTimeline lead={lead} />
    </div>
  );
}

// —— KPI 卡片行 ——
function KpiRow({ lead }) {
  const hasEval = lead.evalPrice != null;
  const deltaPct = hasEval
    ? ((lead.evalPrice / lead.totalPrice - 1) * 100).toFixed(1)
    : null;
  const deltaValue = hasEval ? lead.evalPrice - lead.totalPrice : null;

  return (
    <div className="kpi-grid">
      <div className="kpi-card">
        <span className="kpi-label">
          <Icon name="wallet" size={11} />
          业主报价
        </span>
        <span className="kpi-value tabular-nums">
          ¥{lead.totalPrice}
          <span className="kpi-suffix">万</span>
        </span>
        <span className="kpi-meta">
          ¥{lead.unitPrice.toFixed(2)} 万/㎡
        </span>
      </div>
      <div className={`kpi-card ${hasEval ? "success" : ""}`}>
        <span className="kpi-label">
          <Icon name="target" size={11} />
          评估价
        </span>
        <span className="kpi-value tabular-nums">
          {hasEval ? `¥${lead.evalPrice}` : "待评估"}
          {hasEval && <span className="kpi-suffix">万</span>}
        </span>
        <span className={`kpi-meta ${deltaValue < 0 ? "down" : "up"}`}>
          {hasEval
            ? `${deltaValue > 0 ? "+" : ""}${deltaValue} 万 · ${deltaPct}%`
            : "尚未录入评估价"}
        </span>
      </div>
      <div className="kpi-card">
        <span className="kpi-label">
          <Icon name="ruler" size={11} />
          面积 / 单价
        </span>
        <span className="kpi-value tabular-nums">
          {lead.area}
          <span className="kpi-suffix">㎡</span>
        </span>
        <span className="kpi-meta">¥{lead.unitPrice.toFixed(2)} 万/㎡</span>
      </div>
      <div className="kpi-card warm">
        <span className="kpi-label">
          <Icon name="trending" size={11} />
          报价偏离
        </span>
        <span className="kpi-value tabular-nums">
          {deltaPct ? `${deltaPct}%` : "--"}
        </span>
        <span className="kpi-meta">
          {hasEval && deltaValue < 0
            ? `低于报价 ${Math.abs(deltaValue)} 万`
            : hasEval
              ? "评估价 ≥ 报价"
              : "待评估计算"}
        </span>
      </div>
    </div>
  );
}

// —— 房屋参数网格 ——
function ParamsSection({ lead }) {
  const params = [
    { icon: "ruler", label: "面积", value: `${lead.area}㎡` },
    { icon: "home", label: "户型", value: lead.layout },
    { icon: "arrowRightLeft", label: "朝向", value: lead.orientation },
    { icon: "building", label: "楼层", value: lead.floorInfo },
    { icon: "mapPin", label: "商圈", value: `${lead.district} · ${lead.businessArea}` },
    { icon: "user", label: "录入人", value: lead.creatorName },
    { icon: "clock", label: "建档时间", value: lead.createdAt },
    {
      icon: "history",
      label: "最近跟进",
      value: lead.lastFollowUpAt || "—",
    },
  ];

  return (
    <section className="section">
      <div className="section-head compact">
        <span className="section-title">
          <Icon name="layers" size={13} />
          房屋参数
        </span>
        <span className="text-xxs text-ash">8 项</span>
      </div>
      <div className="section-body compact">
        <div className="param-grid">
          {params.map((p) => (
            <div className="param-cell" key={p.label}>
              <span className="param-label">
                <Icon name={p.icon} size={11} />
                {p.label}
              </span>
              <span className="param-value">{p.value}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// —— 业主补充信息（重点新增） ——
function OwnerNotesSection({ lead }) {
  const hasNotes = lead.remarks && lead.remarks.trim().length > 0;
  return (
    <section className="section">
      <div className="section-head compact">
        <span className="section-title">
          <Icon name="quote" size={13} />
          业主补充信息
          <span className="accent">·</span>
          <span className="text-xxs text-ash" style={{ fontWeight: 500 }}>
            C 端提交评估时填写
          </span>
        </span>
        {hasNotes && (
          <span className="text-xxs text-ash">{lead.remarks.length} 字</span>
        )}
      </div>
      <div className="section-body compact">
        {hasNotes ? (
          <div className="owner-notes">
            <span className="quote-mark">"</span>
            <div className="notes-text">{lead.remarks}</div>
            <div className="owner-notes-meta">
              <span>
                <Icon name="user" size={10} /> 业主提交 · {lead.createdAt}
              </span>
              <span>来自 C 端估价表单</span>
            </div>
          </div>
        ) : (
          <div className="owner-notes-empty">
            业主未在 C 端提交补充信息
          </div>
        )}
      </div>
    </section>
  );
}

// —— 影像库（横向缩略图条） ——
function ImagesSection({ lead }) {
  const [selected, setSelected] = useState(null);
  return (
    <section className="section">
      <div className="section-head compact">
        <span className="section-title">
          <Icon name="image" size={13} />
          影像库
          <span className="accent">·</span>
          <span className="text-xxs text-ash" style={{ fontWeight: 500 }}>
            户型图 / 实勘 / 产证
          </span>
        </span>
        <div className="section-head-actions">
          <span className="text-xxs text-ash">{lead.images.length} / 20</span>
          <button className="btn btn-sm btn-ghost">
            <Icon name="eye" size={12} />
            全部查看
          </button>
        </div>
      </div>
      <div className="image-strip no-scrollbar">
        {lead.images.map((url, idx) => (
          <div
            className="image-thumb"
            key={idx}
            onClick={() => setSelected(idx)}
            title={`图片 ${idx + 1}`}
          >
            <img
              className="image-thumb-img"
              src={url}
              alt={`图片 ${idx + 1}`}
              loading="lazy"
            />
          </div>
        ))}
        <button className="image-add-thumb" title="上传新图片">
          <Icon name="image" size={18} />
          <span>添加</span>
        </button>
      </div>
      {selected != null && (
        <ImageLightbox
          images={lead.images}
          startIndex={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}

// —— 图片放大查看 ——
function ImageLightbox({ images, startIndex, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  const total = images.length;
  const go = (delta) => setIdx((i) => (i + delta + total) % total);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(23, 25, 28, 0.85)",
        backdropFilter: "blur(8px)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <button
        className="icon-btn"
        style={{ position: "absolute", top: 24, right: 24 }}
        onClick={onClose}
      >
        <Icon name="close" size={18} />
      </button>
      <button
        className="icon-btn"
        style={{ position: "absolute", left: 24, top: "50%" }}
        onClick={(e) => {
          e.stopPropagation();
          go(-1);
        }}
      >
        <Icon name="chevronLeft" size={18} />
      </button>
      <img
        src={images[idx]}
        alt={`图片 ${idx + 1}`}
        style={{
          maxWidth: "80vw",
          maxHeight: "80vh",
          borderRadius: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        className="icon-btn"
        style={{ position: "absolute", right: 24, top: "50%" }}
        onClick={(e) => {
          e.stopPropagation();
          go(1);
        }}
      >
        <Icon name="chevronRight" size={18} />
      </button>
      <div
        style={{
          position: "absolute",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(255,255,255,0.9)",
          padding: "6px 14px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          color: "var(--ink)",
        }}
      >
        {idx + 1} / {total}
      </div>
    </div>
  );
}

// —— 决策面板 ——
function DecisionPanel({ lead }) {
  const [evalPrice, setEvalPrice] = useState("");
  const [auditReason, setAuditReason] = useState("");

  if (lead.status === LEAD_STATUSES.PENDING_ASSESSMENT) {
    return (
      <section className="section decision-panel">
        <div className="section-head compact">
          <span className="section-title">
            <Icon name="gavel" size={13} />
            管理决策终端
            <span className="accent">·</span>
            <span className="text-xxs text-rust" style={{ fontWeight: 600 }}>
              待评估
            </span>
          </span>
        </div>
        <div className="section-body compact">
          <div className="decision-status warn">
            <span className="decision-status-icon">!</span>
            <div>
              <strong>等待评估决策</strong>
              <div style={{ marginTop: 2, fontSize: 11.5, color: "#8a6308" }}>
                请结合业主补充信息、影像库与数据大盘综合判断，录入评估价后选择批准约看或驳回。
              </div>
            </div>
          </div>
          <div style={{ height: 12 }} />
          <div className="decision-form">
            <div className="input-group">
              <label className="input-label">拟收房评估价</label>
              <div className="input-with-suffix">
                <input
                  type="number"
                  className="input"
                  placeholder="输入评估价"
                  value={evalPrice}
                  onChange={(e) => setEvalPrice(e.target.value)}
                  style={{ fontWeight: 600, color: "var(--success)" }}
                />
                <span className="suffix">万</span>
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">评估意见摘要</label>
              <input
                className="input"
                placeholder="如：溢价控制、户型优劣、学区加持..."
                value={auditReason}
                onChange={(e) => setAuditReason(e.target.value)}
              />
            </div>
          </div>
          <div className="decision-actions">
            <button className="btn btn-success btn-lg">
              <Icon name="check" size={14} />
              批准约看排期
            </button>
            <button className="btn btn-outline-danger btn-lg">
              <Icon name="close" size={14} />
              评估不符 · 驳回
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (lead.status === LEAD_STATUSES.PENDING_VISIT) {
    return (
      <section className="section decision-panel">
        <div className="section-head compact">
          <span className="section-title">
            <Icon name="gavel" size={13} />
            管理决策终端
            <span className="accent">·</span>
            <span className="text-xxs text-rust" style={{ fontWeight: 600 }}>
              待看房
            </span>
          </span>
        </div>
        <div className="section-body compact">
          <div className="decision-status warn">
            <span className="decision-status-icon">!</span>
            <div>
              <strong>当前阶段：实勘核验</strong>
              <div style={{ marginTop: 2, fontSize: 11.5, color: "#8a6308" }}>
                请协调实勘人员在 48 小时内完成上门，重点核实房屋漏水、结构改动及物业欠费情况。
              </div>
            </div>
          </div>
          <div style={{ height: 10 }} />
          <button className="btn btn-primary btn-block btn-lg">
            <Icon name="checkCircle" size={14} />
            确认已完成现场实勘
          </button>
        </div>
      </section>
    );
  }

  if (lead.status === LEAD_STATUSES.VISITED) {
    return (
      <section className="section decision-panel">
        <div className="section-head compact">
          <span className="section-title">
            <Icon name="gavel" size={13} />
            管理决策终端
            <span className="accent">·</span>
            <span className="text-xxs text-rust" style={{ fontWeight: 600 }}>
              已看房
            </span>
          </span>
        </div>
        <div className="section-body compact">
          <div className="decision-status success">
            <span className="decision-status-icon">✓</span>
            <div>
              <strong>实勘通过 · 等待签约</strong>
              <div style={{ marginTop: 2, fontSize: 11.5, color: "#186640" }}>
                实勘报告已归档，数据模型显示该房源具备 Flip 价值。请发起最终商务谈判。
              </div>
            </div>
          </div>
          <div style={{ height: 10 }} />
          <button className="btn btn-primary btn-block btn-lg">
            <Icon name="fileCheck" size={14} />
            确认合同签署并收房
          </button>
        </div>
      </section>
    );
  }

  if (lead.status === LEAD_STATUSES.SIGNED) {
    return (
      <section className="section decision-panel">
        <div className="section-head compact">
          <span className="section-title">
            <Icon name="gavel" size={13} />
            管理决策终端
            <span className="accent">·</span>
            <span className="text-xxs text-rust" style={{ fontWeight: 600 }}>
              已签约
            </span>
          </span>
        </div>
        <div className="section-body compact">
          <div className="decision-status success">
            <span className="decision-status-icon">✓</span>
            <div>
              <strong>恭喜！已完成资产收储</strong>
              <div style={{ marginTop: 2, fontSize: 11.5, color: "#186640" }}>
                该房源已进入"工程翻新"阶段，可在项目模块继续跟进。
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (lead.status === LEAD_STATUSES.REJECTED) {
    return (
      <section className="section decision-panel">
        <div className="section-head compact">
          <span className="section-title">
            <Icon name="gavel" size={13} />
            管理决策终端
            <span className="accent">·</span>
            <span className="text-xxs text-rust" style={{ fontWeight: 600 }}>
              已驳回
            </span>
          </span>
        </div>
        <div className="section-body compact">
          <div className="decision-status danger">
            <span className="decision-status-icon">✕</span>
            <div>
              <strong>线索已驳回</strong>
              <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--danger)" }}>
                驳回原因：{lead.auditReason || "未填写具体原因"}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return null;
}

// —— 价格历史 ——
function PriceHistorySection() {
  return (
    <section className="section">
      <div className="section-head compact">
        <span className="section-title">
          <Icon name="trending" size={13} />
          价格历史
        </span>
        <span className="text-xxs text-ash">{PRICE_HISTORY.length} 条记录</span>
      </div>
      <div className="section-body flush">
        <div className="price-history">
          {PRICE_HISTORY.map((ph, idx) => {
            const isLatest = idx === 0;
            const deltaClass =
              ph.delta > 0 ? "up" : ph.delta < 0 ? "down" : "flat";
            const deltaIcon =
              ph.delta > 0 ? "↑" : ph.delta < 0 ? "↓" : "—";
            return (
              <div className="price-history-row" key={ph.id}>
                <span className="ph-date">{ph.recordedAt}</span>
                <span className="ph-price">¥{ph.price} 万</span>
                <span className={`ph-delta ${deltaClass}`}>
                  {deltaIcon} {ph.delta !== 0 ? `${Math.abs(ph.delta)}万` : "—"}
                  {ph.deltaPct !== 0 ? ` · ${Math.abs(ph.deltaPct)}%` : ""}
                </span>
                <span className="ph-remark">
                  {ph.remark === "Initial Creation" ? "首次建档" : ph.remark}
                  {isLatest && (
                    <span
                      style={{
                        marginLeft: 6,
                        background: "var(--warm-grad)",
                        color: "var(--rust)",
                        padding: "1px 6px",
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      当前
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// —— 跟进时间线（可折叠） ——
function FollowUpTimeline({ lead }) {
  const [open, setOpen] = useState(true);

  // 合并评估事件 + 跟进记录
  const events = [];
  if (
    lead.evalPrice != null ||
    lead.auditReason ||
    lead.auditTime
  ) {
    events.push({
      key: "audit",
      title:
        lead.status === LEAD_STATUSES.REJECTED ? "评估驳回" : "收房评估通过",
      desc:
        lead.evalPrice != null
          ? `拟收房评估价 ¥${lead.evalPrice} 万${
              lead.auditReason ? " · " + lead.auditReason : ""
            }`
          : lead.auditReason
            ? `评估意见：${lead.auditReason}`
            : "评估通过，未填写评估价",
      time: lead.auditTime || lead.updatedAt,
      icon: "gavel",
      type:
        lead.status === LEAD_STATUSES.REJECTED ? "rejected" : "success",
    });
  }
  FOLLOW_UPS.forEach((f) => {
    events.push({
      key: f.id,
      title:
        f.method === "visit"
          ? "带看实勘"
          : f.method === "phone"
            ? "电话沟通"
            : f.method === "wechat"
              ? "微信联络"
              : "流转更新",
      desc: f.content,
      time: f.followedAt,
      icon: f.method === "visit" ? "eye" : "messageCircle",
      type: "",
      user: f.createdBy,
    });
  });
  events.push({
    key: "create",
    title: "线索初始录入",
    desc: `由 ${lead.creatorName} 首次采集并建档`,
    time: lead.createdAt,
    icon: "plus",
    type: "",
  });

  const formatTime = (t) => {
    if (!t) return "—";
    try {
      const d = new Date(t);
      if (isNaN(d.getTime())) return t;
      return d.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return t;
    }
  };

  return (
    <section className="section">
      <button
        className="collapsible-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="section-title" style={{ padding: 0 }}>
          <Icon name="history" size={13} />
          流转轨迹
          <span className="accent">·</span>
          <span className="text-xxs text-ash" style={{ fontWeight: 500 }}>
            {events.length} 条事件
          </span>
        </span>
        <span className={`collapsible-arrow ${open ? "open" : ""}`}>
          <Icon name="chevronRight" size={14} />
        </span>
      </button>
      {open && (
        <div className="section-body flush">
          <div className="timeline">
            {events.map((e, idx) => (
              <div
                className={`timeline-item ${idx === 0 ? "latest" : ""} ${e.type}`}
                key={e.key}
              >
                <span className="timeline-dot" />
                <div className="timeline-head">
                  <span className="timeline-title">
                    <Icon
                      name={e.icon}
                      size={11}
                      style={{ marginRight: 4, verticalAlign: -1 }}
                    />
                    {e.title}
                  </span>
                  <span className="timeline-time">{formatTime(e.time)}</span>
                </div>
                <div className="timeline-desc">{e.desc}</div>
                {e.user && (
                  <span className="timeline-user">
                    <Icon name="user" size={10} />
                    {e.user}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

Object.assign(window, { InfoTab });
