"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  LayoutGrid,
  Search,
  SlidersHorizontal,
  Table2,
  X,
} from "lucide-react";
import type { Project } from "../types";
import {
  daysBetween,
  daysSince,
  formatFullDate,
  getProjectStage,
  getStageMeta,
  managerInitial,
  managerName,
  priceChange,
  projectMeta,
  projectTitle,
  stageNote,
  toWanValue,
} from "./project-display";

type SortKey = "updated" | "signing" | "holding";
export type ViewMode = "table" | "grid";

interface ProjectListCardProps {
  projects: Project[];
  totalCount: number;
  activeStage: string;
  businessForm: string;
  archivedFilter: string;
  searchQuery: string;
  sort: SortKey;
  page: number;
  pageSize?: number;
  view: ViewMode;
  onSearchChange: (value: string) => void;
  onSortChange: (value: SortKey) => void;
  onViewChange: (value: ViewMode) => void;
  onStageChange: (value: "all") => void;
  onBusinessFormChange: (value: string) => void;
  onArchivedFilterChange: (value: string) => void;
  onPageChange: (page: number) => void;
}

const SORT_LABEL: Record<SortKey, string> = {
  updated: "最近更新",
  signing: "签约金额",
  holding: "持有周期",
};

const STATUS_DOT: Record<string, string> = {
  signing: "bg-ink",
  renovating: "bg-rust",
  selling: "bg-white",
  sold: "bg-ash",
  ended: "bg-dove",
};

function getPageNumbers(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 3) return [1, 2, 3, 4, "ellipsis", total];
  if (current >= total - 2) return [1, "ellipsis", total - 3, total - 2, total - 1, total];
  return [1, "ellipsis", current - 1, current, current + 1, "ellipsis", total];
}

function ProjectStatus({ project }: { project: Project }) {
  const meta = getStageMeta(project.status);
  return (
    <span className={`inline-flex h-[25px] items-center gap-1.5 rounded-full px-2.5 text-[11px] font-[480] ${meta.tone}`}>
      <span className={`h-[5px] w-[5px] rounded-full ${STATUS_DOT[getProjectStage(project.status)] ?? "bg-current"}`} />
      {meta.label}
    </span>
  );
}

function CashValue({ project }: { project: Project }) {
  const raw = Number(project.net_cash_flow ?? 0);
  const signing = Number(project.signing_price ?? 0);
  const area = Number(project.area ?? 0);
  const exit = Number(project.sold_price ?? project.list_price ?? 0);
  const estimatedCost = signing + area * 0.36 + 6;
  const estimatedNet = exit > 0 ? exit * 0.965 - estimatedCost : 0;
  const hasActual = raw !== 0;
  const value = hasActual ? raw / 10000 : estimatedNet;
  const positive = value > 0;
  const roi = hasActual ? Number(project.roi ?? 0) : estimatedCost > 0 ? (estimatedNet / estimatedCost) * 100 : 0;
  return (
    <div>
      <p className={`text-[13px] font-[480] tabular-nums ${positive ? "text-rust" : "text-ink"}`}>
        {value === 0 ? "¥0" : `${positive ? "+" : "−"}¥${Math.abs(value).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}万`}
      </p>
      <p className="mt-1 text-[10px] text-dove">ROI {roi > 0 ? `${Math.round(roi)}%` : "—"}</p>
    </div>
  );
}

