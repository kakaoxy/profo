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
import { LeadsStats } from "./leads-stats";
import { LeadsTable } from "./leads-table";
import { LeadsGrid } from "./leads-grid";
import { LeadsToolbar } from "./leads-toolbar";
import { Loader2 } from "lucide-react";

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

export function LeadsView({
  initialLeads,
  initialSelectedLeadId,
}: LeadsViewProps) {
  const router = useRouter();
  const {
    leads,
    setLeads,
    filteredLeads,
    isPending,
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

  const displayLeads = useMemo(() => {
    return filteredLeads.filter((lead) => {
      const statusMatch = activeTab === "all" || lead.status === activeTab;
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
    const result = await updateLeadAction(id, { status, evalPrice, auditReason: reason });
    if (result.success) {
      setLeads((prev) => prev.map((l) => (l.id === id ? result.data : l)));
      closeDetail();
      handleSuccess(SUCCESS_MESSAGES.AUDIT_COMPLETED);
    } else {
      handleError(result.error, "handleAudit", { fallbackMessage: ERROR_MESSAGES.AUDIT_FAILED });
    }
  };

  const handleAddFollowUp = async (id: string, method: FollowUpMethod, content: string) => {
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
        setLeads((prev) => prev.map((l) => (l.id === editingLead.id ? result.data : l)));
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
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">线索管理</h1>
          <p className="text-sm text-slate-500">管理和跟进房源线索，从初筛到签约的全流程追踪。</p>
        </div>

        <LeadsStats leads={leads} />

        <div className="space-y-4">
          <LeadsToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onAddLead={startAddLead}
          />

          {isPending && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <span className="ml-2 text-sm text-slate-500">{LOADING_TEXT.LOADING}</span>
            </div>
          )}

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
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>显示 {displayLeads.length} 条记录 (共 {leads.length} 条)</span>
              </div>
            </>
          )}
        </div>

        <LeadDrawer
          lead={selectedLead}
          isOpen={isDrawerOpen}
          onClose={closeDetail}
          onAudit={handleAudit}
          onAddFollowUp={handleAddFollowUp}
          onViewMonitor={openMonitor}
        />

        {monitoringLead && (
          <MonitoringDashboard lead={monitoringLead} onClose={closeMonitor} />
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
