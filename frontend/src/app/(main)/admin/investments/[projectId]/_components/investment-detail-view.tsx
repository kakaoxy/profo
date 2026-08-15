"use client";

/**
 * 跟投详情视图（Phase 3 只读 + Phase 4 编辑模式 + Phase 5 收益分配/结算流转）
 *
 * 拆分后的文件结构（同目录 _components/）：
 *   - shared.tsx                    共享工具函数（toNum/ratioColorClass/countTotalInvestors）、
 *                                   RATIO_EPS 常量、小型组件（InvestorTypeIcon/InfoCell/SettlementBadge）、
 *                                   共用 API 类型别名
 *   - ratio-input.tsx               比例内联输入（带中间输入态同步）
 *   - investor-edit-row-group.tsx   编辑态投资方行组（母投资方 + 子投资人 + 小计）
 *   - detail-header.tsx             只读模式顶部操作栏
 *   - basic-info-card.tsx           基础信息卡（只读）
 *   - investors-card.tsx            投资方管理卡（只读，含 InvestorRowGroup）
 *   - profit-distribution-card.tsx  收益分配卡
 *   - logs-card.tsx                 操作日志卡（含 formatLogContent）
 *   - investor-dialog.tsx           添加/编辑投资方弹窗（Phase 4，既有）
 *   - distribution-ratio-dialog.tsx 调整分配比例弹窗（Phase 5，既有）
 *   - settle-dialog.tsx             结算弹窗（Phase 5，既有）
 *   - unsettle-dialog.tsx           反结算弹窗（Phase 5，既有）
 *   - copy-investment-dialog.tsx    复制跟投配置弹窗（Phase 5，既有）
 *
 * 本文件保留：
 *   - InvestmentEditView：编辑模式主体（~700 行）。内部 state（投资方列表、总额联动、
 *     各类弹窗开关、保存校验与提交）高度耦合，抽离需传递 >8 个 props 且引入额外回调
 *     透传，收益低、风险高，故保留在同文件内。
 *   - InvestmentDetailView：顶层路由组件，根据 ?edit=1 切换只读/编辑视图。
 *   - investorChanged / buildSyntheticInvestment / toLocalSub：仅 InvestmentEditView 使用的
 *     编辑态辅助函数。
 *
 * >500 行不拆理由：InvestmentEditView 的 state（totalInvestment/totalReturn/investors/
 * deletedInvestorIds/各弹窗开关/isSaving）与 handlers（handleSave/handleTotalBlur/
 * handleRatioChange/handleDeleteConfirm 等）在同一闭包内相互引用，拆分为子组件需将
 * 全部 state 与 handler 通过 props 下传，违反 AGENTS.md「>8 props 抽离收益低」原则。
 */

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCNY, formatPercent } from "@/lib/formatters";
import type { components } from "@/lib/api-types";
import {
  addInvestor,
  deleteInvestor,
  deleteInvestment,
  updateInvestment,
  updateInvestor,
} from "../../actions";
import { type LocalInvestor, type LocalSubInvestor } from "./investor-dialog";

// 动态导入弹窗组件（ssr: false，仅在客户端加载；条件渲染保证关闭时卸载）
const InvestorDialog = dynamic(() => import("./investor-dialog").then((m) => m.InvestorDialog), {
  ssr: false,
});
const DistributionRatioDialog = dynamic(
  () => import("./distribution-ratio-dialog").then((m) => m.DistributionRatioDialog),
  { ssr: false },
);
const SettleDialog = dynamic(() => import("./settle-dialog").then((m) => m.SettleDialog), {
  ssr: false,
});
const UnsettleDialog = dynamic(() => import("./unsettle-dialog").then((m) => m.UnsettleDialog), {
  ssr: false,
});
const CopyInvestmentDialog = dynamic(
  () => import("./copy-investment-dialog").then((m) => m.CopyInvestmentDialog),
  { ssr: false },
);
// 抽取的子组件
import { DetailHeader } from "./detail-header";
import { BasicInfoCard } from "./basic-info-card";
import { InvestorsCard } from "./investors-card";
import { ProfitDistributionCard } from "./profit-distribution-card";
import { LogsCard } from "./logs-card";
import { InvestorEditRowGroup } from "./investor-edit-row-group";
// 共享工具与小型组件
import {
  type InvestmentResponse,
  type InvestorResponse,
  InfoCell,
  RATIO_EPS,
  SettlementBadge,
  ratioColorClass,
  toNum,
} from "./shared";

