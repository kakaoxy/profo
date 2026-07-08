"use client";

/**
 * 添加/编辑投资方弹窗（Phase 4）
 *
 * 字段：类型(企业/个人)、名称、投资比例、备注
 * 子投资人 inline 表格：姓名、内部占比、实际金额(自动)、操作(编辑/删除)
 * 校验：名称必填且同项目不重复、比例 0-100 且合计 ≤100、
 *       子投资人内部占比合计 =100、子投资人姓名同投资方下不重复
 */

import * as React from "react";
import { Plus, Trash2, Building2, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCNY } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { components } from "@/lib/api-types";

type InvestorType = components["schemas"]["InvestorType"];

/** 子投资人本地编辑态 */
export interface LocalSubInvestor {
  name: string;
  share_ratio: number;
  remark: string;
}

/** 投资方本地编辑态（id 缺省表示新增） */
export interface LocalInvestor {
  id?: string;
  name: string;
  type: InvestorType;
  share_ratio: number;
  remark: string;
  sub_investors: LocalSubInvestor[];
}

interface InvestorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (investor: LocalInvestor) => void;
  investor?: LocalInvestor | null;
  totalInvestment: number;
  /** 同项目其他投资方名称（用于唯一性校验，编辑时应排除当前投资方） */
  existingNames: string[];
  /** 同项目其他投资方比例合计（用于 ≤100 校验） */
  otherRatioSum: number;
}

/** 数值容差（浮点合计比较） */
const RATIO_EPS = 0.01;

