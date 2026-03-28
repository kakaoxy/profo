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
import { handleError, handleSuccess } from "../lib/error-handling";
import {
  PAGE_TITLE,
  PAGE_SUBTITLE,
  BUTTON_TEXT,
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
  CONFIRM_DIALOG,
  LOADING_TEXT,
} from "../constants/ui-labels";
import { Button } from "@/components/ui/button";
import { LeadsFilter } from "./leads-filter";
import { LeadsTable } from "./leads-table";
import { LeadsGrid } from "./leads-grid";
import { Plus, RefreshCw, Loader2 } from "lucide-react";

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

  useEffect(() => {
    if (initialSelectedLeadId) {
      router.replace("/leads", { scroll: false });
    }
  }, [initialSelectedLeadId, router]);

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
    <div className="flex-1 space-y-4 p-4 sm:p-8 pt-6 container max-w-[1600px] mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-black tracking-tight font-sans">
            {PAGE_TITLE}
          </h2>
          <p className="text-muted-foreground">
            {PAGE_SUBTITLE}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={resetFilters}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {BUTTON_TEXT.RESET_FILTERS}
          </Button>
          <Button
            size="sm"
            className="bg-primary shadow-md"
            onClick={startAddLead}
          >
            <Plus className="mr-2 h-4 w-4" /> {BUTTON_TEXT.ADD_LEAD}
          </Button>
        </div>
      </div>

      <LeadsFilter
        filters={filters}
        setFilters={setFilters}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      {isPending && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">{LOADING_TEXT.LOADING}</span>
        </div>
      )}

      {viewMode === "table" ? (
        <LeadsTable
          leads={filteredLeads}
          onOpenDetail={openDetail}
          onEdit={startEditLead}
          onDelete={handleDeleteLead}
        />
      ) : (
        <LeadsGrid
          leads={filteredLeads}
          onOpenDetail={openDetail}
          onEdit={startEditLead}
          onDelete={handleDeleteLead}
        />
      )}

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
  );
}
