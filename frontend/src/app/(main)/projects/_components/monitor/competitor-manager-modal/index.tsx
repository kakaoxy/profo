"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompetitors } from "./use-competitors";
import { useCommunitySearch } from "./use-community-search";
import { SearchSection } from "./search-section";
import { CompetitorList } from "./competitor-list";

interface CompetitorManagerModalProps {
  projectId?: string;
  communityName?: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export function CompetitorManagerModal({
  projectId,
  communityName,
  isOpen,
  onClose,
  onUpdate,
}: CompetitorManagerModalProps) {
  const [isAdding, setIsAdding] = useState(false);

  const {
    competitors,
    communityId,
    loading,
    deletingId,
    refresh,
    addCompetitor,
    removeCompetitor,
  } = useCompetitors({
    projectId,
    communityName,
    isOpen,
  });

  const {
    searchQuery,
    searchResults,
    isSearching,
    setSearchQuery,
  } = useCommunitySearch({
    existingIds: competitors.map((c) => c.community_id),
    currentCommunityId: communityId,
  });

  const handleAdd = async (competitorId: string) => {
    setIsAdding(true);
    await addCompetitor(competitorId);
    setSearchQuery("");
    setIsAdding(false);
  };

  const handleRemove = async (competitorId: string) => {
    await removeCompetitor(competitorId);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h3 className="font-bold text-slate-800">管理竞品小区</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          <SearchSection
            searchQuery={searchQuery}
            searchResults={searchResults}
            isSearching={isSearching}
            isAdding={isAdding}
            onSearchChange={setSearchQuery}
            onAdd={handleAdd}
          />

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2">
              当前竞品列表 ({competitors.length})
            </label>
            <CompetitorList
              competitors={competitors}
              loading={loading}
              deletingId={deletingId}
              onRemove={handleRemove}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50">
          <Button onClick={onClose} variant="outline" className="w-full">
            完成
          </Button>
        </div>
      </div>
    </div>
  );
}
