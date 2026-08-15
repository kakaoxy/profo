"use client";

import React, { useEffect } from "react";
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
import { handleError, handleSuccess } from "@/lib/error-handling";
import { SUCCESS_MESSAGES, ERROR_MESSAGES, CONFIRM_DIALOG } from "../constants/ui-labels";
import { LeadsStats, type LeadStats } from "./leads-stats";
import { LeadsTable } from "./leads-table";
import { LeadsGrid } from "./leads-grid";
import { LeadsToolbar } from "./leads-toolbar";
import { LeadsPagination } from "./leads-pagination";
import { ListView } from "@/components/common";

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
  initialSelectedLeadId?: string;
  creatorId?: string;
  creatorName?: string;
}

export function LeadsView({
  initialLeads,
  total,
  stats,
  initialSelectedLeadId,
  creatorId,
  creatorName,
}: LeadsViewProps) {
  const router = useRouter();
  const {
    leads,
    filteredLeads,
    refreshLeads,
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
    startEditLead,
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

  const handleAddFollowUp = async (id: string, method: FollowUpMethod, content: string) => {
    const result = await addFollowUpAction(id, method, content);
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
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-400 mx-auto flex flex-col gap-8 py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">线索管理</h1>
          <p className="text-sm text-muted-foreground">
            管理和跟进房源线索，从初筛到签约的全流程追踪。
          </p>
        </div>

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
          />

          {viewMode === "table" ? (
            <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <LeadsTable
                  leads={filteredLeads}
                  onOpenDetail={openDetail}
                  onEdit={startEditLead}
                  onDelete={handleDeleteLead}
                />
              </div>
            </div>
          ) : (
            <LeadsGrid
              leads={filteredLeads}
              onOpenDetail={openDetail}
              onEdit={startEditLead}
              onDelete={handleDeleteLead}
            />
          )}
        </ListView>

        <div className="relative z-50 bg-card">
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
      </div>
    </div>
  );
}
