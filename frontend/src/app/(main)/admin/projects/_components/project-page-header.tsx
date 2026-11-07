"use client";

import { ArrowDownToLine, Plus } from "lucide-react";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { CreateProjectDialog } from "./create-project/index";
import type { Project } from "../types";
import { getStageMeta, managerName, projectTitle, toWanValue } from "./project-display";

interface ProjectPageHeaderProps {
  projects: Project[];
}

function csvCell(value: string | number | undefined): string {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function ProjectPageHeader({ projects }: ProjectPageHeaderProps) {
  const exportCsv = () => {
    const header = ["项目", "小区", "阶段", "业务形式", "签约价(万)", "挂牌价(万)", "成交价(万)", "签约日期", "上架日期", "成交日期", "负责人"];
    const rows = projects.map((project) => [
      projectTitle(project),
      project.community_name ?? "",
      getStageMeta(project.status).label,
      project.business_form === "wholesale" ? "收购美化" : project.business_form === "agent" ? "代理美化" : "",
      toWanValue(project.signing_price),
      toWanValue(project.list_price),
      toWanValue(project.sold_price),
      project.signing_date ?? "",
      project.listing_date ?? "",
      project.sold_date ?? "",
      managerName(project),
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `项目台账-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="flex flex-col gap-6 pt-1 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="flex items-center gap-2 text-[10px] font-[480] uppercase tracking-[0.16em] text-graphite">
          Projects <span className="h-px w-4 bg-rust/70" /> 资产全周期
        </p>
        <h1 className="mt-3 font-signifier text-[30px] font-[420] leading-none tracking-[-0.02em] text-ink md:text-[44px]">项目管理</h1>
        <p className="mt-4 hidden max-w-[560px] text-[13px] leading-6 text-graphite md:block">
          从签约、装修到成交，每一套房源的进度、现金流与责任人都在这张表里。
        </p>
      </div>
      <div className="flex items-center gap-5 pb-1">
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-[450] text-ink transition-colors hover:text-rust focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowDownToLine className="h-3.5 w-3.5" />
          导出台账
        </button>
        <HasPermission code={PERMISSION_CODES.PROJECT_WRITE}>
          <CreateProjectDialog
            trigger={
              <button
                type="button"
                className="inline-flex h-[46px] items-center gap-2 rounded-full bg-ink px-5 text-[13px] font-[480] text-white transition-colors hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30"
              >
                <Plus className="h-4 w-4" />
                新建项目
              </button>
            }
          />
        </HasPermission>
      </div>
    </header>
  );
}
