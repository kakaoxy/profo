/* global React, window */
// ============================================================
// 数据大盘 Tab：
// - 嵌入式精简看板（在抽屉内）+ 全屏完整看板（覆盖整屏）
// - 共享 5 个子模块：MarketKpiRow / TrendChart / SupplyDemand /
//   CompetitorTable / AiStrategyCard
// ============================================================

const { Icon } = window;
const { MARKET_DATA } = window;

// —— 共享子模块 ——

function MarketKpiRow({ fullscreen = false }) {
  const m = MARKET_DATA.community;
  const inventoryMeta =
    m.inventoryMonths < 12
      ? { text: "市场活跃", cls: "success" }
      : m.inventoryMonths < 24
        ? { text: "商圈活跃", cls: "warn" }
        : { text: "市场平稳", cls: "danger" };

  return (
    <div className="monitor-kpi-row">
      <div className={`monitor-kpi ${fullscreen ? "warm" : ""}`}>
        <span className="monitor-kpi-label">
          <Icon name="pieChart" size={11} />
          小区均价
        </span>
        <span className="monitor-kpi-value tabular-nums">
          {(m.avgPrice / 10000).toFixed(2)}
          <span className="monitor-kpi-suffix">万/㎡</span>
        </span>
        <span className={`monitor-kpi-meta ${
          m.avgPriceChange < 0 ? "text-success" : "text-danger"
        }`}>
          {m.avgPriceChange < 0 ? "↓" : "↑"} 同比 {Math.abs(m.avgPriceChange)}%
        </span>
      </div>
      <div className="monitor-kpi">
        <span className="monitor-kpi-label">
          <Icon name="barChart" size={11} />
          12 月成交
        </span>
        <span className="monitor-kpi-value tabular-nums">
          {m.deals12m}
          <span className="monitor-kpi-suffix">套</span>
        </span>
        <span className="monitor-kpi-meta">平均去化 {m.avgDaysOnMarket} 天</span>
      </div>
      <div className="monitor-kpi">
        <span className="monitor-kpi-label">
          <Icon name="timer" size={11} />
          去化压力
        </span>
        <span className="monitor-kpi-value tabular-nums">
          {m.inventoryMonths}
          <span className="monitor-kpi-suffix">月</span>
        </span>
        <span className={`monitor-kpi-meta ${inventoryMeta.cls}`}>
          {inventoryMeta.text}
        </span>
      </div>
    </div>
  );
}

