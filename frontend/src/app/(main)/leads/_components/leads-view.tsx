"use client";

import React, { useState, useMemo, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { Lead, LeadStatus, FilterState, FollowUpMethod } from '../types';
import { getLeadsAction, updateLeadAction, addFollowUpAction, deleteLeadAction, createLeadAction } from '../actions';
import { Button } from '@/components/ui/button';
import { LeadsFilter } from './leads-filter';
import { LeadsTable } from './leads-table';
import { LeadsGrid } from './leads-grid';
import { Plus, RefreshCw, Loader2 } from 'lucide-react';

// [性能优化] 延迟加载条件渲染的重型组件
// 这些组件只有在用户交互时才需要
const LeadDrawer = dynamic(
  () => import('./lead-drawer').then(mod => mod.LeadDrawer),
  { ssr: false }
);

const AddLeadModal = dynamic(
  () => import('./add-lead-modal').then(mod => mod.AddLeadModal),
  { ssr: false }
);

const MonitoringDashboard = dynamic(
  () => import('./monitoring-dashboard').then(mod => mod.MonitoringDashboard),
  { ssr: false }
);

interface LeadsViewProps {
  initialLeads: Lead[];
}

export function LeadsView({ initialLeads }: LeadsViewProps) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    statuses: [],
    district: '',
    creator: '',
    layouts: [],
    floors: []
  });
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [monitoringLead, setMonitoringLead] = useState<Lead | null>(null);
  const [isPending, startTransition] = useTransition();

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

  // Custom setFilters that also triggers server refetch for server-side filters
  const handleSetFilters: React.Dispatch<React.SetStateAction<FilterState>> = (action) => {
    setFilters(prevFilters => {
      const newFilters = typeof action === 'function' ? action(prevFilters) : action;
      
      // Only refetch if server-side filters changed (search, statuses, district)
      const serverFiltersChanged = 
        newFilters.search !== prevFilters.search ||
        JSON.stringify(newFilters.statuses) !== JSON.stringify(prevFilters.statuses) ||
        newFilters.district !== prevFilters.district;
      
      if (serverFiltersChanged) {
        // Schedule refetch after state update
        setTimeout(() => {
          startTransition(async () => {
            const data = await getLeadsAction(newFilters);
            setLeads(data);
          });
        }, 300); // Debounce for text input
      }
      
      return newFilters;
    });
  };

  // Client-side filtering for layout, floor, creator
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
      const updatedLead = await updateLeadAction(id, { status, evalPrice, auditReason: reason });
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
      if (editingLead) {
        // Edit Mode
        const updatedLead = await updateLeadAction(editingLead.id, newLeadData);
        setLeads(prev => prev.map(l => l.id === editingLead.id ? updatedLead : l));
      } else {
        // Create Mode - actually create the lead
        await createLeadAction(newLeadData);
        // Refetch to get the latest list
        const updatedLeads = await getLeadsAction(filters);
        setLeads(updatedLeads);
      }
    } catch (e) {
      console.error("Failed to add/update lead", e);
    }
  };

  const handleEditLead = (lead: Lead) => {
    setEditingLead(lead);
    setIsAddModalOpen(true);
  };

  const handleDeleteLead = async (id: string) => {
    if (!window.confirm("确定要删除这条线索吗？此操作无法撤销。")) return;
    try {
      await deleteLeadAction(id);
      const updatedLeads = await getLeadsAction(filters);
      setLeads(updatedLeads);
    } catch (e) {
      console.error("Failed to delete lead", e);
      alert("删除失败，请稍后重试");
    }
  };



  const handleResetFilters = () => {
    const resetFilters: FilterState = {
      search: '',
      statuses: [],
      district: '',
      creator: '',
      layouts: [],
      floors: []
    };
    setFilters(resetFilters);
    startTransition(async () => {
      const data = await getLeadsAction(resetFilters);
      setLeads(data);
    });
  };

  return (
    <div className="flex-1 space-y-4 p-4 sm:p-8 pt-6 container max-w-[1600px] mx-auto">
      {/* Page Heading */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-black tracking-tight font-sans">线索中心</h2>
          <p className="text-muted-foreground">实时管理与评估房产线索流转状态</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleResetFilters} disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            重置筛选
          </Button>
          <Button size="sm" className="bg-primary shadow-md" onClick={() => { setEditingLead(null); setIsAddModalOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> 录入新线索
          </Button>
        </div>
      </div>

      {/* Filters */}
      <LeadsFilter 
        filters={filters} 
        setFilters={handleSetFilters} 
        viewMode={viewMode} 
        setViewMode={setViewMode} 
      />

      {/* Loading indicator */}
      {isPending && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
        </div>
      )}

      {/* List/Grid View */}
      {viewMode === 'table' ? (
        <LeadsTable 
          leads={filteredLeads} 
          onOpenDetail={handleOpenDetail}
          onEdit={handleEditLead}
          onDelete={handleDeleteLead}
        />
      ) : (
        <LeadsGrid 
          leads={filteredLeads} 
          onOpenDetail={handleOpenDetail}
          onEdit={handleEditLead}
          onDelete={handleDeleteLead}
        />
      )}

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
      
      <AddLeadModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onAdd={handleAddLead} 
        lead={editingLead}
      />
    </div>
  );
}
