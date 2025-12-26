"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Lead, LeadStatus, FilterState, FollowUpMethod } from './types';
import { createLeadAction, getLeadsAction, updateLeadAction, addFollowUpAction } from './actions';
import { Button } from '@/components/ui/button';
import { LeadDrawer } from './_components/lead-drawer';
import { AddLeadModal } from './_components/add-lead-modal';
import { MonitoringDashboard } from './_components/monitoring-dashboard';
import { LeadsFilter } from './_components/leads-filter';
import { LeadsTable } from './_components/leads-table';
import { LeadsGrid } from './_components/leads-grid';
import { Plus, RefreshCw } from 'lucide-react';

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    statuses: [],
    district: '',
    creator: '',
    layouts: [],
    floors: []
  });
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [monitoringLead, setMonitoringLead] = useState<Lead | null>(null);

  // Helpers
  const getFloorCategory = (floorInfo: string): string => {
    try {
      const match = floorInfo.match(/(\d+)\/(\d+)层/);
      if (!match) return '未知';
      const current = parseInt(match[1]);
      const total = parseInt(match[2]);
      const ratio = current / total;
      if (ratio <= 0.33) return '低';
      if (ratio <= 0.66) return '中';
      return '高';
    } catch { return '未知'; }
  };

  const getLayoutRooms = (layout: string): string => {
    const match = layout.match(/(\d+)室/);
    if (!match) return '其他';
    const rooms = parseInt(match[1]);
    return rooms >= 5 ? '4+' : rooms.toString();
  };

  // Fetch data on mount and when filters change (debouncing could be added)
  useEffect(() => {
    const fetchData = async () => {
        const data = await getLeadsAction(filters);
        setLeads(data);
    };
    const timer = setTimeout(fetchData, 300);
    return () => clearTimeout(timer);
  }, [filters]);

  const filteredLeads = useMemo(() => {
     return leads.filter(lead => {
      const matchCreator = !filters.creator || lead.creatorName.toLowerCase().includes(filters.creator.toLowerCase());
      const matchLayout = filters.layouts.length === 0 || filters.layouts.includes(getLayoutRooms(lead.layout));
      const matchFloor = filters.floors.length === 0 || filters.floors.includes(getFloorCategory(lead.floorInfo));
      return matchCreator && matchLayout && matchFloor;
    });
  }, [leads, filters]);

  const selectedLead = useMemo(() => leads.find(l => l.id === selectedLeadId) || null, [leads, selectedLeadId]);

  const handleOpenDetail = (id: string) => {
    setSelectedLeadId(id);
    setIsDrawerOpen(true);
  };

  const handleAudit = async (id: string, status: LeadStatus, evalPrice?: number, reason?: string) => {
    try {
        const updatedLead = await updateLeadAction(id, { status, evalPrice, reason });
        setLeads(prev => prev.map(l => l.id === id ? updatedLead : l));
        setIsDrawerOpen(false);
    } catch (e) {
        console.error("Failed to audit lead", e);
    }
  };

  const handleAddFollowUp = async (id: string, method: FollowUpMethod, content: string) => {
    try {
        await addFollowUpAction(id, method, content);
        const updatedLeads = await getLeadsAction(filters);
        setLeads(updatedLeads);
    } catch (e) {
        console.error("Failed to add follow up", e);
    }
  };

  const handleAddLead = async (newLeadData: Omit<Lead, 'id' | 'createdAt'>) => {
    try {
        const newLead = await createLeadAction(newLeadData);
        setLeads(prev => [newLead as Lead, ...prev]);
    } catch (e) {
        console.error("Failed to add lead", e);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-50/50">
      <div className="flex-1 space-y-4 p-4 sm:p-8 pt-6 container max-w-[1600px] mx-auto">
        {/* Page Heading */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-3xl font-black tracking-tight font-sans">线索中心</h2>
            <p className="text-muted-foreground">实时管理与评估房产线索流转状态</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setFilters({search: '', statuses: [], district: '', creator: '', layouts: [], floors: []})}>
              <RefreshCw className="mr-2 h-4 w-4" /> 重置筛选
            </Button>
            <Button size="sm" className="bg-primary shadow-md" onClick={() => setIsAddModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> 录入新线索
            </Button>
          </div>
        </div>

        {/* Filters */}
        <LeadsFilter 
            filters={filters} 
            setFilters={setFilters} 
            viewMode={viewMode} 
            setViewMode={setViewMode} 
        />

        {/* List/Grid View */}
        {viewMode === 'table' ? (
            <LeadsTable leads={filteredLeads} onOpenDetail={handleOpenDetail} />
        ) : (
            <LeadsGrid leads={filteredLeads} onOpenDetail={handleOpenDetail} />
        )}
      </div>

      {/* Overlays */}
      <LeadDrawer 
        lead={selectedLead} isOpen={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)}
        onAudit={handleAudit} 
        onAddFollowUp={handleAddFollowUp}
        onViewMonitor={(l) => {
          setMonitoringLead(l);
          setIsDrawerOpen(false);
        }}
      />
      
      {monitoringLead && (
        <MonitoringDashboard 
          lead={monitoringLead} 
          onClose={() => setMonitoringLead(null)} 
        />
      )}
      
      <AddLeadModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onAdd={handleAddLead} />
    </div>
  );
}
