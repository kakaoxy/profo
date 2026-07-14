"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { formatCNY } from "@/lib/formatters";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/common/image-upload";
import type { ImageItem } from "@/components/common/image-upload";
import { RecordDialog } from "@/components/finance/record-dialog";
import { SettlementDialog } from "./settlement-dialog";
import { LedgerDetailTableFilter, type FilterTab } from "./ledger-detail-table-filter";
import { LedgerDetailTableHeader } from "./ledger-detail-table-header";
import { LedgerDetailTableRow } from "./ledger-detail-table-row";
import { deleteRecord, exportProjectLedger, updateRecordAction } from "../../actions";
import type { components } from "@/lib/api-types";

type CashFlowRecordResponse = components["schemas"]["CashFlowRecordResponse"];
type SettlementStatus = components["schemas"]["SettlementStatus"];

interface LedgerDetailTableProps {
  projectId: string;
  data: CashFlowRecordResponse[];
  businessForm?: "agent" | "wholesale" | null;
  settlementStatus?: SettlementStatus | null;
}

export function LedgerDetailTable({
  projectId,
  data,
  businessForm,
  settlementStatus,
}: LedgerDetailTableProps) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<FilterTab>("all");
  const [searchInput, setSearchInput] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all");
  const [counterpartyTypeFilter, setCounterpartyTypeFilter] =
    React.useState<string>("all");
  const [voucherFilter, setVoucherFilter] = React.useState<string>("all");
  const [deleteTarget, setDeleteTarget] =
    React.useState<CashFlowRecordResponse | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [showSettlementDialog, setShowSettlementDialog] =
    React.useState(false);
  const [supplementTarget, setSupplementTarget] =
    React.useState<CashFlowRecordResponse | null>(null);
  const [supplementUrls, setSupplementUrls] = React.useState<string[]>([]);
  const [isSupplementing, setIsSupplementing] = React.useState(false);
  const [supplementUploadKey, setSupplementUploadKey] = React.useState(0);

  const isSettled = settlementStatus === "settled";

  // 交易方搜索 300ms 防抖
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 分类选项来自 data 去重
  const categoryOptions = React.useMemo(() => {
    const set = new Set<string>();
    data.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set);
  }, [data]);

  const filteredData = React.useMemo(() => {
    const keyword = debouncedSearch.trim().toLowerCase();
    return data.filter((item) => {
      // 1. Tabs（all/income/expense）
      if (filter !== "all" && item.type !== filter) return false;
      // 2. 交易方模糊搜索（大小写不敏感）
      if (keyword) {
        const cp = (item.counterparty ?? "").toLowerCase();
        if (!cp.includes(keyword)) return false;
      }
      // 3. 分类精确匹配
      if (categoryFilter !== "all" && item.category !== categoryFilter)
        return false;
      // 4. 支付方类型筛选
      if (
        counterpartyTypeFilter !== "all" &&
        (item as { counterparty_type?: string }).counterparty_type !== counterpartyTypeFilter
      )
        return false;
      // 5. 凭证状态筛选
      const hasVoucher = !!(item.receipt_urls && item.receipt_urls.length > 0);
      if (voucherFilter === "with" && !hasVoucher) return false;
      if (voucherFilter === "without" && hasVoucher) return false;
      return true;
    });
  }, [data, filter, debouncedSearch, categoryFilter, counterpartyTypeFilter, voucherFilter]);

  // 筛选汇总：笔数与代数和（收入为正、支出为负）
  const summary = React.useMemo(() => {
    const total = filteredData.reduce((sum, item) => {
      const amt = Number(item.amount) || 0;
      return sum + (item.type === "income" ? amt : -amt);
    }, 0);
    return { count: filteredData.length, total };
  }, [filteredData]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await deleteRecord(deleteTarget.id, projectId);
      if (res.success) {
        toast.success("已删除");
        setDeleteTarget(null);
      } else {
        toast.error(res.message || "删除失败");
      }
    } catch {
      toast.error("删除失败，请稍后重试");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await exportProjectLedger(projectId);
      if (!res.success) {
        toast.error(res.message || "导出失败");
        return;
      }
      const blob = new Blob([res.data], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      a.download = `资金账本_${projectId.slice(0, 8)}_${today}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("导出成功");
    } catch {
      toast.error("导出失败，请稍后重试");
    } finally {
      setIsExporting(false);
    }
  };

  const openSupplementDialog = (record: CashFlowRecordResponse) => {
    setSupplementTarget(record);
    setSupplementUrls([]);
    setSupplementUploadKey((k) => k + 1);
  };

  const handleSupplementChange = React.useCallback((items: ImageItem[]) => {
    const urls = items
      .filter((i) => i.status === "success" && i.url)
      .map((i) => i.url as string);
    setSupplementUrls(urls);
  }, []);

  const handleSupplementConfirm = async () => {
    if (!supplementTarget) return;
    if (supplementUrls.length === 0) {
      toast.error("请至少上传一张凭证图片");
      return;
    }
    setIsSupplementing(true);
    try {
      const res = await updateRecordAction(supplementTarget.id, {
        receipt_urls: supplementUrls,
      });
      if (res.success) {
        toast.success("凭证已补充");
        setSupplementTarget(null);
        router.refresh();
      } else {
        toast.error(res.message || "补充凭证失败");
      }
    } catch {
      toast.error("补充凭证失败，请稍后重试");
    } finally {
      setIsSupplementing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tabs 筛选 + 搜索 + 分类筛选 + 操作按钮 */}
      <LedgerDetailTableFilter
        filter={filter}
        onFilterChange={setFilter}
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        categoryOptions={categoryOptions}
        counterpartyTypeFilter={counterpartyTypeFilter}
        onCounterpartyTypeFilterChange={setCounterpartyTypeFilter}
        voucherFilter={voucherFilter}
        onVoucherFilterChange={setVoucherFilter}
        isExporting={isExporting}
        onExport={handleExport}
        isSettled={isSettled}
        settlementStatus={settlementStatus}
        onAddRecord={() => setIsDialogOpen(true)}
        onSettlement={() => setShowSettlementDialog(true)}
      />

      {/* 筛选汇总条 */}
      <div
        className="bg-muted/30 rounded-lg px-3 py-2 text-xs text-muted-foreground tabular-nums"
        aria-live="polite"
      >
        共 {summary.count} 笔 · 合计 {formatCNY(summary.total)}
      </div>

      {/* 已结算编辑锁警示条 */}
      {isSettled && (
        <div className="flex items-center gap-2 rounded-lg bg-apricot-wash border border-rust/30 px-4 py-2.5 text-sm text-rust">
          <Lock className="h-4 w-4 shrink-0" />
          <span>该资金账本已结算，不可编辑。如需修改请先反结算。</span>
        </div>
      )}

      {/* 表格 */}
      <div className="rounded-3xl border border-border bg-card overflow-x-auto shadow-sm">
        <Table className="table-fixed w-full">
          <colgroup>
            <col className="w-[10%]" />
            <col className="w-[8%]" />
            <col className="w-[13%]" />
            <col className="w-[13%]" />
            <col className="w-[13%]" />
            <col className="w-[11%]" />
            <col className="w-[26%]" />
            <col className="w-[6%]" />
          </colgroup>
          <LedgerDetailTableHeader />
          <TableBody>
            {filteredData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-xs text-muted-foreground"
                >
                  暂无记录
                </TableCell>
              </TableRow>
            ) : (
              filteredData.map((record) => (
                <LedgerDetailTableRow
                  key={record.id}
                  record={record}
                  isSettled={isSettled}
                  onDelete={setDeleteTarget}
                  onSupplementVoucher={openSupplementDialog}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 删除确认弹窗 */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这条记录吗？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将软删除该流水记录，删除后不可恢复。
              {deleteTarget ? (
                <span className="block mt-2 text-xs">
                  分类：{deleteTarget.category} · 金额：¥
                  {Number(deleteTarget.amount).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  删除中…
                </>
              ) : (
                "确认删除"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RecordDialog
        projectId={projectId}
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSuccess={() => router.refresh()}
        businessForm={businessForm}
      />

      <SettlementDialog
        open={showSettlementDialog}
        onOpenChange={setShowSettlementDialog}
        projectId={projectId}
        mode={isSettled ? "unsettle" : "settle"}
      />

      {/* 补充凭证弹窗 */}
      <Dialog
        open={!!supplementTarget}
        onOpenChange={(open) => {
          if (!open && !isSupplementing) setSupplementTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>补充凭证</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2 max-h-[70vh] overflow-y-auto overscroll-contain pr-1">
            {supplementTarget && (
              <p className="text-xs text-muted-foreground">
                记录：{supplementTarget.counterparty ?? "-"} · ¥
                {Number(supplementTarget.amount).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </p>
            )}
            <ImageUpload
              key={supplementUploadKey}
              maxCount={9}
              gridCols={3}
              aspectRatio="aspect-video"
              title="点击或拖拽图片上传凭证"
              onChange={handleSupplementChange}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={handleSupplementConfirm}
              disabled={isSupplementing || supplementUrls.length === 0}
              className="w-full bg-ink text-pure-white hover:bg-ink/90 rounded-full"
            >
              {isSupplementing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  提交中…
                </>
              ) : (
                "确认补充"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
