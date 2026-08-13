// ===========================================================
// Mock Data — Users Redesign Demo
// 模拟后端返回：内部用户（admin/operator/user）+ C 端用户（customer）
// 每个用户带 leads_count（提交线索数，按 Lead.creator_id 聚合）
// ===========================================================

const ROLES = {
  ADMIN: { id: "r-admin", code: "admin", name: "超级管理员" },
  OPERATOR: { id: "r-operator", code: "operator", name: "运营专员" },
  USER: { id: "r-user", code: "user", name: "业务用户" },
  CUSTOMER: { id: "r-customer", code: "customer", name: "C 端客户" },
};

const INTERNAL_ROLE_OPTIONS = [
  ROLES.ADMIN,
  ROLES.OPERATOR,
  ROLES.USER,
];

// 内部用户（可登录后台；admin/operator/user 角色）
const INTERNAL_USERS = [
  {
    id: "u-001",
    username: "admin",
    nickname: "系统管理员",
    phone: "138****8888",
    avatar: null,
    role: ROLES.ADMIN,
    additional_roles: [],
    status: "active",
    leads_count: 3,
    last_login_at: "2026-07-27T08:32:00Z",
    created_at: "2025-11-12T10:00:00Z",
    is_customer_identity: false,
    wechat_bound: false,
  },
  {
    id: "u-002",
    username: "wang.xiaoli",
    nickname: "王晓丽",
    phone: "139****2210",
    avatar: null,
    role: ROLES.OPERATOR,
    additional_roles: [],
    status: "active",
    leads_count: 47,
    last_login_at: "2026-07-26T19:14:00Z",
    created_at: "2025-12-03T14:20:00Z",
    is_customer_identity: false,
    wechat_bound: false,
  },
  {
    id: "u-003",
    username: "li.zhenhua",
    nickname: "李振华",
    phone: "137****6655",
    avatar: null,
    role: ROLES.OPERATOR,
    additional_roles: [ROLES.CUSTOMER],
    status: "active",
    leads_count: 32,
    last_login_at: "2026-07-27T07:55:00Z",
    created_at: "2026-01-08T09:30:00Z",
    is_customer_identity: true,
    wechat_bound: false,
  },
  {
    id: "u-004",
    username: "zhang.min",
    nickname: "张敏",
    phone: "135****4421",
    avatar: null,
    role: ROLES.USER,
    additional_roles: [],
    status: "active",
    leads_count: 18,
    last_login_at: "2026-07-25T16:42:00Z",
    created_at: "2026-02-14T11:10:00Z",
    is_customer_identity: false,
    wechat_bound: false,
  },
  {
    id: "u-005",
    username: "chen.yubo",
    nickname: "陈雨波",
    phone: "136****0918",
    avatar: null,
    role: ROLES.USER,
    additional_roles: [ROLES.CUSTOMER],
    status: "active",
    leads_count: 24,
    last_login_at: "2026-07-24T11:08:00Z",
    created_at: "2026-03-22T15:45:00Z",
    is_customer_identity: true,
    wechat_bound: true,
  },
  {
    id: "u-006",
    username: "zhao.qiming",
    nickname: "赵启明",
    phone: "138****5572",
    avatar: null,
    role: ROLES.OPERATOR,
    additional_roles: [],
    status: "inactive",
    leads_count: 0,
    last_login_at: "2026-06-12T10:23:00Z",
    created_at: "2026-01-25T08:00:00Z",
    is_customer_identity: false,
    wechat_bound: false,
  },
  {
    id: "u-007",
    username: "sun.jingyi",
    nickname: "孙静怡",
    phone: "137****3344",
    avatar: null,
    role: ROLES.USER,
    additional_roles: [],
    status: "locked",
    leads_count: 5,
    last_login_at: "2026-07-19T22:14:00Z",
    created_at: "2026-04-10T13:30:00Z",
    is_customer_identity: false,
    wechat_bound: false,
  },
  {
    id: "u-008",
    username: "zhou.wei",
    nickname: "周伟",
    phone: "135****7890",
    avatar: null,
    role: ROLES.USER,
    additional_roles: [],
    status: "active",
    leads_count: 12,
    last_login_at: "2026-07-27T09:12:00Z",
    created_at: "2026-05-05T16:20:00Z",
    is_customer_identity: false,
    wechat_bound: false,
  },
];

