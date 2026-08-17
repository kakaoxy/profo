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
}

export function ProjectView({ data, total }: ProjectViewProps) {
  const router = useRouter();

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
            <TabsList className="h-10 bg-fog p-1 rounded-cards">
              <TabsTrigger
                value="all"
                className="text-xs px-3 text-graphite hover:text-ink data-[state=active]:bg-ink data-[state=active]:text-white"
              >
                全部
              </TabsTrigger>
              <TabsTrigger
                value="signing"
                className="text-xs px-3 text-graphite hover:text-ink data-[state=active]:bg-ink data-[state=active]:text-white"
              >
                签约
              </TabsTrigger>
              <TabsTrigger
                value="renovating"
                className="text-xs px-3 text-graphite hover:text-ink data-[state=active]:bg-ink data-[state=active]:text-white"
              >
                装修
              </TabsTrigger>
              <TabsTrigger
                value="selling"
                className="text-xs px-3 text-graphite hover:text-ink data-[state=active]:bg-ink data-[state=active]:text-white"
              >
                在售
              </TabsTrigger>
              <TabsTrigger
                value="sold"
                className="text-xs px-3 text-graphite hover:text-ink data-[state=active]:bg-ink data-[state=active]:text-white"
              >
                已售
              </TabsTrigger>
              <TabsTrigger
                value="ended"
                className="text-xs px-3 text-graphite hover:text-ink data-[state=active]:bg-ink data-[state=active]:text-white"
              >
                已下架
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* 业务形式筛选 */}
          <Select
            value={businessForm}
            onValueChange={(val) => setQuery({ business_form: val, page: 1 })}
          >
            <SelectTrigger className="h-10 w-35 bg-white border-dove rounded-inputs text-ink">
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
          <Button
            variant="outline"
            className="flex-1 lg:flex-none bg-white border-dove text-ink hover:bg-fog"
            // ⚠️ 未覆盖：导出功能待实现
            onClick={() => toast.info("功能开发中")}
          >
            <Download className="mr-2 h-4 w-4" />
            导出
          </Button>

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
            meta={{ onEdit: handleRowClick }}
          />
        </div>
      </div>
    </ListView>
  );
}
