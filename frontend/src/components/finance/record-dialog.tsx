"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ImageUpload } from "@/components/common/image-upload";
import type { ImageItem } from "@/components/common/image-upload";
// ⚠️ 应收应付模块暂停：恢复时取消下方注释
// import { ReceivablePayableTable } from "@/components/finance/receivable-payable-table";
import { SubjectSelectPanel } from "@/app/(main)/admin/ledger/_components/subject-select-panel";
import { AccountPicker } from "@/components/finance/account-picker";
import { fetchAccountOptions, fetchAccounts } from "@/app/(main)/admin/accounts/actions";
import type { components } from "@/lib/api-types";

import { createRecord } from "@/app/(main)/admin/ledger/actions";
import { createRecordSchema } from "@/app/(main)/admin/ledger/_components/ledger-schema";

type FundAccountOption = components["schemas"]["FundAccountOption"];
/** 弹窗用的账户项：基础信息来自「无需解锁」的 options 接口，余额来自解锁后的 accounts */
type PickerAccount = Pick<
  FundAccountOption,
  "id" | "name" | "type" | "account_no" | "status"
> & { balance?: number | null };

interface RecordDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  businessForm?: "agent" | "wholesale" | null;
}

export function RecordDialog({
  projectId,
  isOpen,
  onClose,
  onSuccess,
  businessForm,
}: RecordDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // ⚠️ 应收应付模块暂停：恢复时取消下方注释
  // const [showReceivablePayable, setShowReceivablePayable] = useState(false);

  // 表单状态（Task 8 重构：subject_id + outflow/inflow + payer/payee）
  const [subjectId, setSubjectId] = useState("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  // 方向二选一：out=花出去（流出）/ in=收进来（流入）。
  // 不能用「两个金额框都填、靠互斥校验兜底」——界面本身就不该提供同时填写的可能。
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [amount, setAmount] = useState("");
  const [payer, setPayer] = useState("");
  const [payee, setPayee] = useState("");
  const [receiptUrls, setReceiptUrls] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accountSkipped, setAccountSkipped] = useState(false);
  const [accounts, setAccounts] = useState<PickerAccount[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 用于强制重置 ImageUpload 内部状态（每次打开弹窗递增）
  const [uploadKey, setUploadKey] = useState(0);

  // 打开弹窗时重置所有状态
  useEffect(() => {
    if (isOpen) {
      setSubjectId("");
      setDate(new Date());
      setDirection("out");
      setAmount("");
      setPayer("");
      setPayee("");
      setReceiptUrls([]);
      setNotes("");
      setAccountId("");
      setAccountSkipped(false);
      setErrors({});
      // 两段式加载（关键设计）：
      //   ① /admin/accounts/options —— 免解锁，只给 id/名称/类型/卡号（**无余额**），
      //      保证「未解锁也能正常选账户记账」；
      //   ② /admin/accounts —— 需解锁，成功时把余额合并进同一列表，
      //      失败（403 未解锁）则静默保持无余额状态，**不提示报错**。
      // 这样「默认显示所有账户」与「余额只在解锁后可见」同时成立。
      const token = (() => {
        try {
          return window.sessionStorage.getItem("profo:fund-accounts:unlock-token");
        } catch {
          return null;
        }
      })();

      void fetchAccountOptions().then((res) => {
        if (!res.success) return;
        setAccounts(res.data.items);

        // 已解锁时补上余额（不阻塞选账户）
        if (token) {
          void fetchAccounts({ status: "active", sort: "balance" }, { token }).then((full) => {
            if (!full.success) return;
            const balanceById = new Map(
              full.data.items.map((item) => [item.id, Number(item.balance)] as const),
            );
            setAccounts((prev) =>
              prev.map((item) => ({
                ...item,
                balance: balanceById.get(item.id),
              })),
            );
          });
        }
      });
      setUploadKey((k) => k + 1);
      // setShowReceivablePayable(false); // ⚠️ 应收应付模块暂停
    }
  }, [isOpen]);

  const handleReceiptChange = useCallback((items: ImageItem[]) => {
    const urls = items.filter((i) => i.status === "success" && i.url).map((i) => i.url as string);
    setReceiptUrls(urls);
  }, []);

  // ⚠️ 应收应付模块暂停：恢复时取消下方注释（derivedType 供 ReceivablePayableTable 联动）
  // // type 从 outflow/inflow 推导（供 ReceivablePayableTable 联动使用）
  // // outflow > 0 → expense, inflow > 0 → income, 默认 expense
  // const derivedType: "expense" | "income" = useMemo(() => {
  //   const out = Number(outflow) || 0;
  //   const infl = Number(inflow) || 0;
  //   if (infl > 0 && out <= 0) return "income";
  //   return "expense";
  // }, [outflow, inflow]);

  // 方向决定金额落到 outflow 还是 inflow：永远只有一个 > 0，
  // 服务端互斥校验因此不可能被触发（前端从结构上就不提供同时填写的入口）。
  const selectedAccountName = accountSkipped
    ? null
    : (accounts.find((item) => item.id === accountId)?.name ?? null);
  const amountValue = Number(amount) || 0;
  const out = direction === "out" ? amountValue : 0;
  const infl = direction === "in" ? amountValue : 0;

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!date) e.date = "请选择日期";
    if (!subjectId) e.subjectId = "请选择科目分类";

    if (amountValue <= 0) {
      e.amount = direction === "out" ? "请填写流出金额（大于 0）" : "请填写流入金额（大于 0）";
    }
    // 账户：必须选一个，或显式勾「没走账户」并写明原因
    if (!accountSkipped && !accountId) {
      e.account = `请选择${direction === "out" ? "付款账户" : "收款账户"}，或标记「没走账户」`;
    }
    if (accountSkipped && !notes.trim()) {
      e.accountNote = "标记「未走账户」时请写明原因";
    }
    // 复用 createRecordSchema 做兜底（金额区间等），互斥 refine 不会再触发
    const parsed = createRecordSchema.safeParse({
      project_id: projectId,
      subject_id: subjectId,
      date: date ? format(date, "yyyy-MM-dd") : "",
      outflow: out,
      inflow: infl,
      payer: payer.trim() || null,
      payee: payee.trim() || null,
      description: notes.trim() || null,
      receipt_urls: receiptUrls.length > 0 ? receiptUrls : null,
      account_id: accountSkipped ? null : accountId || null,
      account_skipped: accountSkipped,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if ((key === "outflow" || key === "inflow") && !e.amount) e.amount = issue.message;
        else if (key === "account_id" && !e.account) e.account = issue.message;
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const handleSubmit = async () => {
    if (!validate()) {
      toast.error("请完善必填信息");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        project_id: projectId,
        subject_id: subjectId,
        outflow: out,
        inflow: infl,
        payer: payer.trim() || null,
        payee: payee.trim() || null,
        date: format(date!, "yyyy-MM-dd"),
        description: notes.trim() || null,
        receipt_urls: receiptUrls.length > 0 ? receiptUrls : null,
        account_id: accountSkipped ? null : accountId || null,
        account_skipped: accountSkipped,
      };

      const res = await createRecord(payload);

      if (res.success) {
        toast.success("记账成功");
        onClose();
        if (onSuccess) onSuccess();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 表单内容（单栏/双栏布局复用，避免字段 JSX 重复）
  const formContent = (
    /* 注意：这是可滚动容器（overflow-y-auto），浏览器会把它当作 BFC 裁切边界。
       内部选项用的是 ring（绘制在元素**外侧** 1.5px），若容器左右 padding 不足，
       描边会被裁掉一截（曾出现「花出去」选项左边框缺失）——所以左右都要留 px-1
       以上余量，且不能用负边距抵消。 */
    <div className="grid max-h-[70vh] gap-5 overflow-y-auto overscroll-contain px-1 py-2">
      {/* 1. 科目分类（必填，下拉面板，按业务模式自动过滤） */}
      <div className="grid gap-2">
        <Label className="text-xs text-muted-foreground">
          科目分类 <span className="text-destructive">*</span>
          <span className="ml-1 text-dove font-normal">· 已按业务模式自动过滤</span>
        </Label>
        <SubjectSelectPanel
          value={subjectId}
          onChange={setSubjectId}
          businessForm={businessForm}
          error={errors.subjectId}
        />
      </div>

      {/* 2. 方向（花出去 / 收进来）+ 金额：单一金额输入，
          从结构上杜绝「一笔记录同时有流出和流入」 */}
      <div className="grid gap-2">
        <Label className="text-xs text-muted-foreground">钱往哪走</Label>
        <div className="grid grid-cols-2 gap-2.5">
          {(
            [
              {
                value: "out" as const,
                title: "花出去",
                sub: "付给房东、施工、税务局",
                tone: "text-money-negative",
              },
              {
                value: "in" as const,
                title: "收进来",
                sub: "收到房款、定金、跟投",
                tone: "text-money-positive",
              },
            ] as const
          ).map((option) => {
            const selected = direction === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setDirection(option.value);
                  // 方向变了，账户语义也变（付款户↔收款户），清空避免挂错
                  setAccountId("");
                  setErrors((prev) => ({ ...prev, account: "", amount: "" }));
                }}
                className={cn(
                  "flex items-start gap-2.5 rounded-inputs px-3 py-2.5 text-left transition-colors",
                  // 用 inset-ring（内描边）而非 ring：ring 画在元素外侧，会被可滚动
                  // 祖先裁剪（曾出现「花出去」左边框缺失），inset-ring 永远绘制在内侧。
                  selected
                    ? "bg-fog inset-ring-[1.5px] inset-ring-ink"
                    : "bg-fog/50 inset-ring-1 inset-ring-dove/25 hover:bg-fog",
                )}
                aria-pressed={selected}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                    selected ? "bg-ink" : "ring-1 ring-dove/50",
                  )}
                  aria-hidden="true"
                >
                  {selected ? <i className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                </span>
                <span>
                  <span className={cn("block text-[13.5px] font-medium", option.tone)}>
                    {option.title}
                  </span>
                  <span className="block text-[11.5px] text-graphite">{option.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2">
        <Label className="text-xs text-muted-foreground">
          <span className={direction === "out" ? "text-money-negative" : "text-money-positive"}>
            {direction === "out" ? "流出金额" : "流入金额"}
          </span>{" "}
          (元) <span className="text-destructive">*</span>
        </Label>
        <div
          className={cn(
            "flex items-stretch overflow-hidden rounded-inputs bg-fog ring-1 transition-colors",
            errors.amount
              ? "inset-ring-[1.5px] inset-ring-destructive"
              : "inset-ring-1 inset-ring-transparent focus-within:inset-ring-ink",
          )}
        >
          <span className="flex items-center border-r border-dove/25 bg-fog px-3 text-[13px] font-semibold text-graphite">
            ¥
          </span>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setErrors((prev) => ({ ...prev, amount: "" }));
            }}
            autoComplete="off"
            className={cn(
              "rounded-none border-0 bg-transparent font-mono tabular-nums focus-visible:ring-0",
              direction === "out" ? "text-money-negative" : "text-money-positive",
            )}
          />
        </div>
        {errors.amount ? (
          <span className="text-[11px] text-destructive">{errors.amount}</span>
        ) : (
          <span className="text-[11px] text-graphite">
            一笔只能记一个方向：要么花出去，要么收进来。
          </span>
        )}
      </div>

      {/* 3. 资金账户（新）：流出=付款账户 / 流入=收款账户 */}
      <AccountPicker
        accounts={accounts}
        lockedHint={!accountSkipped && accounts.length === 0}
        onGoUnlock={() => {
          window.open("/admin/accounts", "_blank", "noopener,noreferrer");
        }}
        direction={direction}
        value={accountId}
        skipped={accountSkipped}
        amount={amountValue}
        onChange={(next) => {
          setAccountId(next);
          setErrors((prev) => ({ ...prev, account: "" }));
        }}
        onToggleSkipped={(next) => {
          setAccountSkipped(next);
          if (next) setAccountId("");
          setErrors((prev) => ({ ...prev, account: "", accountNote: "" }));
        }}
        error={errors.account}
        noteError={errors.accountNote}
      />

      {/* 4. 对方信息：按方向只展示相关的一方
          - 花出去 → 付给谁（收款方 payee）
          - 收进来 → 谁付的（付款方 payer）
          账户块已确定的那一方（付款账户/收款账户）由账户自动带入，这里只填「对方」，
          避免与账户名重复输入。 */}
      <div className="grid gap-2">
        <Label className="text-xs text-muted-foreground">
          {direction === "out" ? "付给谁" : "谁付的"}
          <span className="ml-1.5 font-normal text-dove">选填</span>
        </Label>
        <Input
          value={direction === "out" ? payee : payer}
          onChange={(e) =>
            direction === "out" ? setPayee(e.target.value) : setPayer(e.target.value)
          }
          placeholder={
            direction === "out" ? "房东 / 施工队 / 税务局" : "买家 / 跟投人 / 平台"
          }
          autoComplete="off"
        />
        <span className="text-[11px] text-graphite">
          {direction === "out"
            ? `付款方即所选账户（${selectedAccountName ?? "未选账户"}），这里填收款的一方。`
            : `收款方即所选账户（${selectedAccountName ?? "未选账户"}），这里填付款的一方。`}
        </span>
      </div>

      {/* 4. 发生日期 */}
      <div className="grid gap-2">
        <Label className="text-xs text-muted-foreground">
          发生日期 <span className="text-destructive">*</span>
        </Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full pl-3 text-left font-normal",
                !date && "text-muted-foreground",
                errors.date && "border-destructive",
              )}
            >
              {date ? format(date, "yyyy-MM-dd") : <span>选日期</span>}
              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
          </PopoverContent>
        </Popover>
        {errors.date && <span className="text-[11px] text-destructive">{errors.date}</span>}
      </div>

      {/* 5. 票据上传（支持多张，最多 9 张） */}
      <div className="grid gap-2">
        <Label className="text-xs text-muted-foreground">票据（最多 9 张）</Label>
        <ImageUpload
          key={uploadKey}
          maxCount={9}
          gridCols={3}
          aspectRatio="aspect-video"
          title="点击或拖拽图片上传票据"
          onChange={handleReceiptChange}
        />
      </div>

      {/* 6. 备注 */}
      <div className="grid gap-2">
        <Label className="text-xs text-muted-foreground">备注说明</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="例如：支付首期款…"
          className="h-20 resize-none"
          autoComplete="off"
        />
      </div>
    </div>
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {/* ⚠️ 应收应付模块暂停开放：因科目调整导致数据不准，待后续迭代完成再恢复
          保留 showReceivablePayable state、derivedType、ReceivablePayableTable import 以便恢复 */}
      <DialogContent className="sm:max-w-112.5 rounded-[20px]">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-medium tracking-[-0.009em] text-ink">
            记一笔
          </DialogTitle>
        </DialogHeader>

        {formContent}
        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full bg-ink text-white shadow-sm transition-[background-color,transform] hover:bg-ink/90 active:scale-[0.98] rounded-full"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "确认记账"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RecordDialog;
