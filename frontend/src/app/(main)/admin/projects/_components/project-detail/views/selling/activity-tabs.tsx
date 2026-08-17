"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Project, SalesRecord } from "../../../../types";
import { deleteSalesRecordAction } from "../../../../actions/sales";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { ActivityList } from "./components/activity-list";
import { AddRecordDialog } from "./components/add-record-dialog";

/** 销售动态 tab 标识（页面层分区导航联动用） */
export type ActivityTabKey = "viewing" | "offer" | "negotiation";

interface ActivityTabsProps {
  project: Project;
  onRefresh?: () => void;
  /** 各类型记录数变化时上报（供页面层分区导航计数徽标） */
  onCountsChange?: (counts: { viewing: number; offer: number; negotiation: number }) => void;
  /** 外部指定激活 tab（如分区导航点击；受控优先，内部点击仍可自由切换） */
  activeTab?: ActivityTabKey;
}

export function ActivityTabs({ project, onRefresh, onCountsChange, activeTab }: ActivityTabsProps) {
  const records: SalesRecord[] = project.sales_records || [];
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [internalTab, setInternalTab] = useState<ActivityTabKey>("viewing");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 外部指定 tab 时切换（覆盖式：外部值变化时同步，内部点击仍自由切换）
  useEffect(() => {
    if (activeTab) setInternalTab(activeTab);
  }, [activeTab]);

  const { hasAnyPermission } = usePermission();
  const canAddByPermission = hasAnyPermission([
    PERMISSION_CODES.PROJECT_SALES_ADD_RECORD,
    PERMISSION_CODES.PROJECT_WRITE,
  ]);
  const canEditSales = canAddByPermission || project.sale?.can_edit_sales === true;

  // 删除逻辑：直接删除（无 confirm），删除中禁用重复点击 + Loader 反馈
  const handleDelete = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      const res = await deleteSalesRecordAction(project.id, id);
      if (res.success) {
        toast.success("删除成功");
        if (onRefresh) onRefresh();
      } else {
        const errorMsg = typeof res.message === "string" ? res.message : "删除失败";
        toast.error(errorMsg);
      }
    } catch {
      toast.error("删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  // 数据过滤
  const viewings = records.filter((r) => r.record_type === "viewing");
  const offers = records.filter((r) => r.record_type === "offer");
  const talks = records.filter((r) => r.record_type === "negotiation");

  // 记录数上报
  useEffect(() => {
    onCountsChange?.({
      viewing: viewings.length,
      offer: offers.length,
      negotiation: talks.length,
    });
  }, [viewings.length, offers.length, talks.length, onCountsChange]);

  return (
    <div className="mb-5 rounded-cards bg-pure-white p-5 shadow-steep md:p-6">
      {/* 卡头：标题 + 新增记录 textlink（设计稿 .card-head） */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-[500] text-ink">销售动态</div>
          <div className="mt-0.5 text-[13px] text-graphite">带看 / 出价 / 面谈全量记录</div>
        </div>
        {canEditSales && (
          <button
            type="button"
            onClick={() => setIsDialogOpen(true)}
            className="inline-flex shrink-0 items-center gap-1 text-sm text-graphite transition-colors hover:text-ink"
          >
            <Plus className="size-3.5" />
            新增记录
          </button>
        )}
      </div>

      <Tabs
        value={internalTab}
        onValueChange={(v) => setInternalTab(v as ActivityTabKey)}
        className="w-full"
      >
        {/* Tabs（设计稿 .tabs：fog 底 14px 圆角、fit-content、激活白底 shadow-float） */}
        <TabsList className="flex w-fit gap-0.5 rounded-[14px] bg-fog p-1">
          <TabsTrigger
            value="viewing"
            className="flex-none rounded-[10px] px-4 py-2 text-sm font-[450] text-graphite transition-all data-[state=active]:bg-pure-white data-[state=active]:text-ink data-[state=active]:shadow-steep-sm"
          >
            带看（{viewings.length}）
          </TabsTrigger>
          <TabsTrigger
            value="offer"
            className="flex-none rounded-[10px] px-4 py-2 text-sm font-[450] text-graphite transition-all data-[state=active]:bg-pure-white data-[state=active]:text-ink data-[state=active]:shadow-steep-sm"
          >
            出价（{offers.length}）
          </TabsTrigger>
          <TabsTrigger
            value="negotiation"
            className="flex-none rounded-[10px] px-4 py-2 text-sm font-[450] text-graphite transition-all data-[state=active]:bg-pure-white data-[state=active]:text-ink data-[state=active]:shadow-steep-sm"
          >
            面谈（{talks.length}）
          </TabsTrigger>
        </TabsList>

        {/* TabsContent：tabs 下 6px 接记录流（设计稿 1502 margin-bottom:6px） */}
        <TabsContent value="viewing" className="mt-1.5">
          <ActivityList
            type="viewing"
            data={viewings}
            onDelete={handleDelete}
            canEditSales={canEditSales}
            deletingId={deletingId}
          />
        </TabsContent>

        <TabsContent value="offer" className="mt-1.5">
          <ActivityList
            type="offer"
            data={offers}
            onDelete={handleDelete}
            canEditSales={canEditSales}
            deletingId={deletingId}
          />
        </TabsContent>

        <TabsContent value="negotiation" className="mt-1.5">
          <ActivityList
            type="negotiation"
            data={talks}
            onDelete={handleDelete}
            canEditSales={canEditSales}
            deletingId={deletingId}
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
        defaultTab={internalTab}
        canEditSales={canEditSales}
      />
    </div>
  );
}
