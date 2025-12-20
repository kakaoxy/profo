"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

import { Project, SalesRecord } from "../../../../types";
import { deleteSalesRecordAction } from "../../../../actions";
import { ActivityList } from "./components/activity-list";
import { AddRecordDialog } from "./components/add-record-dialog";

interface ActivityTabsProps {
  project: Project;
  onRefresh?: () => void;
}

type TabType = "viewing" | "offer" | "negotiation";

export function ActivityTabs({ project, onRefresh }: ActivityTabsProps) {
  const records: SalesRecord[] = project.sales_records || [];
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("viewing");

  // 删除逻辑
  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这条记录吗？")) return;
    try {
      const res = await deleteSalesRecordAction(project.id, id);
      if (res.success) {
        toast.success("删除成功");
        if (onRefresh) onRefresh();
      } else {
        const errorMsg =
          typeof res.message === "string" ? res.message : "删除失败";
        toast.error(errorMsg);
      }
    } catch {
      toast.error("删除失败");
    }
  };

  // 数据过滤 (前端需要同时兼容 "offer" 和后端的 "offer")
  const viewings = records.filter((r) => r.record_type === "viewing");
  const offers = records.filter((r) => r.record_type === "offer");
  const talks = records.filter((r) => r.record_type === "negotiation");

  return (
    <div className="space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">销售活动记录</h3>
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          onClick={() => setIsDialogOpen(true)}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          新增记录
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabType)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3 bg-slate-100 h-9 p-1">
          <TabsTrigger
            value="viewing"
            className="text-xs data-[state=active]:bg-white data-[state=active]:text-emerald-700"
          >
            带看记录
          </TabsTrigger>
          <TabsTrigger
            value="offer"
            className="text-xs data-[state=active]:bg-white data-[state=active]:text-emerald-700"
          >
            出价记录
          </TabsTrigger>
          <TabsTrigger
            value="negotiation"
            className="text-xs data-[state=active]:bg-white data-[state=active]:text-emerald-700"
          >
            面谈记录
          </TabsTrigger>
        </TabsList>

        <TabsContent value="viewing" className="mt-4">
          <ActivityList
            type="viewing"
            data={viewings}
            onDelete={handleDelete}
          />
        </TabsContent>

        <TabsContent value="offer" className="mt-4">
          <ActivityList type="offer" data={offers} onDelete={handleDelete} />
        </TabsContent>

        <TabsContent value="negotiation" className="mt-4">
          <ActivityList
            type="negotiation"
            data={talks}
            onDelete={handleDelete}
          />
        </TabsContent>
      </Tabs>

      {/* 新增记录弹窗 */}
      <AddRecordDialog
        projectId={project.id}
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSuccess={() => {
          if (onRefresh) onRefresh();
        }}
        defaultTab={activeTab}
      />
    </div>
  );
}