function TableView({ projects }: { projects: Project[] }) {
  const router = useRouter();
  return (
    <>
      <div className="space-y-3 px-4 pb-4 md:hidden">
        {projects.map((project) => {
          const change = priceChange(project);
          return (
            <Link
              key={project.id}
              href={`/admin/projects/${project.id}`}
              className="block rounded-[18px] border border-dove/20 bg-pure-white p-4 transition-colors hover:border-rust/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-[480] leading-5 text-ink">{projectTitle(project)}</p>
                  <p className="mt-1 truncate text-[10.5px] text-graphite">{projectMeta(project)}</p>
                </div>
                <ProjectStatus project={project} />
              </div>
              <div className="mt-4 flex items-end justify-between gap-3 border-t border-dove/15 pt-3">
                <div>
                  <p className="text-[9.5px] text-dove">签约价</p>
                  <p className="mt-1 font-signifier text-[21px] font-[450] leading-none text-ink">¥{toWanValue(project.signing_price)} 万</p>
                </div>
                <div className="text-right">
                  <p className="text-[9.5px] text-dove">{project.sold_price ? "成交价" : project.list_price ? "挂牌价" : "挂牌价"}</p>
                  <p className="mt-1 text-[12px] font-[480] text-rust">
                    {project.sold_price ? `¥${toWanValue(project.sold_price)} 万` : project.list_price ? `¥${toWanValue(project.list_price)} 万` : "待定价"}
                    {change ? <span className="ml-1 text-[10px]">{change}</span> : null}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[960px] table-fixed border-collapse">
        <thead>
          <tr className="h-[42px] text-left text-[10px] uppercase tracking-[0.12em] text-dove">
            <th className="w-[31%] pl-5 pr-3 font-[480]">房源</th>
            <th className="w-[15%] px-3 font-[480]">阶段</th>
            <th className="w-[16%] px-3 font-[480]">价格</th>
            <th className="w-[11%] px-3 font-[480]">周期</th>
            <th className="w-[12%] px-3 font-[480]">负责人</th>
            <th className="w-[11%] px-3 font-[480]">现金流</th>
            <th className="w-[4%] pr-5 font-[480]" />
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const change = priceChange(project);
            const soldDays = daysBetween(project.signing_date, project.sold_date);
            const holdingDays = daysSince(project.signing_date);
            const commissionDays = daysSince(project.commission_end_date);
            return (
              <tr
                key={project.id}
                onClick={() => router.push(`/admin/projects/${project.id}`)}
                tabIndex={0}
                role="link"
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/admin/projects/${project.id}`);
                  }
                }}
                className="group h-[86px] cursor-pointer border-t border-dove/20 text-[13px] align-middle transition-colors hover:bg-fog/70 focus-visible:bg-fog focus-visible:outline-none"
              >
                <td className="pl-5 pr-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[12px] bg-fog font-serif text-[13px] font-[480] text-ink">
                      {(project.community_name ?? project.name).slice(0, 1)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-[480] leading-5 text-ink">{projectTitle(project)}</p>
                      <p className="mt-1 truncate text-[11px] text-graphite">{projectMeta(project)}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3">
                  <ProjectStatus project={project} />
                  <p className="mt-1.5 text-[10.5px] text-dove">{stageNote(project)}</p>
                </td>
                <td className="px-3">
                  <p className="text-[14.5px] font-[480] tabular-nums text-ink">¥{toWanValue(project.signing_price)} 万</p>
                  <p className="mt-1 text-[10.5px] text-graphite">
                    {project.sold_price
                      ? `成交 ¥${toWanValue(project.sold_price)} 万`
                      : project.list_price
                        ? `挂牌 ¥${toWanValue(project.list_price)} 万`
                        : "未挂牌"}
                    {change ? <span className="ml-1.5 text-rust">{change}</span> : null}
                  </p>
                  <p className={`mt-1 text-[9.5px] tabular-nums ${commissionDays !== null && commissionDays <= 30 ? "text-rust" : "text-dove"}`}>
                    委托至 {formatFullDate(project.commission_end_date)}
                  </p>
                </td>
                <td className="px-3">
                  <p className="text-[13px] font-[450] tabular-nums text-ink">
                    {soldDays !== null ? `${soldDays} 天` : holdingDays !== null ? `${holdingDays} 天` : "—"}
                  </p>
                  <p className="mt-1 text-[10px] text-dove">{soldDays !== null ? "成交周期" : "已持有"}</p>
                </td>
                <td className="px-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-ink text-[10px] text-white">
                      {managerInitial(project)}
                    </span>
                    <span className="truncate text-[12px] text-graphite">{managerName(project)}</span>
                  </div>
                </td>
                <td className="px-3">
                  <CashValue project={project} />
                </td>
                <td className="pr-5 text-right">
                  <ArrowRight className="ml-auto h-3.5 w-3.5 text-dove transition-transform group-hover:translate-x-0.5 group-hover:text-rust" />
                </td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
    </>
  );
}

function GridView({ projects }: { projects: Project[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <Link
          key={project.id}
          href={`/admin/projects/${project.id}`}
          className="group rounded-[20px] border border-dove/20 bg-fog/40 p-4 transition-colors hover:border-rust/30 hover:bg-apricot-wash/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[16px] font-[480] leading-5 text-ink">{projectTitle(project)}</p>
              <p className="mt-1.5 text-[10.5px] text-graphite">{projectMeta(project)}</p>
            </div>
            <ProjectStatus project={project} />
          </div>
          <div className="mt-5 flex items-end justify-between border-t border-dove/20 pt-3">
            <div>
              <p className="text-[10px] text-dove">签约价</p>
              <p className="mt-1 font-signifier text-[22px] font-[450] leading-none text-ink">¥{toWanValue(project.signing_price)} 万</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-dove">{project.sold_price ? "成交价" : "挂牌价"}</p>
              <p className="mt-1 text-[13px] font-[480] text-rust">
                {project.sold_price ? `¥${toWanValue(project.sold_price)} 万` : project.list_price ? `¥${toWanValue(project.list_price)} 万` : "待定价"}
              </p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function ProjectListCard(props: ProjectListCardProps) {
  const {
    projects,
    totalCount,
    activeStage,
    businessForm,
    archivedFilter,
    searchQuery,
    sort,
    page,
    pageSize = 8,
    view,
    onSearchChange,
    onSortChange,
    onViewChange,
    onStageChange,
    onBusinessFormChange,
    onArchivedFilterChange,
    onPageChange,
  } = props;

  const searchRef = useRef<HTMLInputElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const sorted = useMemo(() => {
    const copy = [...projects];
    if (sort === "signing") {
      copy.sort((a, b) => (b.signing_price ?? 0) - (a.signing_price ?? 0));
    } else if (sort === "holding") {
      copy.sort((a, b) => (daysSince(b.signing_date) ?? 0) - (daysSince(a.signing_date) ?? 0));
    } else {
      copy.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }
    return copy;
  }, [projects, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
  const stageLabel = activeStage === "all" ? "全部项目" : `${getStageMeta(activeStage).label}项目`;
  const hasFilter = activeStage !== "all" || businessForm !== "all" || archivedFilter !== "all" || searchQuery.trim().length > 0;

  return (
    <section className="rounded-cards bg-white shadow-steep">
      <div className="flex flex-col gap-4 px-5 pb-3 pt-6 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[17px] font-[480] text-ink">{stageLabel}</h2>
            <span className="rounded-full bg-fog px-2 py-0.5 text-[10px] tabular-nums text-graphite">{sorted.length}</span>
            <span className="text-[10px] text-dove">/ 共 {totalCount} 个</span>
          </div>
          <button
            type="button"
            onClick={() => onSortChange(sort === "updated" ? "signing" : sort === "signing" ? "holding" : "updated")}
            className="inline-flex items-center gap-1.5 text-[11px] text-graphite transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowUpDown className="h-3 w-3" />
            排序：{SORT_LABEL[sort]}
          </button>
        </div>

        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1 lg:max-w-[252px]">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dove" />
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="搜索小区、地址或合同编号"
              className="h-10 w-full rounded-inputs border border-dove/30 bg-white pl-9 pr-12 text-[12px] text-ink outline-none placeholder:text-dove focus:border-rust/50 focus:ring-2 focus:ring-rust/10"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-dove/30 px-1 py-0.5 text-[9px] text-dove">⌘K</kbd>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={businessForm}
              onChange={(event) => onBusinessFormChange(event.target.value)}
              className="h-10 rounded-inputs border border-dove/30 bg-white px-3 text-[11.5px] text-ink outline-none focus:border-rust/50"
              aria-label="业务形式"
            >
              <option value="all">全部业务形式</option>
              <option value="agent">代理美化</option>
              <option value="wholesale">收购美化</option>
            </select>
            <select
              value={archivedFilter}
              onChange={(event) => onArchivedFilterChange(event.target.value)}
              className="h-10 rounded-inputs border border-dove/30 bg-white px-3 text-[11.5px] text-ink outline-none focus:border-rust/50"
              aria-label="归档状态"
            >
              <option value="all">全部归档状态</option>
              <option value="false">未归档</option>
              <option value="true">已归档</option>
            </select>
            <button
              type="button"
              onClick={() => setFiltersOpen((value) => !value)}
              className={`inline-flex h-10 items-center gap-1.5 rounded-inputs border px-3 text-[11.5px] transition-colors lg:hidden ${
                filtersOpen ? "border-rust/40 bg-apricot-wash text-rust" : "border-dove/30 bg-white text-graphite"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              筛选
            </button>
          </div>
          <div className="ml-auto flex items-center gap-1 rounded-inputs bg-fog p-1">
            <button
              type="button"
              onClick={() => onViewChange("table")}
              aria-label="表格视图"
              aria-pressed={view === "table"}
              className={`flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors ${view === "table" ? "bg-white text-ink shadow-sm" : "text-dove hover:text-graphite"}`}
            >
              <Table2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onViewChange("grid")}
              aria-label="卡片视图"
              aria-pressed={view === "grid"}
              className={`flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors ${view === "grid" ? "bg-white text-ink shadow-sm" : "text-dove hover:text-graphite"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {hasFilter ? (
          <div className={`${filtersOpen ? "flex" : "hidden lg:flex"} flex-wrap items-center gap-2 text-[10.5px]`}>
            {activeStage !== "all" ? (
              <button type="button" onClick={() => onStageChange("all")} className="inline-flex items-center gap-1 rounded-full bg-apricot-wash px-2.5 py-1 text-rust">
                阶段：{getStageMeta(activeStage).label} <X className="h-3 w-3" />
              </button>
            ) : null}
            {businessForm !== "all" ? (
              <button type="button" onClick={() => onBusinessFormChange("all")} className="inline-flex items-center gap-1 rounded-full bg-sky-wash px-2.5 py-1 text-ink">
                业务：{businessForm === "agent" ? "代理美化" : "收购美化"} <X className="h-3 w-3" />
              </button>
            ) : null}
            {archivedFilter !== "all" ? (
              <button type="button" onClick={() => onArchivedFilterChange("all")} className="inline-flex items-center gap-1 rounded-full bg-fog px-2.5 py-1 text-graphite">
                归档：{archivedFilter === "true" ? "已归档" : "未归档"} <X className="h-3 w-3" />
              </button>
            ) : null}
            {searchQuery.trim() ? (
              <button type="button" onClick={() => onSearchChange("")} className="inline-flex items-center gap-1 rounded-full bg-fog px-2.5 py-1 text-graphite">
                搜索：{searchQuery.trim()} <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {pageItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-fog text-dove">
            <Search className="h-5 w-5" />
          </div>
          <p className="mt-4 text-[14px] font-[480] text-ink">没有找到匹配的项目</p>
          <p className="mt-1.5 max-w-[300px] text-[11px] leading-5 text-graphite">
            {hasFilter ? "试试收紧筛选条件，或清空当前筛选后再查看。" : "还没有项目，先创建第一个项目。"}
          </p>
          {hasFilter ? (
            <button
              type="button"
              onClick={() => {
                onStageChange("all");
                onBusinessFormChange("all");
                onArchivedFilterChange("all");
                onSearchChange("");
              }}
              className="mt-4 text-[11px] font-[480] text-rust underline underline-offset-4"
            >
              清空全部筛选
            </button>
          ) : null}
        </div>
      ) : view === "table" ? (
        <TableView projects={pageItems} />
      ) : (
        <GridView projects={pageItems} />
      )}

      <footer className="flex flex-col gap-3 border-t border-dove/20 px-5 py-4 text-[10.5px] text-dove sm:flex-row sm:items-center sm:justify-between lg:px-6">
        <p>
          显示 {sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sorted.length)} 条 · 共 {sorted.length} 个项目
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="上一页"
            disabled={safePage <= 1}
            onClick={() => onPageChange(Math.max(1, safePage - 1))}
            className="flex h-7 w-7 items-center justify-center rounded-full text-graphite transition-colors hover:bg-fog disabled:opacity-30"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          {getPageNumbers(safePage, totalPages).map((item, index) =>
            item === "ellipsis" ? (
              <span key={`ellipsis-${index}`} className="px-1 text-dove">…</span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                aria-current={item === safePage ? "page" : undefined}
                className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 tabular-nums transition-colors ${
                  item === safePage ? "bg-ink text-white" : "text-graphite hover:bg-fog"
                }`}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            aria-label="下一页"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
            className="flex h-7 w-7 items-center justify-center rounded-full text-graphite transition-colors hover:bg-fog disabled:opacity-30"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </footer>
    </section>
  );
}
