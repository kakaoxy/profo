// ===========================================================
// UsersClient — Users Redesign Demo
// 主应用：顶部统计卡 + Tab 切换 + 工具栏 + 表格 + 抽屉
// ===========================================================

const { useState, useMemo, useCallback } = React;
const { Icon } = window;
const {
  INTERNAL_USERS,
  CUSTOMER_USERS,
  INTERNAL_ROLE_OPTIONS,
  STATUS_OPTIONS,
  ROLES,
} = window;

const DEFAULT_INTERNAL_SORT = { field: "last_login_at", dir: "desc" };
const DEFAULT_CUSTOMER_SORT = { field: "last_login_at", dir: "desc" };

// 工具：根据 sort 字段提取比较值
function getSortValue(user, field) {
  switch (field) {
    case "nickname":
      return (user.nickname || user.username || "").toLowerCase();
    case "role":
      return user.role?.code || "";
    case "leads_count":
      return user.leads_count || 0;
    case "last_login_at":
      return user.last_login_at ? new Date(user.last_login_at).getTime() : 0;
    default:
      return "";
  }
}

function sortUsers(users, sort) {
  const sorted = [...users].sort((a, b) => {
    const va = getSortValue(a, sort.field);
    const vb = getSortValue(b, sort.field);
    let cmp = 0;
    if (typeof va === "number" && typeof vb === "number") {
      cmp = va - vb;
    } else {
      cmp = String(va).localeCompare(String(vb), "zh");
    }
    return sort.dir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

function filterUsers(users, { query, roleId, status }) {
  return users.filter((u) => {
    if (query) {
      const q = query.toLowerCase().trim();
      const matches =
        (u.username && u.username.toLowerCase().includes(q)) ||
        (u.nickname && u.nickname.toLowerCase().includes(q)) ||
        (u.phone && u.phone.includes(q));
      if (!matches) return false;
    }
    if (roleId && roleId !== "all" && u.role?.id !== roleId) return false;
    if (status && status !== "all" && u.status !== status) return false;
    return true;
  });
}

// 顶部统计卡片
function StatGrid({ internal, customer }) {
  const internalTotal = internal.length;
  const customerTotal = customer.length;
  const totalLeads = [...internal, ...customer].reduce((s, u) => s + (u.leads_count || 0), 0);
  const activeSubmitters = [...internal, ...customer].filter((u) => (u.leads_count || 0) > 0).length;
  const customerLeads = customer.reduce((s, u) => s + (u.leads_count || 0), 0);
  const internalLeads = internal.reduce((s, u) => s + (u.leads_count || 0), 0);

  return (
    <div className="stat-grid">
      <div className="stat-card warm">
        <div className="stat-card-accent">
          <Icon name="internal" size={14} />
        </div>
        <div className="stat-label">
          <Icon name="users" size={11} />
          <span>内部用户</span>
        </div>
        <div>
          <span className="stat-value">{internalTotal}</span>
          <span className="stat-suffix">人</span>
        </div>
        <div className="stat-meta">
          活跃 <span className="font-semibold" style={{ color: "var(--rust)" }}>{internal.filter((u) => u.status === "active").length}</span> · 提交线索 <span className="font-semibold" style={{ color: "var(--rust)" }}>{internalLeads}</span>
        </div>
      </div>

      <div className="stat-card success">
        <div className="stat-card-accent">
          <Icon name="customer" size={14} />
        </div>
        <div className="stat-label">
          <Icon name="users" size={11} />
          <span>C 端用户</span>
        </div>
        <div>
          <span className="stat-value">{customerTotal}</span>
          <span className="stat-suffix">人</span>
        </div>
        <div className="stat-meta">
          活跃 <span className="font-semibold" style={{ color: "var(--success)" }}>{customer.filter((u) => u.status === "active").length}</span> · 提交线索 <span className="font-semibold" style={{ color: "var(--success)" }}>{customerLeads}</span>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-card-accent">
          <Icon name="lead" size={14} />
        </div>
        <div className="stat-label">
          <Icon name="activity" size={11} />
          <span>累计线索</span>
        </div>
        <div>
          <span className="stat-value">{totalLeads}</span>
          <span className="stat-suffix">条</span>
        </div>
        <div className="stat-meta">
          <Icon name="trending" size={10} />
          <span>人均 <span className="font-semibold" style={{ color: "var(--ink)" }}>{(totalLeads / (internalTotal + customerTotal)).toFixed(1)}</span> 条</span>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-card-accent">
          <Icon name="userPlus" size={14} />
        </div>
        <div className="stat-label">
          <Icon name="activity" size={11} />
          <span>活跃提交者</span>
        </div>
        <div>
          <span className="stat-value">{activeSubmitters}</span>
          <span className="stat-suffix">人</span>
        </div>
        <div className="stat-meta">
          占比 <span className="font-semibold" style={{ color: "var(--ink)" }}>
            {((activeSubmitters / (internalTotal + customerTotal)) * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// Tab 切换条
function TabsBar({ tab, onTabChange, internalCount, customerCount }) {
  return (
    <div className="tabs-bar">
      <div className="tabs-nav">
        <button
          className={`tab-btn${tab === "internal" ? " active" : ""}`}
          onClick={() => onTabChange("internal")}
        >
          <span className="tab-icon">
            <Icon name="internal" size={14} />
          </span>
          <span>内部用户</span>
          <span className="tab-count">{internalCount}</span>
        </button>
        <button
          className={`tab-btn${tab === "customer" ? " active" : ""}`}
          data-tab="customer"
          onClick={() => onTabChange("customer")}
        >
          <span className="tab-icon">
            <Icon name="customer" size={14} />
          </span>
          <span>C 端用户</span>
          <span className="tab-count">{customerCount}</span>
        </button>
      </div>
      <div style={{ fontSize: 11, color: "var(--ash)", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Icon name="shield" size={11} />
        <span>C 端用户不可登录后台</span>
      </div>
    </div>
  );
}

// 工具栏
function Toolbar({
  tab,
  query,
  setQuery,
  roleId,
  setRoleId,
  status,
  setStatus,
  onSearch,
  onReset,
  canCreate,
  onCreate,
}) {
  const roleOptions = tab === "internal" ? INTERNAL_ROLE_OPTIONS : [ROLES.CUSTOMER];

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <div className="search-wrap">
          <span className="search-icon">
            <Icon name="search" size={14} />
          </span>
          <input
            type="text"
            className="search-input"
            placeholder={tab === "internal" ? "搜索用户名 / 昵称 / 手机号" : "搜索昵称 / 手机号"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearch();
            }}
          />
        </div>
        <select
          className="filter-select"
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
        >
          <option value="all">所有角色</option>
          {roleOptions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">所有状态</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={onReset}>
          <Icon name="close" size={12} />
          清除
        </button>
      </div>
      <div className="toolbar-right">
        {canCreate && (
          <button className="btn btn-primary btn-sm" onClick={onCreate}>
            <Icon name="plus" size={13} />
            新建{tab === "internal" ? "内部用户" : "C 端用户"}
          </button>
        )}
      </div>
    </div>
  );
}

function UsersClient() {
  const [tab, setTab] = useState("internal");
  const [internalUsers] = useState(INTERNAL_USERS);
  const [customerUsers] = useState(CUSTOMER_USERS);

  const [query, setQuery] = useState("");
  const [roleId, setRoleId] = useState("all");
  const [status, setStatus] = useState("all");

  const [sort, setSort] = useState(DEFAULT_INTERNAL_SORT);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState("create");
  const [editingUser, setEditingUser] = useState(null);

  const handleTabChange = (newTab) => {
    setTab(newTab);
    setQuery("");
    setRoleId("all");
    setStatus("all");
    setSort(newTab === "internal" ? DEFAULT_INTERNAL_SORT : DEFAULT_CUSTOMER_SORT);
  };

  const handleSort = useCallback(
    (field) => {
      setSort((prev) => {
        if (prev.field === field) {
          return { field, dir: prev.dir === "asc" ? "desc" : "asc" };
        }
        return { field, dir: field === "leads_count" || field === "last_login_at" ? "desc" : "asc" };
      });
    },
    []
  );

  const handleResetFilters = () => {
    setQuery("");
    setRoleId("all");
    setStatus("all");
  };

  const handleCreate = () => {
    setDialogMode("create");
    setEditingUser(null);
    setDialogOpen(true);
  };

  const handleEdit = (user) => {
    setDialogMode("edit");
    setEditingUser(user);
    setDialogOpen(true);
  };

  const handleResetPassword = (user) => {
    alert(`重置密码: ${user.nickname || user.username}（demo 仅展示）`);
  };

  const handleDelete = (userId) => {
    alert(`删除用户: ${userId}（demo 仅展示）`);
  };

  const handleDialogSubmit = (formData) => {
    alert(
      `${dialogMode === "edit" ? "保存修改" : "创建用户"}:\n` +
        JSON.stringify(formData, null, 2)
    );
    setDialogOpen(false);
    setEditingUser(null);
  };

  // 当前 tab 的源数据
  const source = tab === "internal" ? internalUsers : customerUsers;

  // 过滤 + 排序
  const filtered = useMemo(
    () => filterUsers(source, { query, roleId, status }),
    [source, query, roleId, status]
  );
  const sorted = useMemo(() => sortUsers(filtered, sort), [filtered, sort]);

  // 计算 leads 最大值用于表格条形比例
  const maxLeads = useMemo(
    () => Math.max(1, ...source.map((u) => u.leads_count || 0)),
    [source]
  );

  // 模拟权限：内部 tab 显示所有操作按钮，C 端 tab 仅显示编辑（按实际项目逻辑调整）
  const canCreate = true;
  const canEdit = true;
  const canResetPassword = tab === "internal"; // C 端密码通常由本人重置
  const canDelete = true;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <div className="page-eyebrow">
            <span>ADMIN</span>
            <span className="sep"></span>
            <span>USER MANAGEMENT</span>
          </div>
          <h1 className="page-title">用户管理</h1>
          <p className="page-subtitle">
            管理后台团队成员与 C 端客户账号，查看每位用户的线索提交活跃度
          </p>
        </div>
        <div className="page-header-actions">
          <a className="btn btn-ghost btn-sm" href="#" onClick={(e) => e.preventDefault()}>
            <Icon name="shield" size={13} />
            <span>角色与权限</span>
          </a>
        </div>
      </header>

      <StatGrid internal={internalUsers} customer={customerUsers} />

      <TabsBar
        tab={tab}
        onTabChange={handleTabChange}
        internalCount={internalUsers.length}
        customerCount={customerUsers.length}
      />

      <Toolbar
        tab={tab}
        query={query}
        setQuery={setQuery}
        roleId={roleId}
        setRoleId={setRoleId}
        status={status}
        setStatus={setStatus}
        onSearch={() => {}}
        onReset={handleResetFilters}
        canCreate={canCreate}
        onCreate={handleCreate}
      />

      <div className="user-list-card">
        <UserTable
          data={sorted}
          tab={tab}
          maxLeads={maxLeads}
          sort={sort}
          onSort={handleSort}
          onEdit={handleEdit}
          onResetPassword={handleResetPassword}
          onDelete={handleDelete}
          canEdit={canEdit}
          canResetPassword={canResetPassword}
          canDelete={canDelete}
        />
        <div className="pagination">
          <div className="pagination-info">
            共 <span className="font-semibold">{sorted.length}</span> 条 · 第 1 / 1 页
          </div>
          <div className="pagination-controls">
            <button className="page-btn" disabled>
              <Icon name="chevronLeft" size={12} />
            </button>
            <button className="page-btn active">1</button>
            <button className="page-btn" disabled>
              <Icon name="chevronRight" size={12} />
            </button>
          </div>
        </div>
      </div>

      <UserDialog
        open={dialogOpen}
        mode={dialogMode}
        user={editingUser}
        tab={tab}
        onClose={() => {
          setDialogOpen(false);
          setEditingUser(null);
        }}
        onSubmit={handleDialogSubmit}
      />
    </div>
  );
}

function Topbar() {
  return (
    <div className="topbar">
      <div className="topbar-inner">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-mark">P</span>
          <span>Profo</span>
          <span className="brand-sub">· 用户管理</span>
        </a>
        <nav className="topbar-nav">
          <a href="#" onClick={(e) => e.preventDefault()}>概览</a>
          <a href="#" onClick={(e) => e.preventDefault()}>线索</a>
          <a href="#" onClick={(e) => e.preventDefault()}>项目</a>
          <a className="active" href="#" onClick={(e) => e.preventDefault()}>用户</a>
          <a href="#" onClick={(e) => e.preventDefault()}>财务</a>
        </nav>
      </div>
    </div>
  );
}

function App() {
  return (
    <>
      <Topbar />
      <UsersClient />
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
