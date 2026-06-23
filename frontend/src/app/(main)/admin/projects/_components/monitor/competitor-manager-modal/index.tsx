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
  communityId?: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export function CompetitorManagerModal({
  projectId,
  communityId: initialCommunityId,
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
    addCompetitor,
    removeCompetitor,
  } = useCompetitors({
    projectId,
    communityId: initialCommunityId,
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
    onUpdate();
  };

  const handleRemove = async (competitorId: string) => {
    await removeCompetitor(competitorId);
    onUpdate();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-card/40 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-border">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted">
          <h3 className="font-bold text-foreground">管理竞品小区</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded-full transition-colors"
          >
            <X size={18} className="text-muted-foreground" />
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
            <label className="block text-xs font-bold text-muted-foreground mb-2">
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
        <div className="px-6 py-4 border-t border-border bg-muted">
          <Button onClick={onClose} variant="outline" className="w-full">
            完成
          </Button>
        </div>
      </div>
    </div>
  );
}
