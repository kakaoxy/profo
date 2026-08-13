/**
 * 招募管理（区域伙伴招募计划）第一期 Mock 数据层。
 *
 * ⚠️ 这是第一期前端独立验收使用的本地 mock 数据层，纯 TS 实现，
 * 无 'use server' / 'use client' 指令，可被 Server Component 与
 * Client Component 同时导入。后端就绪后，各 fetch* 函数将由真实接口替换
 * （对应二期接口路径见各函数注释）。
 */

import type {
  RecruitCampaign,
  RecruitEmployee,
  RecruitFunnelData,
  RecruitFunnelQuery,
  RecruitLead,
  RecruitLeadStatus,
  RecruitSource,
} from "../types";

// ─── 工具 ──────────────────────────────────────────────────────────────────────

/** 生成距今 days 天前的 ISO 时间字符串（保证 mock 数据始终落在最近 30 天内） */
function isoDaysAgo(days: number, hour = 10, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** 模拟网络延迟，使 mock 读取函数更贴近真实接口体验 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── 员工 ──────────────────────────────────────────────────────────────────────

export const mockEmployees: RecruitEmployee[] = [
  { id: "emp-001", name: "张三" },
  { id: "emp-002", name: "李四" },
  { id: "emp-003", name: "王五" },
  { id: "emp-004", name: "赵六" },
  { id: "emp-005", name: "钱七" },
];

/** 员工 ID → 姓名 映射（填充线索归属员工姓名） */
const employeeNameMap = new Map(mockEmployees.map((e) => [e.id, e.name]));

// ─── 活动 ──────────────────────────────────────────────────────────────────────

export const mockCampaigns: RecruitCampaign[] = [
  {
    id: "camp-001",
    name: "八月区域伙伴招募",
    title: "加入区域伙伴，深耕本地房产业务",
    image_url: null,
    status: "enabled",
    created_at: isoDaysAgo(28),
    updated_at: isoDaysAgo(2),
  },
  {
    id: "camp-002",
    name: "七月区域伙伴招募",
    title: "七月招募季：推荐成交最高享万元奖励",
    image_url: null,
    status: "disabled",
    created_at: isoDaysAgo(50),
    updated_at: isoDaysAgo(20),
  },
  {
    id: "camp-003",
    name: "暑期合伙人特别计划",
    title: "暑期冲刺：新客留资瓜分激励池",
    image_url: null,
    status: "enabled",
    created_at: isoDaysAgo(15),
    updated_at: isoDaysAgo(15),
  },
];

// ─── 线索 ──────────────────────────────────────────────────────────────────────

/** 线索种子数据（收敛为精简结构，构建时展开为 RecruitLead） */
interface LeadSeed {
  id: string;
  /** 已脱敏手机号 */
  phone: string;
  mainBusinessArea: string;
  campaignId: string;
  source: RecruitSource;
  /** null 表示无归属员工（纯 C 端用户分享，不归因） */
  employeeId: string | null;
  status: RecruitLeadStatus;
  isInternal?: boolean;
  daysAgo: number;
}

const leadSeeds: LeadSeed[] = [
  // 城东CBD
  { id: "lead-001", phone: "138****1234", mainBusinessArea: "城东CBD", campaignId: "camp-001", source: "card", employeeId: "emp-001", status: "new", daysAgo: 1 },
  { id: "lead-002", phone: "139****5678", mainBusinessArea: "城东CBD", campaignId: "camp-001", source: "poster", employeeId: "emp-002", status: "contacted", daysAgo: 2 },
  { id: "lead-003", phone: "150****3344", mainBusinessArea: "城东CBD", campaignId: "camp-003", source: "card", employeeId: "emp-003", status: "high_intent", daysAgo: 3 },
  { id: "lead-004", phone: "151****7788", mainBusinessArea: "城东CBD", campaignId: "camp-001", source: "card", employeeId: null, status: "new", daysAgo: 5 },
  // 城西高新区
  { id: "lead-005", phone: "137****9012", mainBusinessArea: "城西高新区", campaignId: "camp-001", source: "poster", employeeId: "emp-001", status: "converted", daysAgo: 4 },
  { id: "lead-006", phone: "136****3456", mainBusinessArea: "城西高新区", campaignId: "camp-002", source: "card", employeeId: "emp-004", status: "eliminated", daysAgo: 12 },
  { id: "lead-007", phone: "158****7890", mainBusinessArea: "城西高新区", campaignId: "camp-003", source: "card", employeeId: "emp-002", status: "contacted", daysAgo: 6 },
  { id: "lead-008", phone: "159****2233", mainBusinessArea: "城西高新区", campaignId: "camp-003", source: "poster", employeeId: "emp-005", status: "new", daysAgo: 1 },
  // 城南滨江
  { id: "lead-009", phone: "133****5566", mainBusinessArea: "城南滨江", campaignId: "camp-001", source: "card", employeeId: "emp-002", status: "high_intent", daysAgo: 7 },
  { id: "lead-010", phone: "132****8899", mainBusinessArea: "城南滨江", campaignId: "camp-001", source: "poster", employeeId: "emp-003", status: "converted", daysAgo: 9 },
  { id: "lead-011", phone: "188****1122", mainBusinessArea: "城南滨江", campaignId: "camp-003", source: "card", employeeId: null, status: "new", daysAgo: 2 },
  { id: "lead-012", phone: "186****4455", mainBusinessArea: "城南滨江", campaignId: "camp-002", source: "card", employeeId: "emp-001", status: "eliminated", daysAgo: 18 },
  // 城北大学城
  { id: "lead-013", phone: "135****6677", mainBusinessArea: "城北大学城", campaignId: "camp-001", source: "card", employeeId: "emp-004", status: "contacted", daysAgo: 8 },
  { id: "lead-014", phone: "134****9900", mainBusinessArea: "城北大学城", campaignId: "camp-003", source: "poster", employeeId: "emp-002", status: "new", daysAgo: 4 },
  { id: "lead-015", phone: "187****3344", mainBusinessArea: "城北大学城", campaignId: "camp-003", source: "card", employeeId: "emp-005", status: "high_intent", daysAgo: 10 },
  { id: "lead-016", phone: "189****5566", mainBusinessArea: "城北大学城", campaignId: "camp-001", source: "card", employeeId: "emp-003", status: "converted", daysAgo: 14 },
  // 老城中心
  { id: "lead-017", phone: "131****7788", mainBusinessArea: "老城中心", campaignId: "camp-001", source: "poster", employeeId: "emp-001", status: "new", daysAgo: 3 },
  { id: "lead-018", phone: "130****2211", mainBusinessArea: "老城中心", campaignId: "camp-002", source: "card", employeeId: "emp-005", status: "eliminated", daysAgo: 22 },
  { id: "lead-019", phone: "186****9900", mainBusinessArea: "老城中心", campaignId: "camp-003", source: "card", employeeId: "emp-004", status: "contacted", daysAgo: 5 },
  { id: "lead-020", phone: "158****2233", mainBusinessArea: "老城中心", campaignId: "camp-001", source: "poster", employeeId: null, status: "new", daysAgo: 11 },
  // 内部员工误点（is_internal: true，计入留资但非有效新客）
  { id: "lead-021", phone: "138****0001", mainBusinessArea: "城西高新区", campaignId: "camp-001", source: "card", employeeId: "emp-001", status: "eliminated", isInternal: true, daysAgo: 2 },
  { id: "lead-022", phone: "139****0002", mainBusinessArea: "城南滨江", campaignId: "camp-003", source: "poster", employeeId: "emp-002", status: "eliminated", isInternal: true, daysAgo: 6 },
  { id: "lead-023", phone: "136****0003", mainBusinessArea: "老城中心", campaignId: "camp-001", source: "card", employeeId: "emp-003", status: "eliminated", isInternal: true, daysAgo: 15 },
  // 更早的转化沉淀（仍在 30 天内）
  { id: "lead-024", phone: "187****7788", mainBusinessArea: "城东CBD", campaignId: "camp-001", source: "card", employeeId: "emp-001", status: "converted", daysAgo: 20 },
  { id: "lead-025", phone: "189****4455", mainBusinessArea: "城南滨江", campaignId: "camp-001", source: "card", employeeId: "emp-004", status: "converted", daysAgo: 25 },
];

export const mockLeads: RecruitLead[] = leadSeeds.map((seed) => ({
  id: seed.id,
  phone_masked: seed.phone,
  main_business_area: seed.mainBusinessArea,
  campaign_id: seed.campaignId,
  source: seed.source,
  referrer_employee_id: seed.employeeId,
  // 归属员工姓名由 mock 层填充（无归属时为 null）
  referrer_employee_name: seed.employeeId ? (employeeNameMap.get(seed.employeeId) ?? null) : null,
  status: seed.status,
  is_internal: seed.isInternal ?? false,
  created_at: isoDaysAgo(seed.daysAgo),
}));

// ─── 读取函数（模拟真实接口，二期替换为 HTTP 请求） ─────────────────────────

/**
 * 获取活动列表（按创建时间倒序）。
 * 对应二期真实接口：GET /api/v1/admin/recruit/campaigns
 */
export async function fetchMockCampaigns(): Promise<RecruitCampaign[]> {
  await delay(200);
  return [...mockCampaigns].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * 获取员工列表（分享归属/业绩核算维度）。
 * 对应二期真实接口：GET /api/v1/admin/recruit/employees
 */
export async function fetchMockEmployees(): Promise<RecruitEmployee[]> {
  await delay(200);
  return [...mockEmployees];
}

/**
 * 获取线索列表（按留资时间倒序，最新的在前）。
 * 对应二期真实接口：GET /api/v1/admin/recruit/leads
 */
export async function fetchMockLeads(): Promise<RecruitLead[]> {
  await delay(200);
  return [...mockLeads].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * 获取 6 级漏斗统计数据（按员工与日期区间过滤）。
 * 对应二期真实接口：GET /api/v1/admin/recruit/leads/funnel
 *
 * 口径说明（mock 自洽约束）：
 * - authed（授权成功/原始留资）= 过滤后线索实际计数；
 * - valid_new（有效新客）= 过滤后非内部员工线索计数（北极星指标）；
 * - 漏斗上游（clicked_auth → shared）按比例向上反推，
 *   保证 shared ≥ pv ≥ uv ≥ deep_view ≥ clicked_auth ≥ authed ≥ valid_new。
 *
 * @param query - 过滤条件：campaign_id 为空表示全部活动；
 *                employee_id 为空表示全部员工；
 *                created_at 落在 [start_date, end_date] 闭区间（YYYY-MM-DD 字符串比较）
 */
export async function fetchMockFunnel(query: RecruitFunnelQuery): Promise<RecruitFunnelData> {
  await delay(200);

  const filteredLeads = mockLeads.filter((lead) => {
    // 活动过滤（与员工维度互不影响）
    if (query.campaign_id && lead.campaign_id !== query.campaign_id) {
      return false;
    }
    // 员工过滤（null 归属的线索不计入任何员工维度）
    if (query.employee_id && lead.referrer_employee_id !== query.employee_id) {
      return false;
    }
    // 日期过滤：取 ISO 字符串前 10 位（YYYY-MM-DD）做字典序比较，等价于日期比较
    const date = lead.created_at.slice(0, 10);
    return date >= query.start_date && date <= query.end_date;
  });

  const authed = filteredLeads.length;
  const validNew = filteredLeads.filter((lead) => !lead.is_internal).length;

  // 从真实计数向上反推漏斗上游，每级 ≥ 下一级（Math.max 兜底，避免小样本取整破序）
  const clickedAuth = Math.max(authed, Math.round(authed * 1.12));
  const deepView = Math.max(clickedAuth, Math.round(clickedAuth * 1.25));
  const uv = Math.max(deepView, Math.round(deepView * 1.4));
  const pv = Math.max(uv, Math.round(uv * 1.5));
  const shared = Math.max(pv, Math.round(pv * 1.6));

  return {
    shared,
    pv,
    uv,
    deep_view: deepView,
    clicked_auth: clickedAuth,
    authed,
    valid_new: validNew,
  };
}
