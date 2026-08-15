"use client";

import { useState, useMemo, useCallback } from "react";
import { Lead } from "../types";

interface UseLeadSelectionOptions {
  initialSelectedLeadId?: string;
  leads: Lead[];
}

export function useLeadSelection({ initialSelectedLeadId, leads }: UseLeadSelectionOptions) {
  const shouldOpenDrawerInitially = Boolean(
    initialSelectedLeadId && leads.some((l) => l.id === initialSelectedLeadId),
  );

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(
    shouldOpenDrawerInitially ? initialSelectedLeadId! : null,
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(shouldOpenDrawerInitially);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) || null,
    [leads, selectedLeadId],
  );

  const openDetail = useCallback((id: string) => {
    setSelectedLeadId(id);
    setIsDrawerOpen(true);
  }, []);

  const closeDetail = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  const startAddLead = useCallback(() => {
    setEditingLead(null);
    setIsAddModalOpen(true);
  }, []);

  const startEditLead = useCallback((lead: Lead) => {
    setEditingLead(lead);
    setIsAddModalOpen(true);
  }, []);

  const closeAddModal = useCallback(() => {
    setIsAddModalOpen(false);
  }, []);

  return {
    selectedLeadId,
    selectedLead,
    isDrawerOpen,
    editingLead,
    isAddModalOpen,
    openDetail,
    closeDetail,
    startAddLead,
    startEditLead,
    closeAddModal,
  };
}
