import { fetchClient } from "@/lib/api-server";
import Link from "next/link";
import {
  LayoutDashboard,
  AlertCircle,
  Plus,
  Filter,
  SortAsc,
  ClipboardCheck,
  UserCircle2,
} from "lucide-react";
import { ProjectCard } from "./_components";
import { mapBackendToFrontend } from "./leads/lib/utils";
import type { components } from "@/lib/api-types";
import type { Project, DashboardLead, FunnelData } from "./types";

type ProjectStatsResponse = components["schemas"]["ProjectStatsResponse"];

// Mock projects data for the new design
const MOCK_PROJECTS: Project[] = [
  {
    id: "1",
    code: "AC-8821",
    name: "锦绣华城 - 3期 A栋",
    location: "静安区",
    specs: "128㎡ · 3室2厅",
    stats: {
      viewTotal: 142,
      viewTrend: { current: 12, last: 8, isUp: true },
      offerCount: 5,
      maxOffer: 820,
      lastOffer: 815,
    },
    market: {
      onSale: 12,
      avgPrice: "6.8万/㎡",
      volume30d: 4,
      priceTrend30d: "-1.2% ↓",
      isPriceUp: false,
    },
  },
  {
    id: "2",
    code: "AC-9012",
    name: "东方曼哈顿 - 2单元",
    location: "徐汇区",
    specs: "156㎡ · 4室2厅",
    stats: {
      viewTotal: 205,
      viewTrend: { current: 24, last: 15, isUp: true },
      offerCount: 8,
      maxOffer: 1250,
      lastOffer: 1240,
    },
    market: {
      onSale: 5,
      avgPrice: "8.2万/㎡",
      volume30d: 2,
      priceTrend30d: "+0.5% ↑",
      isPriceUp: true,
    },
  },
  {
    id: "3",
    code: "AC-4432",
    name: "仁恒河滨城",
    location: "浦东新区",
    specs: "89㎡ · 2室2厅",
    stats: {
      viewTotal: 56,
      viewTrend: { current: 2, last: 5, isUp: false },
      offerCount: 1,
      maxOffer: 580,
      lastOffer: 580,
    },
    market: {
      onSale: 18,
      avgPrice: "6.4万/㎡",
      volume30d: 1,
      priceTrend30d: "持平",
      isPriceUp: null,
    },
  },
];

// Mock leads data for the new table design
const MOCK_LEADS: DashboardLead[] = [
  {
    id: "l1",
    community: "锦绣华城 - 3期 A栋",
    unitType: "3室2厅",
    area: "128㎡",
    floor: "12/28",
    totalPrice: "820万",
    unitPrice: "6.4万/㎡",
    status: "带看中",
    region: "静安区",
    creator: "李晓梅",
    updatedTime: "2小时前",
  },
  {
    id: "l2",
    community: "东方曼哈顿 - 2单元",
    unitType: "4室2厅",
    area: "156㎡",
    floor: "6/12",
    totalPrice: "1250万",
    unitPrice: "8.0万/㎡",
    status: "已出价",
    region: "徐汇区",
    creator: "陈大卫",
    updatedTime: "5小时前",
  },
  {
    id: "l3",
    community: "仁恒河滨城",
    unitType: "2室2厅",
    area: "89㎡",
    floor: "18/32",
    totalPrice: "580万",
    unitPrice: "6.5万/㎡",
    status: "初步评估",
    region: "浦东新区",
    creator: "王五",
    updatedTime: "昨天 16:30",
  },
];

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

  const backendLeads = pendingLeadsRes.data?.items || [];
  const leads = backendLeads.map(mapBackendToFrontend);

  return {
    propertiesTotal: propertiesRes.data?.total || 0,
    projectStats: projectsStatsRes.data || {},
    leads,
    pendingLeadsTotal: pendingLeadsRes.data?.total || 0,
    signedLeadsTotal: signedLeadsRes.data?.total || 0,
  };
}

