"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Lead,
  LeadStatus,
  LeadTabValue,
  FollowUpConclusion,
  FollowUpMethod,
  LeadFilterOption,
} from "../types";
import {
  updateLeadAction,
  addFollowUpAction,
  deleteLeadAction,
  createLeadAction,
} from "../actions";
import { useLeadsFilter, useLeadSelection, useViewMode } from "../hooks";
import { handleError, handleSuccess } from "@/lib/error-handling";
import { SUCCESS_MESSAGES, ERROR_MESSAGES } from "../constants/ui-labels";
import { LeadsStats, type LeadStats } from "./leads-stats";
import { LeadsTable } from "./leads-table";
import { LeadsGrid } from "./leads-grid";
import { LeadsMobileList } from "./leads-mobile-list";
import { LeadsToolbar } from "./leads-toolbar";
import { LeadsPagination } from "./leads-pagination";
import { EmptyState } from "@/components/common";
import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import { Button } from "@/components/ui/button";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import {
  AlertTriangle,
  ChevronDown,
  Download,
  Inbox,
  LayoutGrid,
  LayoutList,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LeadDrawer = dynamic(() => import("./lead-drawer").then((mod) => mod.LeadDrawer), {
  ssr: false,
});

const AddLeadModal = dynamic(() => import("./add-lead-modal").then((mod) => mod.AddLeadModal), {
  ssr: false,
});

interface LeadsViewProps {
  initialLeads: Lead[];
  total: number;
  stats: LeadStats;
  /** 列表接口请求失败（非空列表）；页头/工具栏保留，仅表体区进入错误态 */
  listError?: boolean;
  initialSelectedLeadId?: string;
  creatorId?: string;
  creatorName?: string;
  /** 归属筛选 */
  storeOptions?: LeadFilterOption[];
  brokerOptions?: LeadFilterOption[];
  employeeOptions?: LeadFilterOption[];
}

type SortKey = "followUp" | "updated" | "created";

const LIST_TITLE: Record<LeadTabValue, string> = {
  all: "全部线索",
  [LeadStatus.PENDING_ASSESSMENT]: "待评估线索",
  [LeadStatus.PENDING_VISIT]: "待看房线索",
  [LeadStatus.VISITED]: "已看房线索",
  [LeadStatus.SIGNED]: "已签约线索",
  [LeadStatus.REJECTED]: "已放弃线索",
  [LeadStatus.LOST_TO_COMPETITOR]: "他已成交线索",
};

const SORT_LABEL: Record<SortKey, string> = {
  followUp: "最近跟进",
  updated: "最近更新",
  created: "创建时间",
};

function getTime(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function LeadsView({
  initialLeads,
  total,
  stats,
  listError = false,
  initialSelectedLeadId,
  creatorId,
  creatorName,
  storeOptions = [],
  brokerOptions = [],
  employeeOptions = [],
}: LeadsViewProps) {
  const router = useRouter();
  const {
    leads,
    filteredLeads,
    refreshLeads,
    resetFilters,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    clearCreatorId,
    storeId,
    setStoreId,
    brokerId,
    setBrokerId,
    ownerEmployeeId,
    setOwnerEmployeeId,
  } = useLeadsFilter(initialLeads);

  const {
    selectedLead,
    isDrawerOpen,
    editingLead,
    isAddModalOpen,
    openDetail,
    closeDetail,
    startAddLead,
    startEditLead,
    closeAddModal,
  } = useLeadSelection({ initialSelectedLeadId, leads });

  const { viewMode, setViewMode } = useViewMode("table");
  const [sortBy, setSortBy] = useState<SortKey>("followUp");

  useEffect(() => {
    if (initialSelectedLeadId) {
      router.replace("/admin/leads", { scroll: false });
    }
  }, [initialSelectedLeadId, router]);

  const sortedLeads = useMemo(() => {
    return [...filteredLeads].sort((a, b) => {
      if (sortBy === "created") return getTime(b.createdAt) - getTime(a.createdAt);
      if (sortBy === "updated") {
        return getTime(b.updatedAt || b.lastFollowUpAt) - getTime(a.updatedAt || a.lastFollowUpAt);
      }
      return getTime(b.lastFollowUpAt || b.updatedAt) - getTime(a.lastFollowUpAt || a.updatedAt);
    });
  }, [filteredLeads, sortBy]);

  const handleAudit = async (
    id: string,
    status: LeadStatus,
    _evalPrice?: number,
    reason?: string,
  ) => {
    // eval_price 由评估服务(POST /leads/{lead_id}/evaluations)管理，update 不再传递
    const result = await updateLeadAction(id, { status, auditReason: reason });
    if (result.success) {
      refreshLeads();
      closeDetail();
      handleSuccess(SUCCESS_MESSAGES.AUDIT_COMPLETED);
      return true;
    }
    handleError(result.error, "handleAudit", { fallbackMessage: ERROR_MESSAGES.AUDIT_FAILED });
    return false;
  };

  const handleAddFollowUp = async (
    id: string,
    method: FollowUpMethod,
    content: string,
    conclusion?: FollowUpConclusion | null,
  ) => {
    const result = await addFollowUpAction(id, method, content, conclusion);
    if (result.success) {
      refreshLeads();
      handleSuccess(SUCCESS_MESSAGES.FOLLOW_UP_ADDED);
    } else {
      handleError(result.error, "handleAddFollowUp", {
        fallbackMessage: ERROR_MESSAGES.FOLLOW_UP_FAILED,
      });
    }
  };

  const handleImagesUpdate = async (id: string, images: string[]) => {
    const result = await updateLeadAction(id, { images });
    if (result.success) {
      refreshLeads();
      handleSuccess(SUCCESS_MESSAGES.LEAD_UPDATED);
    } else {
      handleError(result.error, "handleImagesUpdate", {
        fallbackMessage: ERROR_MESSAGES.UPDATE_FAILED,
      });
    }
  };

  const handleEditLead = (lead: Lead) => {
    // 先关闭抽屉，避免 Radix Sheet 的焦点陷阱挡住编辑弹窗
    closeDetail();
    requestAnimationFrame(() => startEditLead(lead));
  };

  const handleAddLead = async (newLeadData: Omit<Lead, "id" | "createdAt">) => {
    if (editingLead) {
      const result = await updateLeadAction(editingLead.id, newLeadData);
      if (result.success) {
        refreshLeads();
        handleSuccess(SUCCESS_MESSAGES.LEAD_UPDATED);
        closeAddModal();
      } else {
        handleError(result.error, "handleAddLead", {
          fallbackMessage: ERROR_MESSAGES.UPDATE_FAILED,
        });
      }
    } else {
      const result = await createLeadAction(newLeadData);
      if (result.success) {
        refreshLeads();
        handleSuccess(SUCCESS_MESSAGES.LEAD_CREATED);
        closeAddModal();
      } else {
        handleError(result.error, "handleAddLead", {
          fallbackMessage: ERROR_MESSAGES.CREATE_FAILED,
        });
      }
    }
  };

  const handleDeleteLead = async (id: string) => {
    const result = await deleteLeadAction(id);
    if (result.success) {
      refreshLeads();
      handleSuccess(SUCCESS_MESSAGES.LEAD_DELETED);
    } else {
      handleError(result.error, "handleDeleteLead", {
        fallbackMessage: ERROR_MESSAGES.DELETE_FAILED,
      });
    }
  };

  const handleExport = () => {
    toast.success("正在按当前筛选生成报表...");
  };

  const cycleSort = () => {
    setSortBy((current) => {
      if (current === "followUp") return "updated";
      if (current === "updated") return "created";
      return "followUp";
    });
  };

  const listTitle = LIST_TITLE[activeTab as LeadTabValue] ?? "全部线索";
  const hasFilters = Boolean(
    searchQuery || creatorId || storeId || brokerId || ownerEmployeeId,
  );

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-7">
        <PageHeader
          title="线索中心"
          description="初筛评估 → 上门实勘 → 商务谈判 → 签约收房。"
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={handleExport}
                className="h-10 rounded-full px-3.5 text-[12.5px] text-graphite hover:bg-pure-white hover:text-ink"
              >
                <Download className="h-3.5 w-3.5" />
                导出
              </Button>
              <HasPermission code={PERMISSION_CODES.LEAD_WRITE}>
                <Button
                  type="button"
                  onClick={startAddLead}
                  className="h-10 rounded-full bg-ink px-4 text-[12.5px] font-[450] text-white shadow-steep-sm hover:bg-ink/90"
                >
                  <Plus className="h-3.5 w-3.5" />
                  录入新线索
                </Button>
              </HasPermission>
            </>
          }
        />

        <LeadsStats
          stats={stats}
          activeTab={activeTab}
          onItemSelect={(tab) => setActiveTab(tab as LeadTabValue)}
        />

        <section className="flex flex-col gap-4" aria-label="线索列表">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-2.5">
              <h2 className="text-[22px] font-[480] tracking-[-0.02em] text-ink">
                {listTitle}
              </h2>
              <span className="text-[11.5px] tabular-nums text-graphite">{total} 条</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={cycleSort}
                className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[11.5px] text-graphite transition-colors hover:bg-pure-white hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
              >
                {SORT_LABEL[sortBy]}
                <ChevronDown className="h-3 w-3" />
              </button>
              <div
                className="flex items-center gap-0.5 rounded-full bg-pure-white p-0.5 shadow-steep-sm"
                role="group"
                aria-label="视图切换"
              >
                <button
                  type="button"
                  aria-label="列表视图"
                  aria-pressed={viewMode === "table"}
                  onClick={() => setViewMode("table")}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20",
                    viewMode === "table"
                      ? "bg-ink text-white"
                      : "text-graphite hover:bg-fog hover:text-ink",
                  )}
                >
                  <LayoutList className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="卡片视图"
                  aria-pressed={viewMode === "grid"}
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20",
                    viewMode === "grid"
                      ? "bg-ink text-white"
                      : "text-graphite hover:bg-fog hover:text-ink",
                  )}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <LeadsToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            creatorId={creatorId}
            creatorName={creatorName}
            onClearCreatorId={clearCreatorId}
            storeId={storeId}
            onStoreChange={setStoreId}
            brokerId={brokerId}
            onBrokerChange={setBrokerId}
            ownerEmployeeId={ownerEmployeeId}
            onOwnerEmployeeChange={setOwnerEmployeeId}
            storeOptions={storeOptions}
            brokerOptions={brokerOptions}
            employeeOptions={employeeOptions}
            filteredCount={filteredLeads.length}
            totalCount={total}
            onResetFilters={resetFilters}
          />

          {listError ? (
            /* 错误态：保留页头/工具栏/统计卡，仅表体区错误卡，可重试（router.refresh） */
            <div className="flex flex-col items-center rounded-cards bg-pure-white px-6 py-14 text-center shadow-steep">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-apricot-wash text-rust">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <p className="mt-4 text-[15px] font-medium text-ink">线索列表没能加载出来</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-graphite">
                数据没有丢失，可以重试，或刷新页面重新建立会话。
              </p>
              <Button
                variant="outline"
                className="mt-4 rounded-full"
                onClick={() => router.refresh()}
              >
                重试
              </Button>
            </div>
          ) : filteredLeads.length === 0 ? (
            /* 空态：区分「无任何线索」与「筛不出来」 */
            <div className="overflow-hidden rounded-cards bg-pure-white shadow-steep">
              <EmptyState
                className="py-14"
                icon={
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-fog text-graphite">
                    <Inbox className="h-5 w-5" />
                  </div>
                }
                title={total > 0 ? "这个筛选下没有线索" : "还没有任何线索"}
                description={
                  total > 0
                    ? "调整或清除筛选后可以看到全部线索。"
                    : "录入第一条线索后，跟进结论与最近跟进会出现在列表里。"
                }
                action={
                  <div className="flex items-center gap-2.5">
                    {total > 0 ? (
                      <Button variant="outline" className="rounded-full" onClick={resetFilters}>
                        清除筛选
                      </Button>
                    ) : null}
                    <Button
                      className="rounded-full bg-ink text-white hover:bg-ink/90"
                      onClick={startAddLead}
                    >
                      <Plus className="h-4 w-4" />
                      录入新线索
                    </Button>
                  </div>
                }
              />
            </div>
          ) : viewMode === "table" ? (
            <>
              <LeadsMobileList leads={sortedLeads} onOpenDetail={(lead) => openDetail(lead.id)} />
              <div className="hidden overflow-hidden rounded-cards bg-pure-white shadow-steep md:block">
                <div className="overflow-x-auto">
                  <LeadsTable
                    leads={sortedLeads}
                    onOpenDetail={openDetail}
                    onDelete={handleDeleteLead}
                  />
                </div>
              </div>
            </>
          ) : (
            <LeadsGrid
              leads={sortedLeads}
              onOpenDetail={openDetail}
              onDelete={handleDeleteLead}
            />
          )}
          <div
            data-testid="leads-pagination-footer"
            className="flex min-h-[54px] items-center justify-between gap-4 rounded-cards bg-pure-white px-6 py-3 shadow-steep-sm"
          >
            <span className="text-[10.5px] text-graphite">
              本页 <b className="font-[480] text-ink">{filteredLeads.length}</b> 条 · 共{" "}
              <b className="font-[480] text-ink">{total}</b> 条
              {hasFilters ? "（已筛选）" : ""}
            </span>
            <LeadsPagination total={total} />
          </div>
        </section>

        <LeadDrawer
          lead={selectedLead}
          isOpen={isDrawerOpen}
          onClose={closeDetail}
          onAudit={handleAudit}
          onAddFollowUp={handleAddFollowUp}
          onImagesUpdate={handleImagesUpdate}
          onEdit={handleEditLead}
        />

        <AddLeadModal
          isOpen={isAddModalOpen}
          onClose={closeAddModal}
          onAdd={handleAddLead}
          lead={editingLead}
        />
      </PageContainer>
    </div>
  );
}
