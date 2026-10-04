import {
  BarChart3,
  Building2,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  LucideIcon,
  Megaphone,
  PhoneIncoming,
  ScrollText,
  Settings,
  Smartphone,
  Users,
  Wallet,
} from "lucide-react";
import { PERMISSION_CODES, ROLE_CODES } from "@/lib/auth/permissions";

export interface NavSubItem {
  title: string;
  url: string;
  // 允许访问该菜单的角色代码列表；不填表示对所有后台角色可见
  roles?: string[];
  // 权限码：若声明则优先用 hasPermission 校验，未声明时回退到 roles 判断
  permission?: string;
}

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  isActive?: boolean;
  // 允许访问该菜单的角色代码列表；不填表示对所有后台角色可见
  roles?: string[];
  items?: NavSubItem[];
  // 折叠态点击图标直接跳转的目标 URL；不填则保持原弹出子菜单行为
  collapsedUrl?: string;
  // 权限码：若声明则优先用 hasPermission 校验，未声明时回退到 roles 判断
  permission?: string;
  // 分组导航标签（Steep 侧边栏分组，见 docs/design/admin-workspace-hifi.html）；
  // 不填表示不归组（如顶部的「工作台」）。渲染时与前一项相同分组只输出一次组名。
  section?: string;
}

export const navMain: NavItem[] = [
  {
    title: "工作台",
    url: "/admin",
    icon: LayoutDashboard,
    isActive: true,
  },
  {
    title: "房源管理",
    url: "/admin/properties",
    icon: Building2,
    section: "业务",
    permission: PERMISSION_CODES.PROPERTY_READ,
    items: [
      { title: "房源列表", url: "/admin/properties", permission: PERMISSION_CODES.PROPERTY_READ },
      {
        title: "小区户型图库",
        url: "/admin/communities/images",
        permission: PERMISSION_CODES.PROPERTY_READ,
      },
      {
        title: "批量上传",
        url: "/admin/properties/upload",
        roles: [ROLE_CODES.ADMIN, ROLE_CODES.OPERATOR],
        permission: PERMISSION_CODES.PROPERTY_UPLOAD,
      },
      {
        title: "数据治理",
        url: "/admin/properties/governance",
        roles: [ROLE_CODES.ADMIN, ROLE_CODES.OPERATOR],
        permission: PERMISSION_CODES.PROPERTY_GOVERNANCE,
      },
    ],
  },
  {
    title: "线索中心",
    url: "/admin/leads",
    icon: PhoneIncoming,
    section: "业务",
    permission: PERMISSION_CODES.LEAD_READ,
  },
  {
    title: "项目管理",
    url: "/admin/projects",
    icon: FolderKanban,
    section: "业务",
    permission: PERMISSION_CODES.PROJECT_READ,
  },
  {
    title: "项目待办",
    url: "/admin/projects/todo-board",
    icon: ListTodo,
    section: "业务",
    permission: PERMISSION_CODES.PROJECT_READ,
  },
  {
    title: "房源营销",
    url: "/admin/marketing",
    icon: Smartphone,
    section: "业务",
    permission: PERMISSION_CODES.L4_MARKETING_READ,
  },
  {
    title: "获客中心",
    url: "/admin/growth-center/overview",
    icon: Megaphone,
    section: "增长",
    permission: PERMISSION_CODES.RECRUIT_READ,
    items: [
      {
        title: "获客总览",
        url: "/admin/growth-center/overview",
        permission: PERMISSION_CODES.RECRUIT_READ,
      },
      {
        title: "线索管理",
        url: "/admin/growth-center/leads",
        permission: PERMISSION_CODES.RECRUIT_READ,
      },
      {
        title: "漏斗看板",
        url: "/admin/growth-center/funnel",
        permission: PERMISSION_CODES.RECRUIT_READ,
      },
      {
        title: "活动配置",
        url: "/admin/growth-center/campaigns",
        permission: PERMISSION_CODES.RECRUIT_READ,
      },
    ],
  },
  {
    title: "数据报表",
    url: "/admin/reports/market",
    icon: BarChart3,
    section: "增长",
    permission: PERMISSION_CODES.PROPERTY_READ,
  },
  {
    title: "财务管理",
    url: "/admin/ledger",
    icon: Wallet,
    section: "财务",
    items: [
      { title: "资金账本", url: "/admin/ledger", permission: PERMISSION_CODES.LEDGER_READ },
      {
        title: "跟投管理",
        url: "/admin/investments",
        permission: PERMISSION_CODES.INVESTMENT_READ,
      },
      {
        title: "科目管理",
        url: "/admin/ledger/subjects",
        permission: PERMISSION_CODES.LEDGER_READ,
      },
    ],
  },
  {
    title: "用户管理",
    url: "/admin/users",
    icon: Users,
    section: "系统",
    roles: [ROLE_CODES.ADMIN],
    permission: PERMISSION_CODES.USER_READ,
    items: [
      {
        title: "用户列表",
        url: "/admin/users",
        roles: [ROLE_CODES.ADMIN],
        permission: PERMISSION_CODES.USER_READ,
      },
      {
        title: "权限管理",
        url: "/admin/users/roles",
        roles: [ROLE_CODES.ADMIN],
        permission: PERMISSION_CODES.USER_READ,
      },
    ],
  },
  {
    title: "审计日志",
    url: "/admin/audit-logs",
    icon: ScrollText,
    section: "系统",
    permission: PERMISSION_CODES.OPERATION_LOG_READ,
  },
  {
    title: "设置",
    url: "#",
    icon: Settings,
    section: "系统",
    roles: [ROLE_CODES.ADMIN, ROLE_CODES.OPERATOR],
    permission: PERMISSION_CODES.API_KEY_MANAGE,
    items: [
      {
        title: "API Key",
        url: "/admin/settings/api-key",
        roles: [ROLE_CODES.ADMIN, ROLE_CODES.OPERATOR],
        permission: PERMISSION_CODES.API_KEY_MANAGE,
      },
      {
        title: "订阅消息模板",
        url: "/admin/settings/subscribe-templates",
        roles: [ROLE_CODES.ADMIN],
      },
    ],
  },
];