// C 端用户（role.code === 'customer'，自助注册或微信授权创建）
const CUSTOMER_USERS = [
  {
    id: "u-c01",
    username: "c_18655552214",
    nickname: "林家明",
    phone: "186****2214",
    avatar: null,
    role: ROLES.CUSTOMER,
    additional_roles: [],
    status: "active",
    leads_count: 12,
    last_login_at: "2026-07-27T10:42:00Z",
    created_at: "2026-04-15T09:15:00Z",
    is_customer_identity: true,
    wechat_bound: true,
    register_channel: "wechat",
  },
  {
    id: "u-c02",
    username: "c_13900001111",
    nickname: "苏小燕",
    phone: "139****1111",
    avatar: null,
    role: ROLES.CUSTOMER,
    additional_roles: [],
    status: "active",
    leads_count: 5,
    last_login_at: "2026-07-26T14:30:00Z",
    created_at: "2026-05-20T11:30:00Z",
    is_customer_identity: true,
    wechat_bound: true,
    register_channel: "wechat",
  },
  {
    id: "u-c03",
    username: "c_15822223333",
    nickname: "黄志强",
    phone: "158****3333",
    avatar: null,
    role: ROLES.CUSTOMER,
    additional_roles: [],
    status: "active",
    leads_count: 0,
    last_login_at: "2026-07-22T20:08:00Z",
    created_at: "2026-06-01T18:00:00Z",
    is_customer_identity: true,
    wechat_bound: false,
    register_channel: "phone",
  },
  {
    id: "u-c04",
    username: "c_17788889999",
    nickname: "吴雅琴",
    phone: "177****9999",
    avatar: null,
    role: ROLES.CUSTOMER,
    additional_roles: [],
    status: "active",
    leads_count: 23,
    last_login_at: "2026-07-27T09:55:00Z",
    created_at: "2026-03-18T10:45:00Z",
    is_customer_identity: true,
    wechat_bound: true,
    register_channel: "wechat",
  },
  {
    id: "u-c05",
    username: "c_18966667777",
    nickname: "范晓东",
    phone: "189****7777",
    avatar: null,
    role: ROLES.CUSTOMER,
    additional_roles: [],
    status: "active",
    leads_count: 8,
    last_login_at: "2026-07-25T19:20:00Z",
    created_at: "2026-05-12T08:30:00Z",
    is_customer_identity: true,
    wechat_bound: true,
    register_channel: "wechat",
  },
  {
    id: "u-c06",
    username: "c_13155556666",
    nickname: "曾子涵",
    phone: "131****6666",
    avatar: null,
    role: ROLES.CUSTOMER,
    additional_roles: [],
    status: "inactive",
    leads_count: 2,
    last_login_at: "2026-06-30T12:00:00Z",
    created_at: "2026-04-28T15:00:00Z",
    is_customer_identity: true,
    wechat_bound: false,
    register_channel: "phone",
  },
  {
    id: "u-c07",
    username: "c_15233334444",
    nickname: "罗伟杰",
    phone: "152****4444",
    avatar: null,
    role: ROLES.CUSTOMER,
    additional_roles: [],
    status: "active",
    leads_count: 15,
    last_login_at: "2026-07-26T21:14:00Z",
    created_at: "2026-02-25T14:00:00Z",
    is_customer_identity: true,
    wechat_bound: true,
    register_channel: "wechat",
  },
  {
    id: "u-c08",
    username: "c_18011112222",
    nickname: "邓雪梅",
    phone: "180****2222",
    avatar: null,
    role: ROLES.CUSTOMER,
    additional_roles: [],
    status: "active",
    leads_count: 3,
    last_login_at: "2026-07-23T08:45:00Z",
    created_at: "2026-06-18T09:00:00Z",
    is_customer_identity: true,
    wechat_bound: false,
    register_channel: "phone",
  },
  {
    id: "u-c09",
    username: "c_15900005555",
    nickname: "谢丽红",
    phone: "159****5555",
    avatar: null,
    role: ROLES.CUSTOMER,
    additional_roles: [],
    status: "active",
    leads_count: 31,
    last_login_at: "2026-07-27T11:02:00Z",
    created_at: "2026-01-30T16:30:00Z",
    is_customer_identity: true,
    wechat_bound: true,
    register_channel: "wechat",
  },
  {
    id: "u-c10",
    username: "c_13377778888",
    nickname: "马俊杰",
    phone: "133****8888",
    avatar: null,
    role: ROLES.CUSTOMER,
    additional_roles: [],
    status: "active",
    leads_count: 0,
    last_login_at: "2026-07-21T18:30:00Z",
    created_at: "2026-07-01T10:00:00Z",
    is_customer_identity: true,
    wechat_bound: false,
    register_channel: "phone",
  },
];

const STATUS_OPTIONS = [
  { value: "active", label: "正常" },
  { value: "inactive", label: "停用" },
  { value: "locked", label: "锁定" },
];

const STATUS_LABEL_MAP = {
  active: "正常",
  inactive: "停用",
  locked: "锁定",
};

// 时间相对格式化
function formatRelative(isoString) {
  if (!isoString) return "—";
  const d = new Date(isoString);
  const now = new Date("2026-07-27T11:30:00Z");
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHr < 24) return `${diffHr} 小时前`;
  if (diffDay < 30) return `${diffDay} 天前`;
  if (diffDay < 365) return `${Math.floor(diffDay / 30)} 个月前`;
  return `${Math.floor(diffDay / 365)} 年前`;
}

function formatShortDate(isoString) {
  if (!isoString) return "—";
  const d = new Date(isoString);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateTime(isoString) {
  if (!isoString) return "—";
  const d = new Date(isoString);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

Object.assign(window, {
  ROLES,
  INTERNAL_ROLE_OPTIONS,
  INTERNAL_USERS,
  CUSTOMER_USERS,
  STATUS_OPTIONS,
  STATUS_LABEL_MAP,
  formatRelative,
  formatShortDate,
  formatDateTime,
});
