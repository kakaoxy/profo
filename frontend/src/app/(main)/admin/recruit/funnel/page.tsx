import { format, subDays } from "date-fns";
import {
  getRecruitEmployees,
  getRecruitCampaigns,
  getRecruitFunnel,
} from "../_lib/recruit-data";
import { FunnelView, type FunnelViewProps } from "./_components/funnel-view";

/** 将 Date 格式化为 YYYY-MM-DD */
function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

interface PageProps {
  searchParams: Promise<{
    campaign?: string;
    employee?: string;
    range?: string;
    start_date?: string;
    end_date?: string;
  }>;
}

const VALID_RANGES = ["7", "30", "90", "custom"];

/**
 * 招募计划 · 漏斗看板页（F3）。
 *
 * Server Component：从 URL searchParams 读取筛选条件（活动/员工/时间区间），
 * 并行获取员工列表、活动列表、整体漏斗 + 各员工漏斗下钻数据。
 * 筛选条件变化由 nuqs 更新 URL，触发 RSC 重新渲染。
 */
export default async function RecruitFunnelPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const range =
    params.range && VALID_RANGES.includes(params.range) ? params.range : "30";
  const today = new Date();

  // 生效日期区间
  let startDate: string;
  let endDate: string;
  if (range === "custom") {
    startDate = params.start_date || toDateStr(subDays(today, 29));
    endDate = params.end_date || toDateStr(today);
  } else {
    const days = Number(range);
    startDate = toDateStr(subDays(today, days - 1));
    endDate = toDateStr(today);
  }

  const campaignId = params.campaign || undefined;
  const employeeId = params.employee || undefined;

  // 并行获取员工列表 + 活动列表
  const [employees, campaigns] = await Promise.all([
    getRecruitEmployees(),
    getRecruitCampaigns(),
  ]);

  // 整体漏斗 + 各员工漏斗（并行下钻）
  const funnelQuery = { campaign_id: campaignId, start_date: startDate, end_date: endDate };
  const [overallFunnel, ...perEmployeeFunnels] = await Promise.all([
    getRecruitFunnel({ ...funnelQuery, employee_id: employeeId }),
    ...employees.map((emp) =>
      getRecruitFunnel({ ...funnelQuery, employee_id: emp.id }),
    ),
  ]);

  // 组装员工维度行（指定员工时仅展示该员工；null 漏斗数据用零值兜底）
  const EMPTY_FUNNEL = {
    share_count: 0,
    pv: 0,
    uv: 0,
    deep_view: 0,
    clicked_auth: 0,
    authed: 0,
    valid_leads: 0,
  };
  const allEmployeeRows = employees.map((emp, i) => ({
    employee: emp,
    data: perEmployeeFunnels[i] ?? EMPTY_FUNNEL,
  }));
  const displayedRows = employeeId
    ? allEmployeeRows.filter((r) => r.employee.id === employeeId)
    : allEmployeeRows;

  const viewProps: FunnelViewProps = {
    employees,
    campaigns,
    funnel: overallFunnel,
    employeeRows: displayedRows,
    campaignId: params.campaign || "",
    employeeId: params.employee || "",
    range,
    customStart: params.start_date || toDateStr(subDays(today, 29)),
    customEnd: params.end_date || toDateStr(today),
    dateRange: `${startDate} ~ ${endDate}`,
  };

  return (
    <div className="min-h-screen bg-fog">
      <div className="w-full max-w-300 mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <FunnelView {...viewProps} />
      </div>
    </div>
  );
}