export function InvestorDialog({
  open,
  onOpenChange,
  onSave,
  investor,
  totalInvestment,
  existingNames,
  otherRatioSum,
}: InvestorDialogProps) {
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<InvestorType>("enterprise");
  const [shareRatioInput, setShareRatioInput] = React.useState("");
  const [remark, setRemark] = React.useState("");
  const [subs, setSubs] = React.useState<LocalSubInvestor[]>([]);
  const [errors, setErrors] = React.useState<{
    name?: string;
    shareRatio?: string;
    subs?: string;
  }>({});

  // 打开时回填表单
  React.useEffect(() => {
    if (open) {
      setName(investor?.name ?? "");
      setType(investor?.type ?? "enterprise");
      setShareRatioInput(
        investor?.share_ratio != null ? String(investor.share_ratio) : "",
      );
      setRemark(investor?.remark ?? "");
      setSubs(
        (investor?.sub_investors ?? []).map((s) => ({
          name: s.name,
          share_ratio: s.share_ratio,
          remark: s.remark ?? "",
        })),
      );
      setErrors({});
    }
  }, [open, investor]);

  const ratioNum = parseFloat(shareRatioInput) || 0;
  const investorAmount = (totalInvestment * ratioNum) / 100;
  const subRatioSum = subs.reduce(
    (s, sub) => s + (Number(sub.share_ratio) || 0),
    0,
  );
  const hasSubs = subs.length > 0;

  const handleAddSub = (): void => {
    setSubs((prev) => [...prev, { name: "", share_ratio: 0, remark: "" }]);
  };

  const handleSubChange = (
    idx: number,
    field: keyof LocalSubInvestor,
    value: string,
  ): void => {
    setSubs((prev) =>
      prev.map((s, i) =>
        i === idx
          ? {
              ...s,
              [field]:
                field === "share_ratio" ? (parseFloat(value) || 0) : value,
            }
          : s,
      ),
    );
  };

  const handleDeleteSub = (idx: number): void => {
    setSubs((prev) => prev.filter((_, i) => i !== idx));
  };

  const validate = (): boolean => {
    const errs: typeof errors = {};
    const trimmedName = name.trim();
    if (!trimmedName) {
      errs.name = "名称必填";
    } else if (existingNames.includes(trimmedName)) {
      errs.name = "名称与同项目其他投资方重复";
    }
    if (ratioNum <= 0 || ratioNum > 100) {
      errs.shareRatio = "比例需在 0-100 之间";
    } else if (ratioNum + otherRatioSum > 100 + RATIO_EPS) {
      errs.shareRatio = `比例合计不可超过 100（其他投资方已占 ${otherRatioSum.toFixed(2)}%）`;
    }
    if (hasSubs) {
      if (Math.abs(subRatioSum - 100) > RATIO_EPS) {
        errs.subs = `子投资人内部占比合计需 = 100（当前 ${subRatioSum.toFixed(2)}）`;
      } else {
        const subNames = subs.map((s) => s.name.trim());
        if (subNames.some((n) => !n)) {
          errs.subs = "子投资人姓名必填";
        } else {
          const seen = new Set<string>();
          for (const n of subNames) {
            if (seen.has(n)) {
              errs.subs = "子投资人姓名同投资方下不可重复";
              break;
            }
            seen.add(n);
          }
        }
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = (): void => {
    if (!validate()) return;
    onSave({
      id: investor?.id,
      name: name.trim(),
      type,
      share_ratio: ratioNum,
      remark: remark.trim(),
      sub_investors: subs.map((s) => ({
        name: s.name.trim(),
        share_ratio: Number(s.share_ratio) || 0,
        remark: s.remark.trim(),
      })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] grid-rows-[auto_auto_1fr_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>
            {investor ? "编辑投资方" : "添加投资方"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            投资金额 = 投资总额 × 比例（自动计算）；子投资人实际金额 = 母投资方金额 × 内部占比
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 px-6 py-4">
          <div className="space-y-4">
            {/* 类型 + 名称 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  类型 <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={type}
                  onValueChange={(v) => setType(v as InvestorType)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enterprise">
                      <span className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" /> 企业
                      </span>
                    </SelectItem>
                    <SelectItem value="individual">
                      <span className="flex items-center gap-2">
                        <User className="h-4 w-4" /> 个人
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  名称 <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder="投资方名称"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={!!errors.name}
                />
                {errors.name && (
                  <p className="text-xs text-red-500">{errors.name}</p>
                )}
              </div>
            </div>

            {/* 比例 + 投资金额 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  投资比例(%) <span className="text-red-500">*</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="如 30.00"
                    value={shareRatioInput}
                    onChange={(e) => setShareRatioInput(e.target.value)}
                    aria-invalid={!!errors.shareRatio}
                  />
                  <span className="text-sm font-medium text-muted-foreground">
                    %
                  </span>
                </div>
                {errors.shareRatio && (
                  <p className="text-xs text-red-500">{errors.shareRatio}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>投资金额(自动)</Label>
                <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 font-mono text-sm tabular-nums">
                  {formatCNY(investorAmount)}
                </div>
              </div>
            </div>

            {/* 备注 */}
            <div className="space-y-2">
              <Label>备注</Label>
              <Textarea
                placeholder="选填，记录投资方相关说明"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                rows={2}
              />
            </div>

            {/* 子投资人 inline 表格 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>子投资人</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleAddSub}
                >
                  <Plus className="h-4 w-4" />
                  添加子投资人
                </Button>
              </div>
              {errors.subs && (
                <p className="text-xs text-red-500">{errors.subs}</p>
              )}
              {hasSubs ? (
                <div className="rounded-md border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-muted-foreground font-medium">
                          姓名
                        </TableHead>
                        <TableHead className="text-muted-foreground font-medium w-32">
                          内部占比(%)
                        </TableHead>
                        <TableHead className="text-right text-muted-foreground font-medium w-36">
                          实际金额
                        </TableHead>
                        <TableHead className="w-12 text-center text-muted-foreground font-medium">
                          操作
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subs.map((sub, idx) => {
                        const subAmount =
                          (investorAmount * (Number(sub.share_ratio) || 0)) /
                          100;
                        return (
                          <TableRow key={idx}>
                            <TableCell>
                              <Input
                                placeholder="姓名"
                                value={sub.name}
                                onChange={(e) =>
                                  handleSubChange(idx, "name", e.target.value)
                                }
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                value={String(sub.share_ratio)}
                                onChange={(e) =>
                                  handleSubChange(
                                    idx,
                                    "share_ratio",
                                    e.target.value,
                                  )
                                }
                                className="h-8 font-mono tabular-nums"
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {formatCNY(subAmount)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeleteSub(idx)}
                                aria-label="删除子投资人"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="border-t border-dashed hover:bg-transparent">
                        <TableCell className="italic text-muted-foreground text-sm">
                          小计
                        </TableCell>
                        <TableCell
                          className={cn(
                            "font-mono tabular-nums text-sm",
                            hasSubs &&
                              Math.abs(subRatioSum - 100) > RATIO_EPS &&
                              "text-red-500",
                          )}
                        >
                          {subRatioSum.toFixed(2)}%
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-sm italic text-muted-foreground">
                          {formatCNY(investorAmount)}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  暂无子投资人。可不添加，整笔投资金额归属母投资方。
                </p>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-3 border-t border-border bg-card gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button onClick={handleSave} className="bg-primary hover:bg-primary/90">
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
