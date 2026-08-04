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
import { LedgerDetailStats } from "./ledger-detail-stats";
import { LedgerDetailTableFilter, type FilterTab } from "./ledger-detail-table-filter";
import { LedgerDetailTableHeader } from "./ledger-detail-table-header";
import { LedgerDetailTableRow } from "./ledger-detail-table-row";
import { deleteRecord, updateRecordAction } from "../../actions";
import { exportProjectLedger } from "../../export-actions";
import type { components } from "@/lib/api-types";

type CashFlowRecordResponse = components["schemas"]["CashFlowRecordResponse"];
type SettlementStatus = components["schemas"]["SettlementStatus"];

interface LedgerDetailTableProps {
  projectId: string;
  data: CashFlowRecordResponse[];
  businessForm?: "agent" | "wholesale" | null;
  settlementStatus?: SettlementStatus | null;
}

/**
 * 资金账本表格筛选状态 hook
 * 用 useReducer 集中管理 filter/search/科目/凭证筛选状态
 */
type LedgerFilterState = {
  filter: FilterTab;
  searchInput: string;
  debouncedSearch: string;
  subjectFilter: string;
  voucherFilter: string;
};

type LedgerFilterAction =
  | { type: "SET_FILTER"; payload: FilterTab }
  | { type: "SET_SEARCH_INPUT"; payload: string }
  | { type: "SET_DEBOUNCED_SEARCH"; payload: string }
  | { type: "SET_SUBJECT_FILTER"; payload: string }
  | { type: "SET_VOUCHER_FILTER"; payload: string };

const initialLedgerFilterState: LedgerFilterState = {
  filter: "all",
  searchInput: "",
  debouncedSearch: "",
  subjectFilter: "all",
  voucherFilter: "all",
};

function ledgerFilterReducer(
  state: LedgerFilterState,
  action: LedgerFilterAction,
): LedgerFilterState {
  switch (action.type) {
    case "SET_FILTER":
      return { ...state, filter: action.payload };
    case "SET_SEARCH_INPUT":
      return { ...state, searchInput: action.payload };
    case "SET_DEBOUNCED_SEARCH":
      return { ...state, debouncedSearch: action.payload };
    case "SET_SUBJECT_FILTER":
      return { ...state, subjectFilter: action.payload };
    case "SET_VOUCHER_FILTER":
      return { ...state, voucherFilter: action.payload };
    default:
      return state;
  }
}

function useLedgerFilters(data: CashFlowRecordResponse[]) {
  const [state, dispatch] = React.useReducer(
    ledgerFilterReducer,
    initialLedgerFilterState,
  );

  // 搜索 300ms 防抖
  React.useEffect(() => {
    const timer = setTimeout(() => {
      dispatch({ type: "SET_DEBOUNCED_SEARCH", payload: state.searchInput });
    }, 300);
    return () => clearTimeout(timer);
  }, [state.searchInput]);

  const filteredData = React.useMemo(() => {
    const keyword = state.debouncedSearch.trim().toLowerCase();
    return data.filter((item) => {
      // 1. Tabs（all/in/out）：按 outflow>0 / inflow>0 过滤
      const out = Number(item.outflow) || 0;
      const infl = Number(item.inflow) || 0;
      if (state.filter === "in" && !(infl > 0)) return false;
      if (state.filter === "out" && !(out > 0)) return false;
      // 2. 摘要/付款方/收款方 模糊搜索
      if (keyword) {
        const hay = [
          item.description ?? "",
          item.remark ?? "",
          item.payer ?? "",
          item.payee ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(keyword)) return false;
      }
      // 3. 科目分类筛选（按 subject_id 匹配）
      if (
        state.subjectFilter !== "all" &&
        (item.subject_id ?? item.subject?.id ?? "") !== state.subjectFilter
      )
        return false;
      // 4. 凭证状态筛选
      const hasVoucher = !!(item.receipt_urls && item.receipt_urls.length > 0);
      if (state.voucherFilter === "with" && !hasVoucher) return false;
      if (state.voucherFilter === "without" && hasVoucher) return false;
      return true;
    });
  }, [data, state.filter, state.debouncedSearch, state.subjectFilter, state.voucherFilter]);

  // 筛选汇总：笔数 + 净现金流（流入 − 流出）
  const summary = React.useMemo(() => {
    let net = 0;
    for (const item of filteredData) {
      net += (Number(item.inflow) || 0) - (Number(item.outflow) || 0);
    }
    return { count: filteredData.length, net };
  }, [filteredData]);

  return {
    filter: state.filter,
    searchInput: state.searchInput,
    subjectFilter: state.subjectFilter,
    voucherFilter: state.voucherFilter,
    filteredData,
    summary,
    setFilter: (val: FilterTab) =>
      dispatch({ type: "SET_FILTER", payload: val }),
    setSearchInput: (val: string) =>
      dispatch({ type: "SET_SEARCH_INPUT", payload: val }),
    setSubjectFilter: (val: string) =>
      dispatch({ type: "SET_SUBJECT_FILTER", payload: val }),
    setVoucherFilter: (val: string) =>
      dispatch({ type: "SET_VOUCHER_FILTER", payload: val }),
  };
}

export function LedgerDetailTable({
  projectId,
  data,
  businessForm,
  settlementStatus,
}: LedgerDetailTableProps) {
  const router = useRouter();
  const records = data;
  const {
    filter,
    searchInput,
    subjectFilter,
    voucherFilter,
    filteredData,
    summary,
    setFilter,
    setSearchInput,
    setSubjectFilter,
    setVoucherFilter,
  } = useLedgerFilters(records);
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

  // 删除弹窗金额文案（流出 − / 流入 +）
  const deleteAmountText = deleteTarget
    ? (Number(deleteTarget.outflow) || 0) > 0
      ? `−¥${Number(deleteTarget.outflow).toLocaleString("en-US", {
          minimumFractionDigits: 2,
        })}`
      : `+¥${Number(deleteTarget.inflow).toLocaleString("en-US", {
          minimumFractionDigits: 2,
        })}`
    : "";

  return (
    <div className="space-y-4">
      {/* 顶部统计卡（流入/流出/净现金流/进损益流出） */}
      <LedgerDetailStats data={records} />

      {/* Tabs 筛选 + 搜索 + 科目筛选 + 操作按钮 */}
      <LedgerDetailTableFilter
        filter={filter}
        onFilterChange={setFilter}
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        subjectFilter={subjectFilter}
        onSubjectFilterChange={setSubjectFilter}
        voucherFilter={voucherFilter}
        onVoucherFilterChange={setVoucherFilter}
        businessForm={businessForm}
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
        共 {summary.count} 笔 · 净现金流 {formatCNY(summary.net)}
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
            <col className="w-[22%]" />
            <col className="w-[16%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[6%]" />
            <col className="w-[6%]" />
          </colgroup>
          <LedgerDetailTableHeader />
          <TableBody>
            {filteredData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
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
                  摘要：{deleteTarget.description || deleteTarget.remark || "-"} · 金额：
                  {deleteAmountText}
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
                记录：{supplementTarget.description || supplementTarget.remark || "-"} ·{" "}
                {(Number(supplementTarget.outflow) || 0) > 0
                  ? `−¥${Number(supplementTarget.outflow).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}`
                  : `+¥${Number(supplementTarget.inflow).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}`}
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