type InvestmentUpdate = components["schemas"]["InvestmentUpdate"];
type InvestorCreate = components["schemas"]["InvestorCreate"];
type InvestorUpdate = components["schemas"]["InvestorUpdate"];

interface DetailViewProps {
  investment: InvestmentResponse;
}

/** 判断本地投资方是否相对原始数据有变更（决定是否需要 PUT） */
function investorChanged(local: LocalInvestor, original: InvestorResponse): boolean {
  if (local.name !== original.name) return true;
  if (local.type !== original.type) return true;
  if (Math.abs(local.share_ratio - toNum(original.share_ratio)) > 0.001) return true;
  if ((local.remark || "") !== (original.remark || "")) return true;
  const origSubs = original.sub_investors ?? [];
  if (local.sub_investors.length !== origSubs.length) return true;
  for (let i = 0; i < local.sub_investors.length; i++) {
    const ls = local.sub_investors[i];
    const os = origSubs[i];
    if (ls.name !== os.name) return true;
    if (Math.abs(ls.share_ratio - toNum(os.share_ratio)) > 0.001) return true;
    if ((ls.remark || "") !== (os.remark || "")) return true;
  }
  return false;
}

/** 用本地编辑态构造合成 InvestmentResponse，供只读 ProfitDistributionCard 复用展示 */
function buildSyntheticInvestment(
  base: InvestmentResponse,
  totalInvestment: number,
  totalReturn: number,
  investors: LocalInvestor[],
): InvestmentResponse {
  return {
    ...base,
    total_investment: String(totalInvestment),
    total_return: String(totalReturn),
    investors: investors.map((inv) => {
      const amount = (totalInvestment * inv.share_ratio) / 100;
      return {
        id: inv.id ?? "",
        investment_id: base.id,
        name: inv.name,
        type: inv.type,
        share_ratio: String(inv.share_ratio),
        invest_amount: String(amount),
        parent_id: null,
        sort_order: null,
        remark: inv.remark || null,
        sub_investors: inv.sub_investors.map((s) => ({
          id: "",
          investment_id: base.id,
          name: s.name,
          type: inv.type,
          share_ratio: String(s.share_ratio),
          invest_amount: String((amount * s.share_ratio) / 100),
          parent_id: inv.id ?? null,
          sort_order: null,
          remark: s.remark || null,
        })),
      };
    }),
  };
}

/** 投资方编辑子投资人 → 本地结构 */
function toLocalSub(s: InvestorResponse): LocalSubInvestor {
  return {
    name: s.name,
    share_ratio: toNum(s.share_ratio),
    remark: s.remark ?? "",
  };
}

/** 投资方编辑态删除目标 */
interface DeleteTarget {
  kind: "investor" | "sub";
  investorIdx: number;
  subIdx?: number;
  name: string;
}

