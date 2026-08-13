// ===========================================================
// UserTable — Users Redesign Demo
// 可复用表格组件：内部用户 / C 端用户 共用，
// 通过 tab prop 区分列结构与配色（hover 色、leads-bar 渐变）
// ===========================================================

const { useState } = React;
const { Icon } = window;
const { formatRelative, formatShortDate, formatDateTime, STATUS_LABEL_MAP } = window;

const ROLE_BADGE_CLASS = {
  admin: "role-admin",
  operator: "role-operator",
  user: "role-user",
  customer: "role-customer",
};

const STATUS_BADGE_CLASS = {
  active: "status-active",
  inactive: "status-inactive",
  locked: "status-locked",
};

function Avatar({ user, tab }) {
  const isCustomer = tab === "customer" || user.role.code === "customer";
  const name = user.nickname || user.username;
  const initials = name.slice(0, 1).toUpperCase();
  return (
    <div className={`user-avatar${isCustomer ? " customer" : ""}`}>
      <span className="initials">{initials}</span>
    </div>
  );
}

function RoleBadge({ role }) {
  const cls = ROLE_BADGE_CLASS[role.code] || "role-user";
  return (
    <span className={`role-badge ${cls}`}>
      <span className="dot"></span>
      {role.name}
    </span>
  );
}

function StatusBadge({ status }) {
  const cls = STATUS_BADGE_CLASS[status] || "status-inactive";
  const label = STATUS_LABEL_MAP[status] || status;
  return (
    <span className={`status-badge ${cls}`}>
      <span className="dot"></span>
      {label}
    </span>
  );
}

// 线索数 + 迷你水平条
function LeadsCell({ count, max, tab }) {
  const fillClass = tab === "customer" ? "customer" : "";
  const widthPct = max > 0 ? Math.min(100, (count / max) * 100) : 0;
  return (
    <div className="leads-cell">
      <span className={`leads-count${count === 0 ? " zero" : ""}`}>{count}</span>
      <div className="leads-bar" aria-hidden="true">
        <div
          className={`leads-bar-fill ${fillClass}`}
          style={{ width: `${widthPct}%` }}
        ></div>
      </div>
    </div>
  );
}

function LastLoginCell({ iso }) {
  return (
    <div className="last-login-cell">
      <span className="date-cell">{iso ? formatShortDate(iso) : "—"}</span>
      <span className="last-login-relative">{formatRelative(iso)}</span>
    </div>
  );
}

function BindCell({ bound, channel }) {
  if (!bound) {
    return (
      <span className="bind-cell">
        <span className="bind-icon unbound">
          <Icon name="phone" size={11} />
        </span>
        <span className="text-ash text-xs">仅手机号</span>
      </span>
    );
  }
  return (
    <span className="bind-cell">
      <span className="bind-icon">
        <Icon name="wechat" size={11} />
      </span>
      <span>微信</span>
    </span>
  );
}

function SortableHeader({ label, field, sort, onSort, align }) {
  const isActive = sort.field === field;
  const arrow = isActive ? (sort.dir === "asc" ? "chevronUp" : "chevronDown") : "chevronDown";
  return (
    <th
      className={`sortable${isActive ? " sorted" : ""}`}
      style={align ? { textAlign: align } : undefined}
      onClick={() => onSort(field)}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
        {label}
        <span className="sort-arrow">
          <Icon name={arrow} size={11} strokeWidth={2.2} />
        </span>
      </span>
    </th>
  );
}

