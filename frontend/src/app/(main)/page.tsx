import { fetchClient } from "@/lib/api-server";
import Link from "next/link";
import {
  Building,
  TrendingUp,
  ClipboardList,
  LucideIcon,
  ArrowUp,
  Folder,
  PhoneCall,
  ChevronRight,
  LayoutDashboard,
} from "lucide-react";

// ----------------------------------------------------------------------
// 1. 工具函数
// ----------------------------------------------------------------------

// 格式化金额：超过1万显示 "xx万"，否则显示原始金额
function formatCurrency(amount?: number | string) {
  if (!amount) return "-";
  const num = Number(amount);
  if (isNaN(num)) return "-";

  if (num >= 10000) {
    // 移除末尾多余的0，保留最多1位小数
    return `${(num / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  }
  return num.toLocaleString();
}

// 格式化相对时间
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString("zh-CN");
}

// ----------------------------------------------------------------------
// 2. 数据获取
// ----------------------------------------------------------------------

async function getDashboardData() {
  const client = await fetchClient();

  const [propertiesRes, projectsStatsRes, pendingLeadsRes, signedLeadsRes] =
    await Promise.all([
      client.GET("/api/v1/properties", {
        params: { query: { page: 1, page_size: 1 } },
      }),
      client.GET("/api/v1/projects/stats", {}),
      client.GET("/api/v1/leads/", {
        params: {
          query: { page: 1, page_size: 5, statuses: ["pending_assessment"] },
        },
      }),
      client.GET("/api/v1/leads/", {
        params: { query: { page: 1, page_size: 1, statuses: ["signed"] } },
      }),
    ]);

  return {
    propertiesTotal: propertiesRes.data?.total || 0,
    projectStats: projectsStatsRes.data || {},
    leads: pendingLeadsRes.data?.items || [],
    pendingLeadsTotal: pendingLeadsRes.data?.total || 0,
    signedLeadsTotal: signedLeadsRes.data?.total || 0,
  };
}

// ----------------------------------------------------------------------
// 3. 页面组件
// ----------------------------------------------------------------------

export default async function DashboardPage() {
  const {
    propertiesTotal,
    projectStats,
    leads,
    pendingLeadsTotal,
    signedLeadsTotal,
  } = await getDashboardData();

  // 解析项目统计
  const statsData =
    (projectStats as { data?: Record<string, number> })?.data || projectStats;
  const signingCount = (statsData as Record<string, number>)?.signing || 0;
  const renovatingCount =
    (statsData as Record<string, number>)?.renovating || 0;
  const sellingCount = (statsData as Record<string, number>)?.selling || 0;
  const soldCount = (statsData as Record<string, number>)?.sold || 0;

  const totalActiveProjects = signingCount + renovatingCount + sellingCount;

  // 计算项目阶段百分比 (用于进度条)
  const getPercent = (val: number) =>
    totalActiveProjects > 0 ? (val / totalActiveProjects) * 100 : 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4 md:p-8">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
          <LayoutDashboard className="w-6 h-6 text-slate-700 dark:text-slate-200" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            工作台
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            欢迎回来，这是您今日的数据概览
          </p>
        </div>
      </div>

      {/* 核心指标卡片 Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6 mb-8">
        <Link href="/properties" className="block h-full group">
          <StatCard
            title="房源总数"
            value={propertiesTotal.toLocaleString()}
            icon={Building}
            className="h-full group-hover:border-blue-200 dark:group-hover:border-blue-800 transition-colors"
          />
        </Link>

        <Link href="/leads" className="block h-full group">
          <StatCard
            title="新增线索"
            value={`${pendingLeadsTotal}`}
            sub="待评估"
            icon={PhoneCall}
            iconColor="text-blue-500"
            className="h-full group-hover:border-blue-200 dark:group-hover:border-blue-800 transition-colors"
          />
        </Link>

        <Link href="/projects" className="block h-full group">
          <StatCard
            title="进行中项目"
            value={`${totalActiveProjects}`}
            sub={`签约 ${signingCount} / 改造 ${renovatingCount} / 销售 ${sellingCount}`}
            icon={Folder}
            className="h-full group-hover:border-blue-200 dark:group-hover:border-blue-800 transition-colors"
          />
        </Link>

        {/* 纯展示卡片 */}
        <div className="h-full">
          <StatCard
            title="已成交项目"
            value={`${soldCount}`}
            sub="累计成交"
            icon={TrendingUp}
            iconColor="text-green-500"
            trend={soldCount > 0 ? `+${soldCount}` : undefined}
            className="h-full"
          />
        </div>
      </div>

      {/* 中间功能区块 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-8">
        {/* 线索概览 */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-6">
            线索转化漏斗
          </h3>
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-3xl font-bold text-slate-900 dark:text-white mr-2 tabular-nums">
                {pendingLeadsTotal}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                待评估
              </span>
            </div>
            <div>
              <span className="text-3xl font-bold text-slate-900 dark:text-white mr-2 tabular-nums">
                {signedLeadsTotal}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                已签约
              </span>
            </div>
          </div>
          {/* 进度条 */}
          <div className="w-full h-3 bg-slate-100 dark:bg-slate-700 rounded-full mt-4 overflow-hidden flex">
            {/* 深色段：已签约 */}
            <div
              className="h-full bg-slate-800 dark:bg-slate-200"
              style={{
                width: `${
                  pendingLeadsTotal + signedLeadsTotal > 0
                    ? (signedLeadsTotal /
                        (pendingLeadsTotal + signedLeadsTotal)) *
                      100
                    : 0
                }%`,
              }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-3 text-right">
            转化率:{" "}
            {pendingLeadsTotal + signedLeadsTotal > 0
              ? (
                  (signedLeadsTotal / (pendingLeadsTotal + signedLeadsTotal)) *
                  100
                ).toFixed(1)
              : 0}
            %
          </p>
        </div>

        {/* 项目阶段分布 (改进版：堆叠条形图) */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-6">
            项目阶段分布
          </h3>

          <div className="flex items-center justify-between gap-4">
            {/* 改造中 */}
            <div className="flex flex-col">
              <span className="text-xs text-slate-500 mb-1">改造中</span>
              <span className="text-2xl font-bold text-amber-500 dark:text-amber-400 tabular-nums">
                {renovatingCount}
              </span>
            </div>
            {/* 销售中 */}
            <div className="flex flex-col text-right">
              <span className="text-xs text-slate-500 mb-1">销售中</span>
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                {sellingCount}
              </span>
            </div>
          </div>

          {/* 分段式进度条 - 替代原本的圆点 */}
          <div className="flex w-full h-3 rounded-full overflow-hidden mt-5 bg-slate-100 dark:bg-slate-700">
            {/* 签约 (灰色) */}
            <div
              className="h-full bg-slate-400"
              style={{ width: `${getPercent(signingCount)}%` }}
            />
            {/* 改造 (琥珀色) */}
            <div
              className="h-full bg-amber-500"
              style={{ width: `${getPercent(renovatingCount)}%` }}
            />
            {/* 销售 (蓝色) */}
            <div
              className="h-full bg-blue-500"
              style={{ width: `${getPercent(sellingCount)}%` }}
            />
          </div>

          <div className="flex justify-between mt-3 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-400"></span> 签约 (
              {signingCount})
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span> 改造 (
              {renovatingCount})
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span> 销售 (
              {sellingCount})
            </div>
          </div>
        </div>
      </div>

      {/* 待处理线索表格 (UX改进版) */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-5 bg-red-500 rounded-full"></div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              待处理线索
            </h3>
          </div>
          <Link
            href="/leads"
            className="text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors flex items-center gap-1"
          >
            全部线索 <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                <th className="px-4 sm:px-6 py-4 font-semibold tracking-wider">
                  房源/小区
                </th>
                <th className="px-4 sm:px-6 py-4 font-semibold tracking-wider hidden sm:table-cell">
                  户型
                </th>
                <th className="px-4 sm:px-6 py-4 font-semibold tracking-wider hidden md:table-cell">
                  面积
                </th>
                <th className="px-4 sm:px-6 py-4 font-semibold tracking-wider hidden lg:table-cell">
                  朝向
                </th>
                <th className="px-4 sm:px-6 py-4 font-semibold tracking-wider">
                  预估总价
                </th>
                <th className="px-4 sm:px-6 py-4 font-semibold tracking-wider hidden md:table-cell text-right">
                  接收时间
                </th>
                <th className="px-4 sm:px-6 py-4 font-semibold tracking-wider text-right w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                      <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                        <ClipboardList className="w-8 h-8 opacity-50" />
                      </div>
                      <p className="text-sm font-medium">暂无待处理线索</p>
                      <p className="text-xs mt-1 opacity-70">
                        所有线索都已评估完毕
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="group hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors relative cursor-pointer"
                  >
                    {/* 1. 小区名称 (移动端包含户型信息) */}
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {lead.community_name}
                        </span>
                        {/* 移动端显示的额外信息 */}
                        <div className="flex items-center gap-2 mt-1 sm:hidden text-xs text-slate-500">
                          <span>{lead.layout || "-"}</span>
                          <span className="w-0.5 h-0.5 bg-slate-300 rounded-full"></span>
                          <span>{lead.area ? `${lead.area}㎡` : ""}</span>
                        </div>
                      </div>
                      {/* 全行点击链接 */}
                      <Link
                        href={`/leads?leadId=${lead.id}`}
                        className="absolute inset-0 z-10"
                        aria-label="查看详情"
                      />
                    </td>

                    <td className="px-4 sm:px-6 py-4 text-sm text-slate-600 dark:text-slate-300 hidden sm:table-cell">
                      {lead.layout || "-"}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-sm text-slate-600 dark:text-slate-300 hidden md:table-cell tabular-nums">
                      {lead.area ? `${lead.area}㎡` : "-"}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-sm text-slate-600 dark:text-slate-300 hidden lg:table-cell">
                      {lead.orientation || "-"}
                    </td>

                    {/* 2. 价格优化 */}
                    <td className="px-4 sm:px-6 py-4">
                      <div className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">
                        {lead.total_price ? (
                          <>
                            <span className="text-xs font-normal text-slate-400 mr-0.5">
                              ¥
                            </span>
                            {formatCurrency(lead.total_price)}
                          </>
                        ) : (
                          "-"
                        )}
                      </div>
                    </td>

                    <td className="px-4 sm:px-6 py-4 text-sm text-slate-400 hidden md:table-cell text-right">
                      {formatRelativeTime(lead.created_at)}
                    </td>

                    {/* 3. 箭头指示符 */}
                    <td className="px-4 sm:px-6 py-4 text-right">
                      <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors ml-auto" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// 4. 组件定义
// ----------------------------------------------------------------------

interface StatCardProps {
  title: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  iconColor?: string;
  trend?: string;
  className?: string;
}

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  iconColor = "text-slate-400",
  trend,
  className,
}: StatCardProps) {
  return (
    <div
      className={`bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 flex flex-col justify-between ${
        className || ""
      }`}
    >
      <div>
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {title}
          </h3>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            {value}
          </span>
        </div>
      </div>
      {(sub || trend) && (
        <div className="mt-4 pt-4 border-t border-slate-50 dark:border-slate-700/50 text-xs flex items-center font-medium justify-between">
          {sub && (
            <span className="text-slate-500 dark:text-slate-400 truncate">
              {sub}
            </span>
          )}
          {trend && (
            <span className="text-green-600 dark:text-green-400 flex items-center bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded">
              <ArrowUp className="h-3 w-3 mr-0.5" />
              {trend}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
