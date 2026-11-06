"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { PageContainer } from "../../_components/page-container";
import { PageHeader } from "../../_components/page-header";
import { SteepButton } from "@/components/custom/steep-controls";
import { merchantApi } from "../_components/merchant-api";
import type { components } from "@/lib/api-types";
import { CompanyDeleteDialog } from "./_components/company-delete-dialog";
import { CompanyDrawer } from "./_components/company-drawer";
import { CompanyFilters } from "./_components/company-filters";
import { CompanyList } from "./_components/company-list";
import { CompanyPagination } from "./_components/company-pagination";

type Company = components["schemas"]["MerchantCompanyResponse"];
type CompanyListResponse = components["schemas"]["MerchantCompanyListResponse"];

const PAGE_SIZE = 20;

export default function MerchantCompaniesPage() {
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [includeDisabled, setIncludeDisabled] = useState("all");
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"view" | "edit" | "create">("view");
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  // 请求序号：只有最后一次请求的结果才允许落地，避免「默认列表」与「搜索结果」乱序覆盖
  const requestSeq = useRef(0);

  const load = useCallback(
    async (targetPage: number, term: string) => {
      const seq = requestSeq.current + 1;
      requestSeq.current = seq;
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({
          page: String(targetPage),
          page_size: String(PAGE_SIZE),
        });
        if (term) query.set("keyword", term);
        if (includeDisabled === "all") query.set("include_disabled", "true");
        const result = await merchantApi<CompanyListResponse>(
          `/admin/merchant/companies?${query.toString()}`,
        );
        if (seq !== requestSeq.current) return;
        setCompanies(result.items);
        setTotal(result.total);
        setPage(result.page ?? targetPage);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : "公司列表加载失败");
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [includeDisabled],
  );

  useEffect(() => {
    void load(1, appliedKeyword);
  }, [load, appliedKeyword]);

  const search = () => {
    const term = keyword.trim();
    if (term === appliedKeyword) {
      void load(1, term);
      return;
    }
    setAppliedKeyword(term);
  };

  const clearFilters = () => {
    setKeyword("");
    setIncludeDisabled("all");
    setAppliedKeyword("");
  };

  const openDetail = (company: Company) => {
    setEditingCompany(company);
    setSheetMode("view");
    setFormOpen(true);
  };

  const startCreate = () => {
    setEditingCompany(null);
    setSheetMode("create");
    setFormOpen(true);
  };

  const startEdit = (company: Company) => {
    setEditingCompany(company);
    setSheetMode("edit");
    setFormOpen(true);
  };

  const handleSaved = () => {
    const targetPage = editingCompany ? page : 1;
    // 编辑保存后留在详情抽屉，新建保存后关闭
    if (!editingCompany) {
      setFormOpen(false);
      setEditingCompany(null);
    }
    void load(targetPage, appliedKeyword);
  };

  const handleDeleted = () => {
    const maxPage = Math.max(1, Math.ceil((total - 1) / PAGE_SIZE));
    setDeleteTarget(null);
    void load(Math.min(page, maxPage), appliedKeyword);
  };

  const filterHasInput = Boolean(
    keyword.trim() || appliedKeyword || includeDisabled !== "all",
  );
  const hasActiveFilters = Boolean(appliedKeyword || includeDisabled !== "all");

  return (
    <div className="min-h-screen bg-fog" data-page="merchant-companies">
      <PageContainer className="flex flex-col gap-8">
        <PageHeader
          title="公司列表"
          description="维护商户公司主数据，停用后不可再被新建门店选择"
          actions={
            <SteepButton variant="primary" onClick={startCreate}>
              <Plus />
              新建公司
            </SteepButton>
          }
        />

        <div className="flex flex-col gap-8">
          <CompanyFilters
            keyword={keyword}
            includeDisabled={includeDisabled}
            onKeywordChange={setKeyword}
            onIncludeDisabledChange={setIncludeDisabled}
            onApply={search}
            onClear={clearFilters}
            loading={loading}
            hasActiveFilters={filterHasInput}
          />

          <CompanyList
            companies={companies}
            loading={loading}
            error={error}
            hasActiveFilters={hasActiveFilters}
            onRetry={() => void load(1, appliedKeyword)}
            onClear={clearFilters}
            onCreate={startCreate}
            onOpen={openDetail}
            onEdit={startEdit}
            onDelete={setDeleteTarget}
          />

          <CompanyPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={(next) => void load(next, appliedKeyword)}
          />
        </div>
      </PageContainer>

      <CompanyDrawer
        open={formOpen}
        company={editingCompany}
        mode={sheetMode}
        onOpenChange={(next) => {
          setFormOpen(next);
          if (!next) {
            setEditingCompany(null);
            setSheetMode("view");
          }
        }}
        onSaved={handleSaved}
      />

      <CompanyDeleteDialog
        company={
          deleteTarget
            ? { id: deleteTarget.id, company_name: deleteTarget.company_name }
            : null
        }
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