function InvestmentEditView({ investment }: DetailViewProps) {
  const router = useRouter();

  // 基础信息编辑态
  const [totalInvestment, setTotalInvestment] = useState(toNum(investment.total_investment));
  const [totalInput, setTotalInput] = useState(String(toNum(investment.total_investment)));
  const [totalReturn, setTotalReturn] = useState(toNum(investment.total_return));
  const [totalReturnInput, setTotalReturnInput] = useState(String(toNum(investment.total_return)));
  const [remark] = useState(investment.remark ?? "");

  // 投资方编辑态
  const [investors, setInvestors] = useState<LocalInvestor[]>(
    (investment.investors ?? []).map((inv) => ({
      id: inv.id,
      name: inv.name,
      type: inv.type,
      share_ratio: toNum(inv.share_ratio),
      remark: inv.remark ?? "",
      sub_investors: (inv.sub_investors ?? []).map(toLocalSub),
    })),
  );
  const [deletedInvestorIds, setDeletedInvestorIds] = useState<string[]>([]);

  // 弹窗与确认框
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showTotalConfirm, setShowTotalConfirm] = useState(false);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [investorDialogOpen, setInvestorDialogOpen] = useState(false);
  const [editingInvestor, setEditingInvestor] = useState<LocalInvestor | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 派生值
  const totalRatio = investors.reduce((s, inv) => s + inv.share_ratio, 0);
  const totalInvestorCount = investors.reduce(
    (s, inv) => s + (inv.sub_investors.length > 0 ? inv.sub_investors.length : 1),
    0,
  );
  const returnRatio = totalInvestment > 0 ? (totalReturn / totalInvestment) * 100 : null;
  const ratioOver = totalRatio > 100 + RATIO_EPS;

  // 投资总额失焦：值变化则弹联动确认
  const handleTotalBlur = (): void => {
    const n = parseFloat(totalInput);
    if (isNaN(n) || n <= 0) {
      setTotalInput(String(totalInvestment));
      return;
    }
    if (Math.abs(n - totalInvestment) > 0.001) {
      setPendingTotal(n);
      setShowTotalConfirm(true);
    }
  };
  const handleTotalConfirm = (): void => {
    setTotalInvestment(pendingTotal);
    setTotalInput(String(pendingTotal));
    setShowTotalConfirm(false);
  };
  const handleTotalCancel = (): void => {
    setTotalInput(String(totalInvestment));
    setShowTotalConfirm(false);
  };

  // 收益总额失焦：直接提交（允许负值以记录亏损）
  const handleReturnBlur = (): void => {
    const n = parseFloat(totalReturnInput);
    setTotalReturn(isNaN(n) ? 0 : n);
  };

  // 投资比例内联编辑
  const handleRatioChange = (idx: number, n: number): void => {
    setInvestors((prev) => prev.map((inv, i) => (i === idx ? { ...inv, share_ratio: n } : inv)));
  };

  // 投资方弹窗
  const openAddInvestor = (): void => {
    setEditingInvestor(null);
    setEditingIndex(null);
    setInvestorDialogOpen(true);
  };
  const openEditInvestor = (idx: number): void => {
    setEditingInvestor(investors[idx]);
    setEditingIndex(idx);
    setInvestorDialogOpen(true);
  };
  const handleSaveInvestor = (inv: LocalInvestor): void => {
    setInvestors((prev) =>
      editingIndex !== null ? prev.map((x, i) => (i === editingIndex ? inv : x)) : [...prev, inv],
    );
    setInvestorDialogOpen(false);
    setEditingInvestor(null);
    setEditingIndex(null);
  };

  // 删除投资方 / 子投资人
  const handleDeleteConfirm = (): void => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "investor") {
      const target = investors[deleteTarget.investorIdx];
      setInvestors((prev) => prev.filter((_, i) => i !== deleteTarget.investorIdx));
      const tid = target?.id;
      if (tid) {
        setDeletedInvestorIds((prev) => [...prev, tid]);
      }
    } else if (deleteTarget.subIdx !== undefined) {
      setInvestors((prev) =>
        prev.map((inv, i) =>
          i === deleteTarget.investorIdx
            ? {
                ...inv,
                sub_investors: inv.sub_investors.filter((_, j) => j !== deleteTarget.subIdx),
              }
            : inv,
        ),
      );
    }
    setDeleteTarget(null);
  };

  // 退出编辑模式
  const handleExit = (): void => {
    router.replace(`/admin/investments/${investment.project_id}`);
  };

  // 保存前校验所有规则
  const validateAll = (): string | null => {
    if (ratioOver) {
      return `投资比例合计不可超过 100%（当前 ${totalRatio.toFixed(2)}%）`;
    }
    const names = investors.map((inv) => inv.name.trim());
    if (names.some((n) => !n)) return "投资方名称不可为空";
    const nameSet = new Set<string>();
    for (const n of names) {
      if (nameSet.has(n)) return `投资方名称重复：「${n}」`;
      nameSet.add(n);
    }
    for (const inv of investors) {
      if (inv.sub_investors.length > 0) {
        const subSum = inv.sub_investors.reduce((s, sub) => s + sub.share_ratio, 0);
        if (Math.abs(subSum - 100) > RATIO_EPS) {
          return `投资方「${inv.name}」子投资人内部占比合计需 = 100（当前 ${subSum.toFixed(2)}%）`;
        }
        const subNames = inv.sub_investors.map((s) => s.name.trim());
        if (subNames.some((n) => !n)) {
          return `投资方「${inv.name}」子投资人姓名不可为空`;
        }
        const subSet = new Set<string>();
        for (const n of subNames) {
          if (subSet.has(n)) {
            return `投资方「${inv.name}」子投资人姓名重复：「${n}」`;
          }
          subSet.add(n);
        }
      }
    }
    return null;
  };

  const handleSave = async (): Promise<void> => {
    const err = validateAll();
    if (err) {
      toast.error(err);
      return;
    }
    setIsSaving(true);
    try {
      const investmentId = investment.id;
      const origTotal = toNum(investment.total_investment);
      const origReturn = toNum(investment.total_return);
      const origRemark = investment.remark ?? "";
      const totalChanged = Math.abs(totalInvestment - origTotal) > 0.001;
      const returnChanged = Math.abs(totalReturn - origReturn) > 0.001;
      const remarkChanged = remark !== origRemark;

      // 1. 基础信息（投资总额/收益总额/备注）
      if (totalChanged || returnChanged || remarkChanged) {
        const body: InvestmentUpdate = {};
        if (totalChanged) body.total_investment = totalInvestment;
        if (returnChanged) body.total_return = totalReturn;
        if (remarkChanged) body.remark = remark;
        const res = await updateInvestment(investmentId, body);
        if (!res.success) {
          toast.error(`更新基础信息失败：${res.message}`);
          return;
        }
      }

      // 2. 更新已存在投资方（按"降幅优先"排序，避免中间态合计 > 100%）
      //    先 map 配对 {inv, orig}，再 filter/sort，避免重复 Map 查找
      const originalById = new Map((investment.investors ?? []).map((inv) => [inv.id, inv]));
      const toUpdate = investors
        .map((inv) => ({ inv, orig: inv.id ? originalById.get(inv.id) : undefined }))
        .filter(({ inv, orig }) => orig !== undefined && investorChanged(inv, orig))
        .sort(
          (a, b) =>
            a.inv.share_ratio -
            toNum(a.orig!.share_ratio) -
            (b.inv.share_ratio - toNum(b.orig!.share_ratio)),
        )
        .map(({ inv }) => inv);
      for (const inv of toUpdate) {
        const body: InvestorUpdate = {
          name: inv.name,
          type: inv.type,
          share_ratio: inv.share_ratio,
          remark: inv.remark || null,
          sub_investors:
            inv.sub_investors.length > 0
              ? inv.sub_investors.map((s) => ({
                  name: s.name,
                  share_ratio: s.share_ratio,
                  remark: s.remark || null,
                }))
              : null,
        };
        const res = await updateInvestor(investmentId, inv.id!, body);
        if (!res.success) {
          toast.error(`更新投资方「${inv.name}」失败：${res.message}`);
          return;
        }
      }

      // 3. 新增投资方
      const toAdd = investors.filter((inv) => !inv.id);
      for (const inv of toAdd) {
        const body: InvestorCreate = {
          name: inv.name,
          type: inv.type,
          share_ratio: inv.share_ratio,
          remark: inv.remark || null,
          sub_investors:
            inv.sub_investors.length > 0
              ? inv.sub_investors.map((s) => ({
                  name: s.name,
                  share_ratio: s.share_ratio,
                  remark: s.remark || null,
                }))
              : null,
        };
        const res = await addInvestor(investmentId, body);
        if (!res.success) {
          toast.error(`添加投资方「${inv.name}」失败：${res.message}`);
          return;
        }
      }

      // 4. 删除投资方（放在最后：不可逆操作，仅在其余操作全部成功后执行）
      for (const invId of deletedInvestorIds) {
        const res = await deleteInvestor(investmentId, invId);
        if (!res.success) {
          toast.error(`删除投资方失败：${res.message}`);
          return;
        }
      }

      toast.success("保存成功");
      router.refresh();
      router.replace(`/admin/investments/${investment.project_id}`);
    } catch {
      toast.error("保存失败，请稍后重试");
    } finally {
      setIsSaving(false);
    }
  };

  // 弹窗参数（useMemo 避免每次渲染重复计算）
  const dialogExistingNames = useMemo(
    () => investors.filter((_, i) => i !== editingIndex).map((inv) => inv.name.trim()),
    [investors, editingIndex],
  );
  const dialogOtherRatioSum = useMemo(
    () => investors.filter((_, i) => i !== editingIndex).reduce((s, inv) => s + inv.share_ratio, 0),
    [investors, editingIndex],
  );

  // 合成投资数据（供只读 ProfitDistributionCard 复用展示编辑态预览）
  const syntheticInvestment = useMemo(
    () => buildSyntheticInvestment(investment, totalInvestment, totalReturn, investors),
    [investment, totalInvestment, totalReturn, investors],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/admin/investments"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
              返回跟投列表
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              💰 跟投详情 — {investment.project_code || "-"} {investment.project_name || ""}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <SettlementBadge status={investment.settlement_status} />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowCancelConfirm(true)}
              disabled={isSaving}
            >
              <X className="h-4 w-4" />
              取消
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-primary hover:bg-primary/90"
              onClick={handleSave}
              disabled={isSaving}
            >
              <Save className="h-4 w-4" />
              {isSaving ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-secondary/10 border border-secondary/30 px-4 py-2.5 text-sm text-secondary">
          <span className="h-2 w-2 rounded-full bg-secondary" />
          <span className="font-medium">编辑模式</span>
          <span className="text-muted-foreground">· 修改完成后请点击「保存」提交</span>
        </div>
      </div>

      {/* 基础信息编辑 */}
      <Card>
        <CardContent className="space-y-6">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <span>📋</span>
            基础信息
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5">
            <InfoCell label="项目编号">
              <span className="font-mono text-xs">{investment.project_code || "-"}</span>
            </InfoCell>
            <InfoCell label="小区">{investment.project_name || "-"}</InfoCell>
            <InfoCell label="物业地址">-</InfoCell>
            <InfoCell label="项目状态">-</InfoCell>
            <InfoCell label="跟投状态">
              <SettlementBadge status={investment.settlement_status} />
            </InfoCell>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                投资总额
              </label>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">¥</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalInput}
                  onChange={(e) => setTotalInput(e.target.value)}
                  onBlur={handleTotalBlur}
                  className="font-mono tabular-nums"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                收益总额
              </label>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-emerald-600">¥</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalReturnInput}
                  onChange={(e) => setTotalReturnInput(e.target.value)}
                  onBlur={handleReturnBlur}
                  className="font-mono tabular-nums"
                />
              </div>
            </div>
            <InfoCell label="回报率">
              {returnRatio === null ? (
                <span className="text-muted-foreground">-</span>
              ) : (
                <span
                  className={cn(
                    "font-mono text-lg font-bold tabular-nums",
                    ratioColorClass(returnRatio),
                  )}
                >
                  {formatPercent(returnRatio)}
                </span>
              )}
            </InfoCell>
            <InfoCell label="投资方数量">{investors.length} 个</InfoCell>
            <InfoCell label="投资人总数">{totalInvestorCount} 人</InfoCell>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-muted/40 border border-border px-4 py-2.5 text-xs text-muted-foreground">
            <span>💡</span>
            <span>
              修改「投资总额」将弹出确认框，确认后自动重算所有投资方与子投资人金额。项目编号/小区/状态/时间等字段只读。
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 投资方管理编辑 */}
      <Card>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span>👥</span>
              投资方管理
            </h2>
            <Button
              variant="default"
              size="sm"
              className="gap-1.5 bg-primary hover:bg-primary/90"
              onClick={openAddInvestor}
              disabled={isSaving}
            >
              <Plus className="h-4 w-4" />
              添加投资方
            </Button>
          </div>
          {investors.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <span className="text-3xl">📭</span>
              <p className="text-sm text-muted-foreground">暂无投资方</p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={openAddInvestor}
                disabled={isSaving}
              >
                <Plus className="h-4 w-4" />
                添加投资方
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="min-w-[220px] text-muted-foreground font-medium">
                      投资方
                    </TableHead>
                    <TableHead className="min-w-[120px] text-muted-foreground font-medium">
                      投资占比
                    </TableHead>
                    <TableHead className="min-w-[160px] text-right text-muted-foreground font-medium">
                      投资金额
                    </TableHead>
                    <TableHead className="min-w-[60px] text-center text-muted-foreground font-medium">
                      子投资人
                    </TableHead>
                    <TableHead className="min-w-[200px] text-right text-muted-foreground font-medium">
                      操作
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investors.map((inv, idx) => {
                    const amount = (totalInvestment * inv.share_ratio) / 100;
                    const subs = inv.sub_investors;
                    const subAmountSum = subs.reduce(
                      (s, sub) => s + (amount * sub.share_ratio) / 100,
                      0,
                    );
                    return (
                      <InvestorEditRowGroup
                        key={inv.id ?? `new-${idx}`}
                        inv={inv}
                        idx={idx}
                        amount={amount}
                        subs={subs}
                        subAmountSum={subAmountSum}
                        onRatioChange={handleRatioChange}
                        onEdit={openEditInvestor}
                        onAddSub={openEditInvestor}
                        onDeleteInvestor={(i, name) =>
                          setDeleteTarget({ kind: "investor", investorIdx: i, name })
                        }
                        onDeleteSub={(i, j, name) =>
                          setDeleteTarget({
                            kind: "sub",
                            investorIdx: i,
                            subIdx: j,
                            name,
                          })
                        }
                        disabled={isSaving}
                      />
                    );
                  })}
                  <TableRow className="border-t-2 border-foreground hover:bg-transparent">
                    <TableCell className="font-bold">合计</TableCell>
                    <TableCell
                      className={cn(
                        "font-mono tabular-nums font-bold",
                        ratioOver && "text-red-500",
                      )}
                    >
                      {formatPercent(totalRatio)}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums font-bold text-right">
                      {formatCNY(totalInvestment)}
                    </TableCell>
                    <TableCell className="text-center font-bold">{totalInvestorCount}人</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
          {ratioOver && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>投资比例合计 {formatPercent(totalRatio)} 超过 100%，请调整后保存</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 收益分配（只读，基于本地编辑态） */}
      <ProfitDistributionCard
        investment={syntheticInvestment}
        onAdjustReturn={() => {}}
        adjustDisabled
      />

      {/* 操作日志（只读） */}
      <LogsCard investment={investment} />

      <div className="rounded-lg bg-secondary/10 border border-secondary/30 px-6 py-3 text-center text-xs text-secondary font-medium">
        ⚠️ 当前为编辑模式。修改完成后请点击右上角「保存」按钮提交。
      </div>

      {/* 取消编辑确认 */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认取消编辑？</AlertDialogTitle>
            <AlertDialogDescription>未保存的修改将丢失。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleExit}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认取消
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 投资总额联动确认 */}
      <Dialog open={showTotalConfirm} onOpenChange={setShowTotalConfirm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>投资总额变更确认</DialogTitle>
            <DialogDescription>
              修改投资总额将按各投资方比例重算金额，请确认变更。
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-medium">投资方</TableHead>
                  <TableHead className="text-right text-muted-foreground font-medium">
                    原金额
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground font-medium">
                    新金额
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {investors.map((inv, i) => {
                  const oldAmt = (totalInvestment * inv.share_ratio) / 100;
                  const newAmt = (pendingTotal * inv.share_ratio) / 100;
                  return (
                    <TableRow key={inv.id ?? `conf-${i}`}>
                      <TableCell className="font-medium">{inv.name}</TableCell>
                      <TableCell className="font-mono tabular-nums text-right text-muted-foreground">
                        {formatCNY(oldAmt)}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums text-right">
                        {formatCNY(newAmt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="border-t-2 border-foreground hover:bg-transparent">
                  <TableCell className="font-bold">合计</TableCell>
                  <TableCell className="font-mono tabular-nums font-bold text-right text-muted-foreground">
                    {formatCNY(totalInvestment)}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums font-bold text-right">
                    {formatCNY(pendingTotal)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleTotalCancel}>
              取消
            </Button>
            <Button onClick={handleTotalConfirm} className="bg-primary hover:bg-primary/90">
              确认变更
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === "investor"
                ? `将删除投资方「${deleteTarget.name}」及其全部子投资人。`
                : `将删除子投资人「${deleteTarget?.name}」，删除后请确保内部占比合计仍 = 100。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 添加/编辑投资方弹窗 */}
      {investorDialogOpen && (
        <InvestorDialog
          open={investorDialogOpen}
          onOpenChange={setInvestorDialogOpen}
          onSave={handleSaveInvestor}
          investor={editingInvestor}
          totalInvestment={totalInvestment}
          existingNames={dialogExistingNames}
          otherRatioSum={dialogOtherRatioSum}
        />
      )}
    </div>
  );
}

export function InvestmentDetailView({ investment }: DetailViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditing = searchParams.get("edit") === "1" && investment.settlement_status !== "settled";

  // Phase 5 弹窗状态
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [showSettleDialog, setShowSettleDialog] = useState(false);
  const [showUnsettleDialog, setShowUnsettleDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (): Promise<void> => {
    setIsDeleting(true);
    try {
      const res = await deleteInvestment(investment.id);
      if (res.success) {
        toast.success("跟投记录已删除");
        setShowDeleteConfirm(false);
        router.push("/admin/investments");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("删除失败，请稍后重试");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isEditing) {
    return <InvestmentEditView investment={investment} />;
  }
  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        investment={investment}
        onSettle={() => setShowSettleDialog(true)}
        onUnsettle={() => setShowUnsettleDialog(true)}
        onDelete={() => setShowDeleteConfirm(true)}
        onCopy={() => setShowCopyDialog(true)}
      />
      <BasicInfoCard investment={investment} />
      <InvestorsCard investment={investment} />
      <ProfitDistributionCard
        investment={investment}
        onAdjustReturn={() => setShowReturnDialog(true)}
      />
      <LogsCard investment={investment} />
      <div className="rounded-lg bg-muted/60 px-6 py-3 text-center text-xs text-muted-foreground">
        ⚠️ 当前为只读模式。点击右上角「编辑」按钮可修改内容。
      </div>

      {/* Phase 5 弹窗 */}
      {showReturnDialog && (
        <DistributionRatioDialog
          open={showReturnDialog}
          onOpenChange={setShowReturnDialog}
          investment={investment}
        />
      )}
      {showSettleDialog && (
        <SettleDialog
          open={showSettleDialog}
          onOpenChange={setShowSettleDialog}
          investment={investment}
        />
      )}
      {showUnsettleDialog && (
        <UnsettleDialog
          open={showUnsettleDialog}
          onOpenChange={setShowUnsettleDialog}
          investment={investment}
        />
      )}
      {showCopyDialog && (
        <CopyInvestmentDialog
          open={showCopyDialog}
          onOpenChange={setShowCopyDialog}
          investment={investment}
        />
      )}

      {/* 删除跟投记录确认（SubTask 5.4.1） */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除跟投记录？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将软删除该跟投记录，相关投资方与日志将保留但不再展示。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
