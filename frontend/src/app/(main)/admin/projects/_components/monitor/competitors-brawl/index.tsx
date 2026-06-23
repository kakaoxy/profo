"use client";

import { useState, useEffect } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/common/pagination";
import { SectionHeader } from "../section-header";
import { FilterBar } from "./filter-bar";
import { CompetitorsTable } from "./competitors-table";
import { CompetitorsCard } from "./competitors-card";
import { useCompetitors } from "./use-competitors";

interface CompetitorsBrawlProps {
  projectId?: string;
  communityId?: string;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
}

export function CompetitorsBrawl({
  projectId,
  communityId,
}: CompetitorsBrawlProps) {
  const isMobile = useIsMobile();
  const {
    counts,
    displayItems,
    total,
    totalPages,
    initLoading,
    pageLoading,
    error,
    statusFilters,
    layoutFilters,
    searchQuery,
    sortConfig,
    page,
    pageSize,
    toggleStatus,
    toggleLayout,
    setSearch,
    handleSort,
    setPage,
    setPageSize,
  } = useCompetitors({ projectId, communityId });

  // 初始化加载 或 首次分页加载（无旧数据可展示）时显示完整加载动画
  const showSpinner = initLoading || (pageLoading && displayItems.length === 0);

  return (
    <section className="mt-8 pb-10">
      <SectionHeader
        index="4"
        title="竞品肉搏战 (明细对比)"
        subtitle="Direct Competitors Brawl"
      />

      <div className="px-6 space-y-4">
        <FilterBar
          statusFilters={statusFilters}
          layoutFilters={layoutFilters}
          searchQuery={searchQuery}
          counts={counts}
          onToggleStatus={toggleStatus}
          onToggleLayout={toggleLayout}
          onSearchChange={setSearch}
        />

        <Card className="border-border shadow-sm bg-card min-h-[300px]">
          {showSpinner ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-40 text-error">
              <AlertCircle className="h-6 w-6 mb-2" />
              <span className="text-sm">{error}</span>
            </div>
          ) : displayItems.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              暂无数据
            </div>
          ) : (
            <>
              <div
                className={`overflow-x-auto transition-opacity ${pageLoading ? "opacity-50" : ""}`}
              >
                {isMobile ? (
                  <CompetitorsCard items={displayItems} />
                ) : (
                  <CompetitorsTable
                    items={displayItems}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                  />
                )}
              </div>
              {total > 0 && (
                <Pagination
                  mode="controlled"
                  currentPage={page}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={total}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  showPageSizeSelector
                  showFirstLastButtons
                  className="border-t border-border"
                />
              )}
            </>
          )}
        </Card>
      </div>
    </section>
  );
}
