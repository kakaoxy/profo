"use client";

import React, { useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Lead, LeadStatus, FollowUpConclusion, FollowUpMethod } from "../types";
import {
  updateLeadAction,
  addFollowUpAction,
  deleteLeadAction,
  createLeadAction,
} from "../actions";
import { useLeadsFilter, useLeadSelection, useViewMode } from "../hooks";
import { handleError, handleSuccess } from "@/lib/error-handling";
import { SUCCESS_MESSAGES, ERROR_MESSAGES, CONFIRM_DIALOG } from "../constants/ui-labels";
import { LeadsStats, type LeadStats } from "./leads-stats";
import { LeadsTable } from "./leads-table";
import { LeadsGrid } from "./leads-grid";
import { LeadsToolbar } from "./leads-toolbar";
import { LeadsPagination } from "./leads-pagination";
import { ListView } from "@/components/common";
import { EmptyState } from "@/components/common";
import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Inbox, Plus } from "lucide-react";

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
}

export function LeadsView({
  initialLeads,
  total,
  stats,
  listError = false,
  initialSelectedLeadId,
  creatorId,
  creatorName,
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
  } = useLeadsFilter(initialLeads);

  const {
    selectedLead,
    isDrawerOpen,
    editingLead,
    isAddModalOpen,
    openDetail,
    closeDetail,
    startAddLead,
    closeAddModal,
  } = useLeadSelection({ initialSelectedLeadId, leads });

  const { viewMode, setViewMode } = useViewMode("table");

  useEffect(() => {
    if (initialSelectedLeadId) {
      router.replace("/admin/leads", { scroll: false });
    }
  }, [initialSelectedLeadId, router]);

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
    } else {
      handleError(result.error, "handleAudit", { fallbackMessage: ERROR_MESSAGES.AUDIT_FAILED });
    }
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
    if (!window.confirm(CONFIRM_DIALOG.DELETE_TITLE + CONFIRM_DIALOG.DELETE_DESCRIPTION)) return;
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

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-8">
        <PageHeader title="线索中心" description="初筛评估 → 上门实勘 → 商务谈判 → 签约收房。" />

        <LeadsStats stats={stats} />

        <ListView totalCount={total} filteredCount={filteredLeads.length}>
          <LeadsToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onAddLead={startAddLead}
            creatorId={creatorId}
            creatorName={creatorName}
            onClearCreatorId={clearCreatorId}
            stats={stats}
            total={total}
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
            /* 空态：区分「无任何线索」与「筛不出来」（设计稿 04 节） */
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
            <div className="bg-pure-white rounded-cards shadow-steep overflow-hidden">
              <div className="overflow-x-auto">
                <LeadsTable
                  leads={filteredLeads}
                  onOpenDetail={openDetail}
                  onDelete={handleDeleteLead}
                />
              </div>
            </div>
          ) : (
            <LeadsGrid
              leads={filteredLeads}
              onOpenDetail={openDetail}
              onDelete={handleDeleteLead}
            />
          )}
        </ListView>

        <div className="relative z-50">
          <LeadsPagination total={total} />
        </div>

        <LeadDrawer
          lead={selectedLead}
          isOpen={isDrawerOpen}
          onClose={closeDetail}
          onAudit={handleAudit}
          onAddFollowUp={handleAddFollowUp}
          onImagesUpdate={handleImagesUpdate}
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
