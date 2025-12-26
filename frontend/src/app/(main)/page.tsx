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
} from "lucide-react";

// 数据获取函数
async function getDashboardData() {
  const client = await fetchClient();
  
  // 并行获取所有数据
  const [propertiesRes, projectsStatsRes, leadsRes] = await Promise.all([
    client.GET("/api/v1/properties", { params: { query: { page: 1, page_size: 1 } } }),
    client.GET("/api/v1/projects/stats", {}),
    client.GET("/api/v1/leads/", { params: { query: { page: 1, page_size: 5, statuses: ["pending_assessment"] } } }),
  ]);

  return {
    propertiesTotal: propertiesRes.data?.total || 0,
    projectStats: projectsStatsRes.data || { total: 0, by_status: {} },
    leads: leadsRes.data?.items || [],
    leadsTotal: leadsRes.data?.total || 0,
  };
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

export default async function DashboardPage() {
  const { propertiesTotal, projectStats, leads, leadsTotal } = await getDashboardData();

  // 解析项目统计 - 后端返回格式: {code, msg, data: {signing, renovating, selling, sold}}
  const statsData = (projectStats as { data?: Record<string, number> })?.data || projectStats;
  const signingCount = (statsData as Record<string, number>)?.signing || 0;
  const renovatingCount = (statsData as Record<string, number>)?.renovating || 0;
  const sellingCount = (statsData as Record<string, number>)?.selling || 0;
  const soldCount = (statsData as Record<string, number>)?.sold || 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-6 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">工作台</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">欢迎回来，这是您今日的数据概览</p>
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        <StatCard 
          title="房源总数" 
          value={propertiesTotal.toLocaleString()} 
          icon={Building}
        />
        <StatCard 
          title="新增线索" 
          value={`${leadsTotal}`} 
          sub="待评估" 
          icon={PhoneCall}
          iconColor="text-blue-500"
        />
        <StatCard 
          title="进行中项目" 
          value={`${signingCount + renovatingCount + sellingCount}`}
          sub={`签约 ${signingCount} / 改造 ${renovatingCount} / 销售 ${sellingCount}`}
          icon={Folder}
        />
        <StatCard 
          title="已成交项目" 
          value={`${soldCount}`}
          sub="累计成交"
          icon={TrendingUp}
          iconColor="text-green-500"
          trend={soldCount > 0 ? `+${soldCount}` : undefined}
        />
      </div>

      {/* 中间功能区块 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">线索评估概览</h3>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-3xl font-bold text-slate-900 dark:text-white mr-2">{leadsTotal}</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">待评估</span>
            </div>
            <div>
              <span className="text-3xl font-bold text-slate-900 dark:text-white mr-2">{soldCount}</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">已签约</span>
            </div>
          </div>
          <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full mt-4 overflow-hidden flex">
            <div 
              className="h-full bg-slate-800 dark:bg-white" 
              style={{ width: `${leadsTotal > 0 ? Math.min((soldCount / (leadsTotal + soldCount)) * 100, 100) : 0}%` }}
            />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">项目阶段分布</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-baseline">
              <span className="text-3xl font-bold text-amber-600 dark:text-amber-400 mr-2">{renovatingCount}</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">改造中</span>
            </div>
            <div className="flex items-baseline">
              <span className="text-3xl font-bold text-blue-600 dark:text-blue-400 mr-2">{sellingCount}</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">销售中</span>
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            {[...Array(Math.min(signingCount, 3))].map((_, i) => (
              <div key={`sign-${i}`} className="w-3 h-3 rounded-full bg-slate-400" />
            ))}
            {[...Array(Math.min(renovatingCount, 3))].map((_, i) => (
              <div key={`reno-${i}`} className="w-3 h-3 rounded-full bg-amber-500" />
            ))}
            {[...Array(Math.min(sellingCount, 3))].map((_, i) => (
              <div key={`sell-${i}`} className="w-3 h-3 rounded-full bg-blue-500" />
            ))}
          </div>
        </div>
      </div>

      {/* 待处理线索表格 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">待处理线索</h3>
          <Link 
            href="/leads"
            className="bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-sm px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-2"
          >
            全部线索
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500 dark:text-slate-400">
                <th className="px-6 py-4 font-semibold tracking-wider">小区</th>
                <th className="px-6 py-4 font-semibold tracking-wider">户型</th>
                <th className="px-6 py-4 font-semibold tracking-wider">面积(m²)</th>
                <th className="px-6 py-4 font-semibold tracking-wider">朝向</th>
                <th className="px-6 py-4 font-semibold tracking-wider">楼层</th>
                <th className="px-6 py-4 font-semibold tracking-wider">总价(万)</th>
                <th className="px-6 py-4 font-semibold tracking-wider">时间</th>
                <th className="px-6 py-4 font-semibold tracking-wider text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                    <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    暂无待处理线索
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">{lead.community_name}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{lead.layout || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{lead.area || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{lead.orientation || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{lead.floor_info || '-'}</td>
                    <td className="px-6 py-4 text-sm font-bold text-red-600 dark:text-red-400">
                      {lead.total_price ? `¥ ${lead.total_price}` : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                      {formatRelativeTime(lead.created_at)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right">
                      <Link 
                        href="/leads"
                        className="text-slate-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400 font-medium transition-colors"
                      >
                        查看
                      </Link>
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

// StatCard 组件
interface StatCardProps {
  title: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  iconColor?: string;
  trend?: string;
}

function StatCard({ title, value, sub, icon: Icon, iconColor = "text-slate-400", trend }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition hover:shadow-md">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</h3>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold text-slate-900 dark:text-white">{value}</span>
      </div>
      {(sub || trend) && (
        <div className="mt-2 text-xs flex items-center font-medium">
          {trend && (
            <span className="text-green-600 dark:text-green-400 flex items-center mr-2">
              <ArrowUp className="h-3 w-3 mr-0.5" />
              {trend}
            </span>
          )}
          {sub && <span className="text-slate-500 dark:text-slate-400">{sub}</span>}
        </div>
      )}
    </div>
  );
}