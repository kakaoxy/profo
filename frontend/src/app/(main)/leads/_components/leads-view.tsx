"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Lead, LeadStatus, FollowUpMethod } from "../types";
import {
  updateLeadAction,
  addFollowUpAction,
  deleteLeadAction,
  createLeadAction,
} from "../actions";
import { useLeadsFilter, useLeadSelection, useViewMode } from "../hooks";
import { handleError, handleSuccess } from "../lib/error-handling";
import {
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
  CONFIRM_DIALOG,
  LOADING_TEXT,
} from "../constants/ui-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeadsStats } from "./leads-stats";
import { LeadsTable } from "./leads-table";
import { LeadsGrid } from "./leads-grid";
import { Plus, RefreshCw, Loader2, Search, X, Download, List, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const LeadDrawer = dynamic(
  () => import("./lead-drawer").then((mod) => mod.LeadDrawer),
  { ssr: false },
);

const AddLeadModal = dynamic(
  () => import("./add-lead-modal").then((mod) => mod.AddLeadModal),
  { ssr: false },
);

const MonitoringDashboard = dynamic(
  () => import("./monitoring-dashboard").then((mod) => mod.MonitoringDashboard),
  { ssr: false },
);

interface LeadsViewProps {
  initialLeads: Lead[];
  initialSelectedLeadId?: string;
}

// 状态配置 - 与 projects 保持一致的无边框风格
const statusConfig: Record<string, { label: string; className: string }> = {
  all: {
    label: "全部",
    className: "bg-slate-500 text-white hover:bg-slate-600",
  },
  pending_assessment: {
    label: "待评估",
    className: "bg-blue-500 text-white hover:bg-blue-600",
  },
  pending_visit: {
    label: "待看房",
    className: "bg-orange-500 text-white hover:bg-orange-600",
  },
  visited: {
    label: "已看房",
    className: "bg-emerald-500 text-white hover:bg-emerald-600",
  },
  signed: {
    label: "已签约",
    className: "bg-indigo-500 text-white hover:bg-indigo-600",
  },
  rejected: {
    label: "已驳回",
    className: "bg-slate-300 text-slate-700 hover:bg-slate-400",
  },
};

export function LeadsView({
  initialLeads,
  initialSelectedLeadId,
}: LeadsViewProps) {
  const router = useRouter();
  const {
    leads,
    setLeads,
    filters,
    setFilters,
    filteredLeads,
    isPending,
    resetFilters,
    refreshLeads,
  } = useLeadsFilter(initialLeads);

  const {
    selectedLead,
    isDrawerOpen,
    editingLead,
    isAddModalOpen,
    monitoringLead,
    openDetail,
    closeDetail,
    startAddLead,
    startEditLead,
    closeAddModal,
    openMonitor,
    closeMonitor,
  } = useLeadSelection({ initialSelectedLeadId, leads });

  const { viewMode, setViewMode } = useViewMode("table");
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (initialSelectedLeadId) {
      router.replace("/leads", { scroll: false });
    }
  }, [initialSelectedLeadId, router]);

  // 客户端过滤逻辑
  const displayLeads = useMemo(() => {
    return filteredLeads.filter((lead) => {
      // 状态过滤
      const statusMatch = activeTab === "all" || lead.status === activeTab;

      // 搜索过滤
      const searchLower = searchQuery.toLowerCase().trim();
      const searchMatch =
        !searchLower ||
        lead.communityName?.toLowerCase().includes(searchLower) ||
        lead.district?.toLowerCase().includes(searchLower) ||
        lead.businessArea?.toLowerCase().includes(searchLower);

      return statusMatch && searchMatch;
    });
  }, [filteredLeads, activeTab, searchQuery]);

  const handleAudit = async (
    id: string,
    status: LeadStatus,
    evalPrice?: number,
    reason?: string,
  ) => {
    const result = await updateLeadAction(id, {
      status,
      evalPrice,
      auditReason: reason,
    });

    if (result.success) {
      setLeads((prev) => prev.map((l) => (l.id === id ? result.data : l)));
      closeDetail();
      handleSuccess(SUCCESS_MESSAGES.AUDIT_COMPLETED);
    } else {
      handleError(result.error, "handleAudit", { fallbackMessage: ERROR_MESSAGES.AUDIT_FAILED });
    }
  };

  const handleAddFollowUp = async (
    id: string,
    method: FollowUpMethod,
    content: string,
  ) => {
    const result = await addFollowUpAction(id, method, content);
    if (result.success) {
      await refreshLeads();
      handleSuccess(SUCCESS_MESSAGES.FOLLOW_UP_ADDED);
    } else {
      handleError(result.error, "handleAddFollowUp", { fallbackMessage: ERROR_MESSAGES.FOLLOW_UP_FAILED });
    }
  };

  const handleAddLead = async (newLeadData: Omit<Lead, "id" | "createdAt">) => {
    if (editingLead) {
      const result = await updateLeadAction(editingLead.id, newLeadData);
      if (result.success) {
        setLeads((prev) =>
          prev.map((l) => (l.id === editingLead.id ? result.data : l)),
        );
        handleSuccess(SUCCESS_MESSAGES.LEAD_UPDATED);
        closeAddModal();
      } else {
        handleError(result.error, "handleAddLead", { fallbackMessage: ERROR_MESSAGES.UPDATE_FAILED });
      }
    } else {
      const result = await createLeadAction(newLeadData);
      if (result.success) {
        await refreshLeads();
        handleSuccess(SUCCESS_MESSAGES.LEAD_CREATED);
        closeAddModal();
      } else {
        handleError(result.error, "handleAddLead", { fallbackMessage: ERROR_MESSAGES.CREATE_FAILED });
      }
    }
  };

  const handleDeleteLead = async (id: string) => {
    if (!window.confirm(CONFIRM_DIALOG.DELETE_TITLE + CONFIRM_DIALOG.DELETE_DESCRIPTION)) return;
    const result = await deleteLeadAction(id);
    if (result.success) {
      await refreshLeads();
      handleSuccess(SUCCESS_MESSAGES.LEAD_DELETED);
    } else {
      handleError(result.error, "handleDeleteLead", { fallbackMessage: ERROR_MESSAGES.DELETE_FAILED });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-8 py-8 px-4 sm:px-6 lg:px-8">
        {/* Header Section */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            线索管理
          </h1>
          <p className="text-sm text-slate-500">
            管理和跟进房源线索，从初筛到签约的全流程追踪。
          </p>
        </div>

        {/* Stats Section */}
        <LeadsStats leads={leads} />

        {/* Main Content */}
        <div className="space-y-4">
          {/* Top Toolbar */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            {/* Left: Filter Area */}
            <div className="flex flex-col sm:flex-row w-full lg:w-auto gap-3 items-center">
              {/* Search Input */}
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="搜索小区名称..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9 bg-white border-slate-200 focus-visible:ring-blue-600"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Status Tabs */}
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full sm:w-auto"
              >
                <TabsList className="h-10 bg-slate-100/50 p-1 rounded-lg flex-wrap">
                  <TabsTrigger value="all" className="text-xs px-3">
                    全部
                  </TabsTrigger>
                  <TabsTrigger
                    value="pending_assessment"
                    className="text-xs px-3 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800"
                  >
                    待评估
                  </TabsTrigger>
                  <TabsTrigger
                    value="pending_visit"
                    className="text-xs px-3 data-[state=active]:bg-orange-100 data-[state=active]:text-orange-800"
                  >
                    待看房
                  </TabsTrigger>
                  <TabsTrigger
                    value="visited"
                    className="text-xs px-3 data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-800"
                  >
                    已看房
                  </TabsTrigger>
                  <TabsTrigger
                    value="signed"
                    className="text-xs px-3 data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-800"
                  >
                    已签约
                  </TabsTrigger>
                  <TabsTrigger
                    value="rejected"
                    className="text-xs px-3 data-[state=active]:bg-slate-200 data-[state=active]:text-slate-800"
                  >
                    已驳回
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Right: Actions */}
            <div className="flex w-full lg:w-auto gap-3 items-center">
              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-lg">
                <button
                  className={cn(
                    "flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                    viewMode === "table"
                      ? "bg-white shadow-sm text-slate-900"
                      : "text-slate-500 hover:text-slate-700"
                  )}
                  onClick={() => setViewMode("table")}
                >
                  <List className="h-3.5 w-3.5 mr-1.5" />
                  列表
                </button>
                <button
                  className={cn(
                    "flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                    viewMode === "grid"
                      ? "bg-white shadow-sm text-slate-900"
                      : "text-slate-500 hover:text-slate-700"
                  )}
                  onClick={() => setViewMode("grid")}
                >
                  <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />
                  网格
                </button>
              </div>

              <Button
                variant="outline"
                className="flex-1 lg:flex-none bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                onClick={() => toast.success("正在生成报表...")}
              >
                <Download className="mr-2 h-4 w-4" />
                导出
              </Button>

              <Button
                className="flex-1 lg:flex-none bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                onClick={startAddLead}
              >
                <Plus className="mr-2 h-4 w-4" />
                新增线索
              </Button>
            </div>
          </div>

          {/* Loading State */}
          {isPending && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <span className="ml-2 text-sm text-slate-500">{LOADING_TEXT.LOADING}</span>
            </div>
          )}

          {/* Content Area */}
          {!isPending && (
            <>
              {viewMode === "table" ? (
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <LeadsTable
                      leads={displayLeads}
                      onOpenDetail={openDetail}
                      onEdit={startEditLead}
                      onDelete={handleDeleteLead}
                    />
                  </div>
                </div>
              ) : (
                <LeadsGrid
                  leads={displayLeads}
                  onOpenDetail={openDetail}
                  onEdit={startEditLead}
                  onDelete={handleDeleteLead}
                />
              )}

              {/* Footer Info */}
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>
                  显示 {displayLeads.length} 条记录 (共 {leads.length} 条)
                </span>
              </div>
            </>
          )}
        </div>

        {/* Modals */}
        <LeadDrawer
          lead={selectedLead}
          isOpen={isDrawerOpen}
          onClose={closeDetail}
          onAudit={handleAudit}
          onAddFollowUp={handleAddFollowUp}
          onViewMonitor={openMonitor}
        />

        {monitoringLead && (
          <MonitoringDashboard
            lead={monitoringLead}
            onClose={closeMonitor}
          />
        )}

        <AddLeadModal
          isOpen={isAddModalOpen}
          onClose={closeAddModal}
          onAdd={handleAddLead}
          lead={editingLead}
        />
      </div>
    </div>
  );
}
