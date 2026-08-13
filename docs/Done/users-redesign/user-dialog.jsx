// ===========================================================
// UserDialog — Users Redesign Demo
// 新建/编辑用户抽屉（drawer-style），右侧滑出
// 内部用户：可编辑角色 / 状态 / 手机号 / 启用C端身份
// C 端用户：可编辑昵称 / 状态 / 重置 C 端密码 / 解绑微信
// ===========================================================

const { useState, useEffect } = React;
const { Icon, ROLES, INTERNAL_ROLE_OPTIONS, STATUS_OPTIONS } = window;

function UserDialog({ open, mode, user, tab, onClose, onSubmit }) {
  const [form, setForm] = useState({
    username: "",
    nickname: "",
    password: "",
    phone: "",
    role_id: "",
    status: "active",
    is_customer_identity: false,
    wechat_bound: false,
  });

  useEffect(() => {
    if (open) {
      if (mode === "edit" && user) {
        setForm({
          username: user.username || "",
          nickname: user.nickname || "",
          password: "",
          phone: user.phone || "",
          role_id: user.role?.id || "",
          status: user.status || "active",
          is_customer_identity: user.is_customer_identity || false,
          wechat_bound: user.wechat_bound || false,
        });
      } else {
        // create mode
        setForm({
          username: "",
          nickname: "",
          password: "",
          phone: "",
          role_id: tab === "customer" ? ROLES.CUSTOMER.id : "",
          status: "active",
          is_customer_identity: tab === "customer",
          wechat_bound: false,
        });
      }
    }
  }, [open, mode, user, tab]);

  if (!open) return null;

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSubmit) onSubmit(form);
  };

  const isCustomerTab = tab === "customer" || (mode === "edit" && user?.role?.code === "customer");
  const eyebrowText = isCustomerTab ? "C 端用户" : "内部用户";
  const titleText = mode === "edit" ? "编辑用户" : "新建用户";

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose}></div>
      <aside className="drawer" role="dialog" aria-label="用户编辑">
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          {/* Header */}
          <header className="drawer-header">
            <div className="drawer-header-row1">
              <div className="drawer-header-left">
                <div className="drawer-eyebrow">
                  <Icon name={isCustomerTab ? "customer" : "internal"} size={12} />
                  <span style={{ marginLeft: 4 }}>{eyebrowText}</span>
                  <span style={{ margin: "0 6px", opacity: 0.4 }}>·</span>
                  <span>{mode === "edit" ? "编辑" : "新建"}</span>
                </div>
                <h2 className="drawer-title">{titleText}</h2>
                <div className="drawer-header-meta">
                  {mode === "edit" && user && (
                    <>
                      <span className="item">
                        <span className="label">用户ID:</span>
                        <span className="tabular-nums">{user.id}</span>
                      </span>
                      {user.leads_count != null && (
                        <span className="item">
                          <span className="label">提交线索:</span>
                          <span className="tabular-nums font-semibold">{user.leads_count}</span>
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
                <Icon name="close" size={16} />
              </button>
            </div>
          </header>

          {/* Body */}
          <div className="drawer-body">
            {/* 基本信息 */}
            <section className="section">
              <div className="section-head">
                <span className="section-title">
                  <Icon name="user" size={12} />
                  <span>基本信息</span>
                </span>
              </div>
              <div className="section-body">
                <div className="form-grid">
                  <div className="input-group">
                    <label className="input-label">
                      用户名<span className="req">*</span>
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={form.username}
                      onChange={(e) => update("username", e.target.value)}
                      placeholder="字母+数字组合"
                      disabled={mode === "edit"}
                      style={mode === "edit" ? { background: "var(--bg-soft)", color: "var(--ash)" } : undefined}
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">昵称</label>
                    <input
                      type="text"
                      className="input"
                      value={form.nickname}
                      onChange={(e) => update("nickname", e.target.value)}
                      placeholder="用于显示"
                    />
                  </div>
                  {mode === "create" && (
                    <div className="input-group">
                      <label className="input-label">
                        密码<span className="req">*</span>
                      </label>
                      <div className="input-with-suffix">
                        <input
                          type="password"
                          className="input"
                          value={form.password}
                          onChange={(e) => update("password", e.target.value)}
                          placeholder="至少 8 位"
                        />
                        <span className="suffix">8+</span>
                      </div>
                    </div>
                  )}
                  <div className="input-group">
                    <label className="input-label">手机号</label>
                    <input
                      type="text"
                      className="input"
                      value={form.phone}
                      onChange={(e) => update("phone", e.target.value)}
                      placeholder="11 位手机号"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* 权限与身份 */}
            <section className="section">
              <div className="section-head">
                <span className="section-title">
                  <Icon name="shield" size={12} />
                  <span>权限与身份</span>
                </span>
              </div>
              <div className="section-body">
                <div className="form-grid">
                  <div className="input-group">
                    <label className="input-label">
                      主角色<span className="req">*</span>
                    </label>
                    <select
                      className="select"
                      value={form.role_id}
                      onChange={(e) => update("role_id", e.target.value)}
                      disabled={isCustomerTab && mode === "edit"}
                    >
                      <option value="">请选择角色</option>
                      {INTERNAL_ROLE_OPTIONS.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}（{r.code}）
                        </option>
                      ))}
                      <option value={ROLES.CUSTOMER.id}>
                        {ROLES.CUSTOMER.name}（C 端）
                      </option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label className="input-label">状态</label>
                    <select
                      className="select"
                      value={form.status}
                      onChange={(e) => update("status", e.target.value)}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* C 端身份开关（仅内部用户编辑时显示） */}
                {!isCustomerTab && (
                  <div className="switch-row" style={{ marginTop: 12 }}>
                    <div className="switch-text">
                      <span className="title">
                        <Icon name="customer" size={13} />
                        <span style={{ marginLeft: 6 }}>启用 C 端身份</span>
                      </span>
                      <span className="desc">
                        允许该用户使用同一账号登录 C 端，提交线索将同时归集到该用户
                      </span>
                    </div>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={form.is_customer_identity}
                        onChange={(e) => update("is_customer_identity", e.target.checked)}
                      />
                      <span className="switch-slider"></span>
                    </label>
                  </div>
                )}

                {/* 微信绑定（仅 C 端用户编辑时显示） */}
                {isCustomerTab && mode === "edit" && (
                  <div className="switch-row" style={{ marginTop: 12 }}>
                    <div className="switch-text">
                      <span className="title">
                        <Icon name="wechat" size={13} />
                        <span style={{ marginLeft: 6 }}>微信账号绑定</span>
                      </span>
                      <span className="desc">
                        解绑后用户将无法使用微信登录 C 端
                      </span>
                    </div>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={form.wechat_bound}
                        onChange={(e) => update("wechat_bound", e.target.checked)}
                      />
                      <span className="switch-slider"></span>
                    </label>
                  </div>
                )}
              </div>
            </section>

            {/* 安全提示（编辑模式） */}
            {mode === "edit" && (
              <section className="section">
                <div className="section-head">
                  <span className="section-title">
                    <Icon name="lock" size={12} />
                    <span>账号安全</span>
                  </span>
                </div>
                <div className="section-body">
                  <div
                    style={{
                      background: "var(--bg-soft)",
                      border: "1px solid var(--line)",
                      borderRadius: 8,
                      padding: "10px 12px",
                      fontSize: 12,
                      color: "var(--graphite)",
                      lineHeight: 1.6,
                    }}
                  >
                    <Icon name="clock" size={12} />
                    <span style={{ marginLeft: 6 }}>
                      最后登录：<span className="tabular-nums">{user?.last_login_at ? new Date(user.last_login_at).toLocaleString("zh-CN") : "—"}</span>
                    </span>
                    <div style={{ marginTop: 4, color: "var(--ash)", fontSize: 11 }}>
                      修改密码或状态后，系统将立即失效该用户的所有现有 Token。
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    style={{ marginTop: 8, width: "100%" }}
                    onClick={() => alert("重置密码对话框（demo 仅展示）")}
                  >
                    <Icon name="key" size={13} />
                    重置用户密码
                  </button>
                </div>
              </section>
            )}
          </div>

          {/* Footer */}
          <footer className="drawer-footer">
            <div className="drawer-footer-left">
              {mode === "edit" && user && (
                <span>
                  创建于 <span className="tabular-nums">{new Date(user.created_at).toLocaleDateString("zh-CN")}</span>
                </span>
              )}
            </div>
            <div className="drawer-footer-right">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                取消
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                <Icon name="check" size={13} />
                {mode === "edit" ? "保存修改" : "创建用户"}
              </button>
            </div>
          </footer>
        </form>
      </aside>
    </>
  );
}

Object.assign(window, { UserDialog });
