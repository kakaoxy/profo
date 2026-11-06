"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Download, Plus } from "lucide-react";

import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import { SteepButton } from "@/components/custom/steep-controls";
import type { components } from "@/lib/api-types";
import { merchantApi, queryString } from "../_components/merchant-api";
import { StoreDeleteDialog } from "./_components/store-delete-dialog";
import { StoreDrawer } from "./_components/store-drawer";
import {
  EMPTY_STORE_FILTERS,
  StoreFilters,
  type StoreFilterValues,
} from "./_components/store-filters";
import { StoreList } from "./_components/store-list";
import { StorePagination } from "./_components/store-pagination";

type StoreListResponse = components["schemas"]["MerchantStoreListResponse"];
type StoreItem = components["schemas"]["MerchantStoreListItem"];

function buildFilterQuery(filters: StoreFilterValues) {
  return {
    keyword: filters.keyword.trim() || undefined,
    status: filters.status === "all" ? undefined : filters.status,
    review_status: filters.reviewStatus === "all" ? undefined : filters.reviewStatus,
    district: filters.district.trim() || undefined,
    business_circle: filters.businessCircle.trim() || undefined,
    owner_employee_id: filters.ownerId === "all" ? undefined : filters.ownerId,
    source: filters.source === "all" ? undefined : filters.source,
    broker_count_min: filters.brokerCountMin.trim() || undefined,
    broker_count_max: filters.brokerCountMax.trim() || undefined,
    created_from: filters.createdFrom || undefined,
    created_to: filters.createdTo || undefined,
  };
}

function hasActiveFilters(filters: StoreFilterValues) {
  return Boolean(
    filters.keyword.trim() ||
      filters.status !== "all" ||
      filters.reviewStatus !== "all" ||
      filters.district.trim() ||
      filters.businessCircle.trim() ||
      filters.source !== "all" ||
      filters.brokerCountMin ||
      filters.brokerCountMax ||
      filters.createdFrom ||
      filters.createdTo ||
      filters.ownerId !== "all",
  );
}

export default function MerchantStoresPage() {
  const [data, setData] = useState<StoreListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<StoreFilterValues>({ ...EMPTY_STORE_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState<StoreFilterValues>({
    ...EMPTY_STORE_FILTERS,
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [employees, setEmployees] = useState<components["schemas"]["UserSimpleResponse"][]>([]);
  const [page, setPage] = useState(1);
  const [drawerStoreId, setDrawerStoreId] = useState<string | null>(null);
  const [drawerSummary, setDrawerSummary] = useState<StoreItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StoreItem | null>(null);

  const fetchPage = useCallback(async (nextPage: number, nextFilters: StoreFilterValues) => {
    setLoading(true);
    setError("");
    try {
      const result = await merchantApi<StoreListResponse>(
        `/admin/merchant/stores${queryString({
          page: nextPage,
          page_size: 20,
          ...buildFilterQuery(nextFilters),
        })}`,
      );
      setData(result);
      setPage(nextPage);
      setAppliedFilters(nextFilters);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPage(1, EMPTY_STORE_FILTERS);
  }, [fetchPage]);

  useEffect(() => {
    merchantApi<components["schemas"]["UserSimpleListResponse"]>("/users/simple?page=1&page_size=200")
      .then((result) => setEmployees(result.items))
      .catch(() => setEmployees([]));
  }, []);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const exportHref = `/api/v1/admin/merchant/stores/export${queryString(buildFilterQuery(appliedFilters))}`;

  const applyFilters = () => {
    setAppliedFilters(filters);
    void fetchPage(1, filters);
  };

  const clearFilters = () => {
    const cleared = { ...EMPTY_STORE_FILTERS };
    setFilters(cleared);
    setAppliedFilters(cleared);
    setAdvancedOpen(false);
    void fetchPage(1, cleared);
  };

  return (
    <div className="min-h-screen bg-fog" data-page="merchant-stores">
      <PageContainer className="flex flex-col gap-6 lg:gap-8">
        <PageHeader
          title="门店列表"
          description="按区域、合作状态、审核状态查看与维护全部门店"
          actions={
            <>
              <SteepButton variant="text" asChild>
                <a href={exportHref}>
                  <Download />
                  导出 CSV
                </a>
              </SteepButton>
              <SteepButton variant="primary" asChild>
                <Link href="/admin/merchant/stores/new">
                  <Plus />
                  新建门店
                </Link>
              </SteepButton>
            </>
          }
        />

        <div className="flex flex-col gap-6 lg:gap-8">
          <StoreFilters
            values={filters}
            onChange={setFilters}
            onApply={applyFilters}
            onClear={clearFilters}
            employees={employees}
            expanded={advancedOpen}
            onExpandedChange={setAdvancedOpen}
            loading={loading}
          />

          <div className="flex flex-col gap-4">
            <StoreList
              data={data}
              loading={loading}
              error={error}
              hasActiveFilters={hasActiveFilters(appliedFilters)}
              onRetry={() => void fetchPage(page, appliedFilters)}
              onClear={clearFilters}
              onOpenStore={(store) => {
                setDrawerSummary(store);
                setDrawerStoreId(store.id);
              }}
              onDeleteStore={setDeleteTarget}
            />
            <StorePagination
              page={page}
              pageSize={data?.page_size ?? 20}
              total={data?.total ?? 0}
              totalPages={totalPages}
              onPageChange={(nextPage) => void fetchPage(nextPage, appliedFilters)}
              loading={loading}
            />
          </div>
        </div>
      </PageContainer>

      <StoreDrawer
        storeId={drawerStoreId}
        summary={drawerSummary}
        open={Boolean(drawerStoreId)}
        onOpenChange={(open) => {
          if (!open) {
            setDrawerStoreId(null);
            setDrawerSummary(null);
          }
        }}
        onSaved={() => void fetchPage(page, appliedFilters)}
      />

      <StoreDeleteDialog
        store={deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onDeleted={() => void fetchPage(1, appliedFilters)}
      />
    </div>
  );
}
