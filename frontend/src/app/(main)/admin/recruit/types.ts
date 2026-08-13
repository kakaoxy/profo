/**
 * 招募管理（区域伙伴招募计划）本地类型定义。
 *
 * 该文件为纯类型/常量模块，无运行时副作用、无 'use client' 指令，
 * 可被 Server Component 与 Client Component 共同导入。
 * 字段名对齐《区域伙伴招募计划》9.3 数据模型，镜像二期后端 Recruit* 接口的
 * Pydantic 结构（后端就绪后由 gen-api 生成的类型替换，但字段名保持一致）。
 */

// ─── 枚举 ──────────────────────────────────────────────────────────────────────

/** 招募活动状态 */
export type RecruitCampaignStatus = "enabled" | "disabled";

/** 线索跟进状态（预留第八节字段，二期支持流转） */
export type RecruitLeadStatus = "new" | "contacted" | "high_intent" | "converted" | "eliminated";

/** 线索来源渠道（后台不区分统计，仅留痕） */
export type RecruitSource = "card" | "poster";

// ─── 实体 ──────────────────────────────────────────────────────────────────────

/** 招募活动（recruit_campaigns 表投影） */
export interface RecruitCampaign {
  id: string;
  /** 活动名称 */
  name: string;
  /** 分享卡片标题（运营配置，员工不可自定义） */
  title: string;
  /** 分享配图 URL（微信官方规范 5:4，建议 500×400） */
  image_url: string | null;
  status: RecruitCampaignStatus;
  /** ISO 字符串 */
  created_at: string;
  updated_at: string;
}

/** 招募客户线索（recruit_leads 表投影） */
export interface RecruitLead {
  id: string;
  /** 已脱敏手机号，如 "138****1234" */
  phone_masked: string;
  /** 主营商圈（必填） */
  main_business_area: string;
  campaign_id: string;
  source: RecruitSource;
  /** 归属员工 ID（首次留资写入，此后永不更新） */
  referrer_employee_id: string | null;
  /** 归属员工姓名（由 mock 层填充；后端二期返回员工姓名冗余字段） */
  referrer_employee_name: string | null;
  status: RecruitLeadStatus;
  /** 是否内部员工误点（人工/自动标记） */
  is_internal: boolean;
  /** ISO 字符串；首次留资时间 = created_at */
  created_at: string;
}

/** 员工（分享归属/业绩核算维度） */
export interface RecruitEmployee {
  id: string;
  name: string;
}

// ─── 漏斗 ──────────────────────────────────────────────────────────────────────

/** 6 级核心业务漏斗数据（对应第五节模型） */
export interface RecruitFunnelData {
  /** 分享次数 */
  shared: number;
  /** 打开次数 */
  pv: number;
  /** 打开人数 */
  uv: number;
  /** 深度浏览（停留 ≥3s） */
  deep_view: number;
  /** 点击授权 */
  clicked_auth: number;
  /** 授权成功（原始留资） */
  authed: number;
  /** 有效新客（北极星指标） */
  valid_new: number;
}

/** 漏斗统计查询参数 */
export interface RecruitFunnelQuery {
  /** YYYY-MM-DD */
  start_date: string;
  /** YYYY-MM-DD */
  end_date: string;
  /** null 表示全部活动 */
  campaign_id: string | null;
  /** null 表示全部员工 */
  employee_id: string | null;
}

// ─── 中文标签常量（供页面复用） ───────────────────────────────────────────────

/** 线索跟进状态中文标签 */
export const RECRUIT_LEAD_STATUS_LABELS: Record<RecruitLeadStatus, string> = {
  new: "新线索",
  contacted: "已联系",
  high_intent: "意向高",
  converted: "已转化",
  eliminated: "已淘汰",
};

/** 线索来源中文标签 */
export const RECRUIT_SOURCE_LABELS: Record<RecruitSource, string> = {
  card: "分享卡片",
  poster: "分享海报",
};

// ─── 设计稿（Steep）Badge 配色类 ─────────────────────────────────────────────

/** 设计稿 badge 风格：`<span class="badge ${cls}">`（rounded-full 药丸形态） */
export const RECRUIT_BADGE_CLASS = {
  /** Fog 底 / Graphite 字：中性 */
  neutral: "bg-fog text-graphite",
  /** Dove 描边 / Graphite 字：轮廓 */
  outline: "text-graphite ring-1 ring-inset ring-dove",
  /** Sky 底 / Ink 字：信息强调（如「新线索」） */
  sky: "bg-sky-wash text-ink",
  /** Apricot 底 / Rust 字：暖色强调（如「意向高」） */
  apricot: "bg-apricot-wash text-rust",
  /** Ink 底 / 白字：实心强调（如「启用中」「已转化」） */
  ink: "bg-ink text-white",
  /** Slate 字 / Fog 描边：弱化（如「已淘汰」） */
  muted: "text-slate ring-1 ring-inset ring-fog",
} as const;

/** 主营商圈选项（镜像后端 GET /api/v1/public/recruit/business-areas 的聚合结果） */
export const RECRUIT_BUSINESS_AREAS: string[] = [
  "城东CBD",
  "城西高新区",
  "城南滨江",
  "城北大学城",
  "老城中心",
];

/** 漏斗看板各级指标（自上而下依次展示，数值单调不增） */
export const RECRUIT_FUNNEL_STEPS: ReadonlyArray<{ key: keyof RecruitFunnelData; label: string }> = [
  { key: "shared", label: "分享次数" },
  { key: "pv", label: "打开次数(PV)" },
  { key: "uv", label: "打开人数(UV)" },
  { key: "deep_view", label: "深度浏览" },
  { key: "clicked_auth", label: "点击授权" },
  { key: "authed", label: "授权成功(原始留资)" },
  { key: "valid_new", label: "有效新客(北极星)" },
];