function TrendChart({ fullscreen = false }) {
  const trend = MARKET_DATA.trend12m;
  const max = Math.max(...trend.map((t) => t.value));
  const min = Math.min(...trend.map((t) => t.value));
  const range = max - min || 1;

  return (
    <div className="monitor-card full-width">
      <div className="monitor-card-head">
        <span className="monitor-card-title">
          <Icon name="trending" size={13} />
          小区均价 12 个月趋势
        </span>
        <span className="text-xxs text-ash">单位：元/㎡</span>
      </div>
      <div className="monitor-card-body">
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 6,
            height: fullscreen ? 180 : 120,
            paddingTop: 8,
            paddingBottom: 22,
            position: "relative",
          }}
        >
          {trend.map((t, idx) => {
            const h = ((t.value - min) / range) * 100;
            const isLast = idx === trend.length - 1;
            return (
              <div
                key={t.month}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  height: "100%",
                  position: "relative",
                }}
                title={`${t.month}：${t.value.toLocaleString()} 元/㎡`}
              >
                <div
                  style={{
                    width: "100%",
                    maxWidth: 32,
                    flex: 1,
                    background: isLast
                      ? "var(--rust)"
                      : "linear-gradient(180deg, #fbe1d1, rgba(251,225,209,0.5))",
                    borderRadius: "4px 4px 0 0",
                    minHeight: 4,
                    marginTop: "auto",
                    transition: "background 0.2s",
                    cursor: "pointer",
                  }}
                />
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--ash)",
                    marginTop: 4,
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.month}
                </div>
                {isLast && (
                  <div
                    style={{
                      position: "absolute",
                      top: -2,
                      left: "50%",
                      transform: "translateX(-50%)",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--rust)",
                      background: "#fff",
                      padding: "1px 5px",
                      borderRadius: 4,
                      border: "1px solid #f5d9c2",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {(t.value / 10000).toFixed(2)}万
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SupplyDemand() {
  const supply = MARKET_DATA.supply;
  const demand = MARKET_DATA.demand;
  return (
    <div className="monitor-card">
      <div className="monitor-card-head">
        <span className="monitor-card-title">
          <Icon name="activity" size={13} />
          区域供需（7 日）
        </span>
      </div>
      <div className="monitor-card-body">
        <div className="supply-demand">
          <div className="sd-item">
            <div className="sd-label">新增挂牌</div>
            <div className="sd-value">{supply.newListing7d}</div>
            <div className="sd-meta">活跃 {supply.totalActive} 套</div>
          </div>
          <div className="sd-item">
            <div className="sd-label">下架</div>
            <div className="sd-value">{supply.removedListing7d}</div>
            <div className="sd-meta success">流通正常</div>
          </div>
          <div className="sd-item">
            <div className="sd-label">咨询量</div>
            <div className="sd-value">{demand.inquiries7d}</div>
            <div className="sd-meta">7 日</div>
          </div>
          <div className="sd-item">
            <div className="sd-label">带看量</div>
            <div className="sd-value">{demand.viewings7d}</div>
            <div className="sd-meta success">30 日成交 {demand.deals30d} 套</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompetitorTable() {
  const competitors = MARKET_DATA.competitors;
  return (
    <div className="monitor-card">
      <div className="monitor-card-head">
        <span className="monitor-card-title">
          <Icon name="users" size={13} />
          同小区竞品对比
        </span>
        <span className="text-xxs text-ash">{competitors.length} 套在售</span>
      </div>
      <div className="monitor-card-body">
        <div className="competitor-list">
          {competitors.map((c, idx) => (
            <div
              className={`competitor-row ${c.isCurrent ? "highlight" : ""}`}
              key={idx}
            >
              <span className="competitor-name">{c.name}</span>
              <span className="competitor-price">¥{c.price} 万</span>
              <span className="competitor-days">挂牌 {c.daysOnMarket} 天</span>
              {c.isCurrent ? (
                <span className="competitor-tag">本线索</span>
              ) : (
                <span className="text-xxs text-ash">—</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AiStrategyCard() {
  const ai = MARKET_DATA.aiStrategy;
  return (
    <div className="monitor-card full-width">
      <div className="monitor-card-head">
        <span className="monitor-card-title">
          <Icon name="sparkles" size={13} />
          AI 策略建议
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--rust)",
            background: "var(--warm-grad)",
            padding: "2px 8px",
            borderRadius: 999,
          }}
        >
          评分 {ai.score} · {ai.recommendation}
        </span>
      </div>
      <div className="monitor-card-body">
        <div className="ai-strategy">
          <div className="ai-strategy-title">
            <Icon name="zap" size={12} />
            核心判断
          </div>
          <ul className="ai-strategy-points">
            {ai.points.map((p, idx) => (
              <li key={idx}>{p}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// —— Hero 信息卡（仅全屏模式） ——
function MonitorHero({ lead }) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #fdf6ef 0%, #fbe1d1 100%)",
        borderRadius: 16,
        padding: "20px 24px",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        border: "1px solid #f5d9c2",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--rust)",
            letterSpacing: 0.8,
            textTransform: "uppercase",
            marginBottom: 4,
          }}
        >
          <Icon name="compass" size={12} style={{ marginRight: 4 }} />
          实时遥测 · Property Real-time Telemetry
        </div>
        <h2
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            color: "var(--ink)",
            letterSpacing: -0.3,
          }}
        >
          {lead.communityName} · 监控看板
        </h2>
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: "var(--graphite)",
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span>{lead.layout} · {lead.area}㎡ · {lead.floorInfo}</span>
          <span>·</span>
          <span>{lead.district} {lead.businessArea}</span>
          <span>·</span>
          <span>报价 ¥{lead.totalPrice} 万</span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(255,255,255,0.6)",
          padding: "6px 12px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          color: "var(--success)",
          border: "1px solid #c5e3d0",
        }}
      >
        <Icon name="activity" size={13} />
        实时数据同步
      </div>
    </div>
  );
}

// —— 嵌入式精简看板（在抽屉内） ——
function MonitorTab({ lead }) {
  return (
    <div className="monitor-grid">
      <div className="monitor-card full-width">
        <div className="monitor-card-head">
          <span className="monitor-card-title">
            <Icon name="building" size={13} />
            {MARKET_DATA.community.name} · 市场快照
          </span>
          <span className="text-xxs text-ash">数据更新于今日 09:32</span>
        </div>
        <div className="monitor-card-body">
          <MarketKpiRow />
        </div>
      </div>

      <TrendChart />
      <SupplyDemand />
      <CompetitorTable />
      <AiStrategyCard />

      <div
        className="monitor-card full-width"
        style={{ background: "var(--bg-warm)", border: "1px dashed #f5d9c2" }}
      >
        <div className="monitor-card-body" style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 12,
              color: "var(--rust)",
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            <Icon name="maximize" size={13} style={{ marginRight: 4 }} />
            需要更详细的市场分析？
          </div>
          <div style={{ fontSize: 11, color: "var(--ash)" }}>
            点击右上角"全屏"按钮，查看完整的区域供需全景与竞品深度对比
          </div>
        </div>
      </div>
    </div>
  );
}

// —— 全屏完整看板 ——
function MonitorFullscreen({ lead, onExit }) {
  return (
    <div className="monitor-fullscreen">
      <header className="monitor-fullscreen-header">
        <div className="monitor-fullscreen-title">
          <h2>{lead.communityName} · 监控看板</h2>
          <span className="sub">Property Real-time Telemetry · 实时遥测</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              fontWeight: 600,
              color: "var(--success)",
              background: "var(--success-soft)",
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #c5e3d0",
            }}
          >
            <Icon name="activity" size={11} />
            实时数据同步
          </span>
          <button className="btn btn-sm">
            <Icon name="share" size={13} />
            导出报告
          </button>
          <button className="btn btn-sm" onClick={onExit}>
            <Icon name="minimize" size={13} />
            退出全屏
          </button>
        </div>
      </header>
      <main className="monitor-fullscreen-body">
        <div className="monitor-fullscreen-grid">
          <div style={{ gridColumn: "1 / -1" }}>
            <MonitorHero lead={lead} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div className="monitor-card">
              <div className="monitor-card-head">
                <span className="monitor-card-title">
                  <Icon name="building" size={13} />
                  {MARKET_DATA.community.name} · 市场快照
                </span>
                <span className="text-xxs text-ash">数据更新于今日 09:32</span>
              </div>
              <div className="monitor-card-body">
                <MarketKpiRow fullscreen />
              </div>
            </div>
          </div>

          <TrendChart fullscreen />
          <SupplyDemand />
          <CompetitorTable />
          <AiStrategyCard />

          <div
            className="monitor-card full-width"
            style={{
              gridColumn: "1 / -1",
              background: "linear-gradient(135deg, #fffaf3, #fdf3e7)",
              borderLeft: "3px solid var(--rust-3)",
            }}
          >
            <div className="monitor-card-body" style={{ fontSize: 12.5, color: "var(--graphite)", lineHeight: 1.7 }}>
              <strong style={{ color: "var(--rust)" }}>数据说明：</strong>
              以上数据来自贝壳、链家、中原地产等主流平台聚合，每 6 小时同步一次。
              去化压力 = 当前挂牌量 / 近 12 月月均成交套数。AI 策略基于历史成交、
              房源属性与市场情绪模型综合计算，仅供参考，不构成投资建议。
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

Object.assign(window, { MonitorTab, MonitorFullscreen });