function UserTable({
  data,
  tab,
  maxLeads,
  sort,
  onSort,
  onEdit,
  onResetPassword,
  onDelete,
  canEdit,
  canResetPassword,
  canDelete,
}) {
  const [deletingId, setDeletingId] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDeleteClick = (user) => {
    setDeletingId(user.id);
    setConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deletingId && onDelete) onDelete(deletingId);
    setConfirmOpen(false);
    setDeletingId(null);
  };

  const handleCancelDelete = () => {
    setConfirmOpen(false);
    setDeletingId(null);
  };

  if (data.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <Icon name="inbox" size={22} />
        </div>
        <div className="empty-title">未找到匹配的用户</div>
        <div className="empty-desc">尝试调整搜索关键词或筛选条件</div>
      </div>
    );
  }

  return (
    <>
      <table className="user-table" data-tab={tab}>
        <thead>
          <tr>
            <SortableHeader label="用户" field="nickname" sort={sort} onSort={onSort} />
            <SortableHeader label="角色" field="role" sort={sort} onSort={onSort} />
            <SortableHeader label="提交线索" field="leads_count" sort={sort} onSort={onSort} />
            <th>状态</th>
            {tab === "customer" ? <th>注册渠道</th> : <th className="hidden md">手机号</th>}
            <SortableHeader label="最后登录" field="last_login_at" sort={sort} onSort={onSort} />
            <th style={{ textAlign: "right" }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {data.map((user) => (
            <tr key={user.id}>
              <td>
                <div className="user-cell">
                  <Avatar user={user} tab={tab} />
                  <div className="user-info">
                    <span className="user-name">
                      {user.nickname || user.username}
                      {user.is_customer_identity && tab !== "customer" && (
                        <span className="role-extra" title="已启用 C 端身份">
                          <Icon name="customer" size={10} /> C端
                        </span>
                      )}
                    </span>
                    <span className="user-username">{user.username}</span>
                  </div>
                </div>
              </td>
              <td>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                  <RoleBadge role={user.role} />
                  {user.additional_roles && user.additional_roles.length > 0 && (
                    user.additional_roles.map((r) => (
                      <span key={r.id} className="role-extra">
                        +{r.name}
                      </span>
                    ))
                  )}
                </div>
              </td>
              <td>
                <LeadsCell count={user.leads_count} max={maxLeads} tab={tab} />
              </td>
              <td>
                <StatusBadge status={user.status} />
              </td>
              {tab === "customer" ? (
                <td>
                  <BindCell bound={user.wechat_bound} channel={user.register_channel} />
                </td>
              ) : (
                <td className="date-cell nowrap">{user.phone || "—"}</td>
              )}
              <td>
                <LastLoginCell iso={user.last_login_at} />
              </td>
              <td>
                <div className="row-actions">
                  {canEdit && (
                    <button
                      className="icon-btn primary"
                      onClick={() => onEdit(user)}
                      title="编辑用户"
                    >
                      <Icon name="edit" size={14} />
                    </button>
                  )}
                  {canResetPassword && (
                    <button
                      className="icon-btn"
                      onClick={() => onResetPassword(user)}
                      title="重置密码"
                    >
                      <Icon name="key" size={14} />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      className="icon-btn danger"
                      onClick={() => handleDeleteClick(user)}
                      title="删除用户"
                      disabled={user.username === "admin"}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 删除确认对话框 */}
      {confirmOpen && (
        <div
          className="drawer-backdrop"
          style={{ zIndex: 200 }}
          onClick={handleCancelDelete}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "#fff",
              borderRadius: 14,
              padding: "22px 24px",
              width: 380,
              maxWidth: "90vw",
              boxShadow: "0 12px 32px -8px rgba(93, 42, 26, 0.18), 0 0 0 1px rgba(4, 23, 43, 0.06)",
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "var(--danger-soft)",
                  color: "var(--danger)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name="alertTriangle" size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
                  确认删除用户？
                </div>
                <div style={{ fontSize: 12.5, color: "var(--graphite)", lineHeight: 1.6 }}>
                  此操作无法撤销。删除后该用户将无法登录系统，且其历史提交记录将保留但不再归属。
                </div>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 18,
              }}
            >
              <button className="btn btn-ghost btn-sm" onClick={handleCancelDelete}>
                取消
              </button>
              <button className="btn btn-outline-danger btn-sm" onClick={handleConfirmDelete}>
                <Icon name="trash" size={13} />
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

Object.assign(window, { UserTable });