// Server component wrapper for motion components
function ProjectOverviewCard({
  signingCount,
  renovatingCount,
  sellingCount,
  soldCount,
}: {
  signingCount: number;
  renovatingCount: number;
  sellingCount: number;
  soldCount: number;
}) {
  return (
    <div className="col-span-12 lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-card p-6 flex flex-col justify-between h-40">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-slate-400 font-black uppercase tracking-widest">
          项目总览 Overview
        </span>
        <Link
          href="/projects"
          className="text-primary text-xs font-bold hover:underline"
        >
          详情 View Details
        </Link>
      </div>
      <div className="flex justify-between items-end">
        <div className="text-center px-4 border-r border-slate-100 flex-1">
          <p className="text-3xl font-black text-primary">{signingCount}</p>
          <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">
            已签约 Signed
          </p>
        </div>
        <div className="text-center px-4 border-r border-slate-100 flex-1">
          <p className="text-3xl font-black text-on-surface">{renovatingCount}</p>
          <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">
            装修中 Reno
          </p>
        </div>
        <div className="text-center px-4 border-r border-slate-100 flex-1">
          <p className="text-3xl font-black text-on-surface">{sellingCount}</p>
          <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">
            在售中 On Sale
          </p>
        </div>
        <div className="text-center px-4 flex-1">
          <p className="text-3xl font-black text-tertiary">{soldCount}</p>
          <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">
            已成交 Sold
          </p>
        </div>
      </div>
    </div>
  );
}

function LeadsFunnelCard({ funnelData }: { funnelData: FunnelData }) {
  return (
    <div className="col-span-12 lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-card p-6 h-40">
      <span className="text-xs text-slate-400 font-black uppercase tracking-widest block mb-5">
        线索漏斗 Leads Funnel
      </span>
      <div className="flex h-10 items-stretch gap-0.5 rounded-lg overflow-hidden">
        <div
          className="bg-primary flex items-center justify-center text-[10px] text-white font-bold"
          style={{ flex: 4 }}
          title="Total Leads"
        >
          线索 {funnelData.total}
        </div>
        <div
          className="bg-primary/80 flex items-center justify-center text-[10px] text-white font-bold"
          style={{ flex: 3 }}
          title="Evaluation"
        >
          评估 {funnelData.evaluating}
        </div>
        <div
          className="bg-primary/60 flex items-center justify-center text-[10px] text-white font-bold"
          style={{ flex: 2 }}
          title="Visit"
        >
          带看 {funnelData.visiting}
        </div>
        <div
          className="bg-primary/40 flex items-center justify-center text-[10px] text-white font-bold"
          style={{ flex: 1 }}
          title="Deal"
        >
          签约 {funnelData.signed}
        </div>
      </div>
      <div className="flex justify-between mt-2.5 px-1">
        <span className="text-[10px] text-slate-400 font-medium">100%</span>
        <span className="text-[10px] text-slate-400 font-medium">50%</span>
        <span className="text-[10px] text-slate-400 font-medium">25%</span>
        <span className="text-[10px] text-slate-400 font-medium">6.2%</span>
      </div>
    </div>
  );
}

