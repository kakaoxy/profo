"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryStates, parseAsString, parseAsInteger } from "nuqs";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/ui/data-table";
import { SearchBar, ListView } from "@/components/common";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreateProjectDialog } from "./create-project/index";
import { columns } from "./columns";
import { Project } from "../types";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";

interface ProjectViewProps {
  data: Project[];
  total: number;
  /** 各状态项目数（来自 /projects/stats，与列表同源并行拉取），用于 Tab 计数徽标 */
  counts?: {
    signing?: number;
    renovating?: number;
    selling?: number;
    sold?: number;
    ended?: number;
  };
}

/** Steep Tab 胶囊：白底容器 + Ink 激活（设计稿决策 04），.cnt 计数徽标随激活态换色 */
const TAB_TRIGGER_CLASS =
  "rounded-full text-[13px] px-3.5 text-ash hover:text-ink data-[state=active]:bg-ink data-[state=active]:text-white data-[state=active]:[&_.cnt]:text-white/65";

function TabCount({ value }: { value?: number }) {
  if (value === undefined) return null;
  return <span className="cnt ml-1 text-[12px] text-dove tabular-nums">{value}</span>;
}

export function ProjectView({ data, total, counts }: ProjectViewProps) {
  const router = useRouter();

  // 「全部」Tab 计数用五状态求和（stats 为全量口径）；total 随 URL 状态过滤变化，
  // 仅在 stats 缺失（降级路径）时兜底
  const allCount = counts
    ? (counts.signing ?? 0) +
      (counts.renovating ?? 0) +
      (counts.selling ?? 0) +
      (counts.sold ?? 0) +
      (counts.ended ?? 0)
    : total;

  // 1. status / business_form 通过 URL 同步由服务端筛选；searchQuery 仅作用于当前页数据
  const [{ status: activeTab, business_form: businessForm }, setQuery] = useQueryStates(
    {
      status: parseAsString.withDefault("all"),
      page: parseAsInteger.withDefault(1),
      business_form: parseAsString.withDefault("all"),
    },
    { shallow: false },
  );
  const [searchQuery, setSearchQuery] = useState("");

  // 2. 关键字搜索仅作用于当前页数据（status 已由服务端按 URL ?status= 筛选分页）
  const filteredData = useMemo(() => {
    return data.filter((project) => {
      const searchLower = searchQuery.toLowerCase().trim();
      const searchMatch =
        !searchLower ||
        project.community_name?.toLowerCase().includes(searchLower) ||
        project.name.toLowerCase().includes(searchLower) ||
        project.contract_no?.toLowerCase().includes(searchLower);

      return searchMatch;
    });
  }, [data, searchQuery]);

  const handleRowClick = (row: Project) => {
    router.push(`/admin/projects/${row.id}`);
  };

  return (
    <ListView
      searchBar={
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="搜索小区名称/合同编号..."
        />
      }
      filterTabs={
        <div className="flex flex-col sm:flex-row w-full lg:w-auto gap-3 items-center">
          <Tabs
            value={activeTab}
            onValueChange={(val) => setQuery({ status: val, page: 1 })}
            className="w-full sm:w-auto"
          >
            <TabsList className="h-10 bg-pure-white p-1 rounded-full shadow-steep-sm">
              <TabsTrigger value="all" className={TAB_TRIGGER_CLASS}>
                全部
                <TabCount value={allCount} />
              </TabsTrigger>
              <TabsTrigger value="signing" className={TAB_TRIGGER_CLASS}>
                签约
                <TabCount value={counts?.signing} />
              </TabsTrigger>
              <TabsTrigger value="renovating" className={TAB_TRIGGER_CLASS}>
                装修
                <TabCount value={counts?.renovating} />
              </TabsTrigger>
              <TabsTrigger value="selling" className={TAB_TRIGGER_CLASS}>
                在售
                <TabCount value={counts?.selling} />
              </TabsTrigger>
              <TabsTrigger value="sold" className={TAB_TRIGGER_CLASS}>
                已售
                <TabCount value={counts?.sold} />
              </TabsTrigger>
              <TabsTrigger value="ended" className={TAB_TRIGGER_CLASS}>
                已下架
                <TabCount value={counts?.ended} />
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* 业务形式筛选 */}
          <Select
            value={businessForm}
            onValueChange={(val) => setQuery({ business_form: val, page: 1 })}
          >
            <SelectTrigger className="h-10 w-35 border-none bg-white rounded-inputs shadow-steep-sm text-ink">
              <SelectValue placeholder="业务形式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部业务形式</SelectItem>
              <SelectItem value="agent">代理美化</SelectItem>
              <SelectItem value="wholesale">收购美化</SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
      actions={
        <>
          {/* 次级动作 = text link（设计稿决策 04） */}
          <button
            type="button"
            // ⚠️ 未覆盖：导出功能待实现
            onClick={() => toast.info("功能开发中")}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-2 text-sm font-[450] text-ink transition-colors hover:text-rust focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex-none"
          >
            <Download className="h-4 w-4" />
            导出
          </button>

          <HasPermission code={PERMISSION_CODES.PROJECT_WRITE}>
            <div className="flex-1 lg:flex-none">
              <CreateProjectDialog
                trigger={
                  <Button className="flex-1 lg:flex-none rounded-full bg-ink text-white hover:bg-ink/90 h-10 px-4">
                    <Plus className="mr-2 h-4 w-4" />
                    新建项目
                  </Button>
                }
              />
            </div>
          </HasPermission>
        </>
      }
      totalCount={total}
      filteredCount={filteredData.length}
    >
      <div className="bg-white rounded-cards shadow-steep overflow-hidden">
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={filteredData}
            onRowClick={handleRowClick}
            container={false}
            meta={{ onEdit: handleRowClick }}
          />
        </div>
      </div>
    </ListView>
  );
}