function AlertCard({ count }: { count: number }) {
  return (
    <div className="col-span-12 lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-card p-6 flex items-center gap-5 h-40">
      <div className="w-16 h-16 bg-error-container rounded-2xl flex items-center justify-center">
        <AlertCircle className="w-8 h-8 text-error" />
      </div>
      <div>
        <p className="text-4xl font-black text-error leading-none">{count}</p>
        <p className="text-sm font-medium text-slate-600 mt-1">
          待评估事项 Items
        </p>
        <p className="text-xs text-error font-bold mt-1 bg-error/10 px-2 py-0.5 rounded inline-block">
          评估预警 Evaluation Alert
        </p>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const {
    propertiesTotal,
    projectStats,
    leads,
    pendingLeadsTotal,
    signedLeadsTotal,
  } = await getDashboardData();

  const stats = projectStats as ProjectStatsResponse;
  const signingCount = stats?.signing ?? 0;
  const renovatingCount = stats?.renovating ?? 0;
  const sellingCount = stats?.selling ?? 0;
  const soldCount = stats?.sold ?? 0;

  const funnelData: FunnelData = {
    total: pendingLeadsTotal + signedLeadsTotal,
    evaluating: Math.round((pendingLeadsTotal + signedLeadsTotal) * 0.5),
    visiting: Math.round((pendingLeadsTotal + signedLeadsTotal) * 0.25),
    signed: signedLeadsTotal,
  };

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

      {/* Top Row - Three Column Layout */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        <ProjectOverviewCard
          signingCount={signingCount}
          renovatingCount={renovatingCount}
          sellingCount={sellingCount}
          soldCount={soldCount}
        />
        <LeadsFunnelCard funnelData={funnelData} />
        <AlertCard count={pendingLeadsTotal} />
      </div>

      {/* Monitor Projects Section */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-on-surface dark:text-white">
            重点监控项目 Monitor Projects
          </h3>
          <div className="flex gap-2">
            <button className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-primary transition-colors hover:shadow-sm">
              <Filter className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-primary transition-colors hover:shadow-sm">
              <SortAsc className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-6 overflow-x-auto pb-6 pt-2 -mx-4 px-4 custom-scrollbar">
          {MOCK_PROJECTS.map((project) => (
            <div key={project.id} className="w-[320px] shrink-0">
              <ProjectCard project={project} />
            </div>
          ))}

          <Link
            href="/projects/new"
            className="w-[320px] shrink-0 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center p-8 text-center group cursor-pointer hover:bg-white dark:hover:bg-slate-800 hover:border-primary/40 transition-all min-h-[440px]"
          >
            <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 mb-5 group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
              <Plus className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-slate-500 group-hover:text-primary dark:text-slate-400 dark:group-hover:text-primary">
              添加新项目
            </h4>
            <p className="text-xs text-slate-400 mt-2 max-w-[140px]">
              快速录入房源或新建开发项目
            </p>
          </Link>
        </div>
      </section>

      {/* Leads Table Section */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-primary/10 rounded-lg">
              <ClipboardCheck className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                近期线索跟进 Active Leads
              </h3>
              <p className="text-xs text-slate-400">
                实时追踪线索动态与转化进度
              </p>
            </div>
          </div>
          <Link
            href="/leads"
            className="text-primary font-bold text-sm bg-primary/5 px-4 py-2 rounded-full hover:bg-primary/10 transition-colors"
          >
            查看全部线索 View All
          </Link>
        </div>

        <div className="overflow-x-auto -mx-8">
          <table className="w-full text-left min-w-[1200px]">
            <thead className="bg-slate-50/50 dark:bg-slate-800/50">
              <tr className="text-[10px] text-slate-400 uppercase tracking-widest border-y border-slate-100 dark:border-slate-700">
                <th className="pl-8 pr-4 py-4 font-black">小区 (Property)</th>
                <th className="px-4 py-4 font-black">户型</th>
                <th className="px-4 py-4 font-black">面积</th>
                <th className="px-4 py-4 font-black">楼层</th>
                <th className="px-4 py-4 font-black">总价</th>
                <th className="px-4 py-4 font-black">单价</th>
                <th className="px-4 py-4 font-black">状态 (Status)</th>
                <th className="px-4 py-4 font-black">区域 (Region)</th>
                <th className="px-4 py-4 font-black">录入人 (Creator)</th>
                <th className="px-4 py-4 font-black text-right pr-8">
                  更新时间 (Updated)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {MOCK_LEADS.map((lead) => (
                <tr
                  key={lead.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/80 transition-colors cursor-pointer group"
                >
                  <td className="pl-8 pr-4 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/5 text-primary flex items-center justify-center font-black text-xs border border-primary/10">
                        {lead.community[0]}
                      </div>
                      <span className="text-slate-800 dark:text-slate-200 font-semibold text-sm">
                        {lead.community}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-5 text-sm font-medium text-slate-600 dark:text-slate-400">
                    {lead.unitType}
                  </td>
                  <td className="px-4 py-5 text-sm font-medium text-slate-600 dark:text-slate-400">
                    {lead.area}
                  </td>
                  <td className="px-4 py-5 text-sm font-medium text-slate-500 dark:text-slate-500">
                    {lead.floor}
                  </td>
                  <td className="px-4 py-5 text-sm font-black text-primary">
                    {lead.totalPrice}
                  </td>
                  <td className="px-4 py-5 text-xs font-semibold text-slate-500 dark:text-slate-500">
                    {lead.unitPrice}
                  </td>
                  <td className="px-4 py-5">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        lead.status === "已出价"
                          ? "bg-tertiary/10 text-tertiary"
                          : lead.status === "带看中"
                          ? "bg-primary/10 text-primary"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                      }`}
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-4 py-5 text-sm font-medium text-slate-600 dark:text-slate-400">
                    {lead.region}
                  </td>
                  <td className="px-4 py-5">
                    <div className="flex items-center gap-2">
                      <UserCircle2 className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                        {lead.creator}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-5 pr-8 text-xs text-slate-400 text-right font-medium italic">
                    {lead.updatedTime}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
