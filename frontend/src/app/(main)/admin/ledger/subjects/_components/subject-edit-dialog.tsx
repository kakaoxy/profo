"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createSubjectSchema,
  LEVEL_LABELS,
  STAGE_META,
  type Subject,
  type SubjectFormValues,
  type SubjectLevel,
  type SubjectMode,
  type SubjectStage,
} from "./subject-schema";
import { createSubject, updateSubject } from "../actions";

interface SubjectEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = 新增；对象 = 编辑 */
  subject: Subject | null;
  defaultStage?: SubjectStage;
  defaultMode?: SubjectMode;
}

/**
 * 科目编辑/新增弹窗
 *
 * - 系统预置科目(system=true)的名称与层级 disabled
 * - 业务阶段可选项随已选业务模式动态变化（模式阶段并集）
 * - 使用 shadcn/ui Dialog + Form + Select + Switch
 */
export function SubjectEditDialog({
  open,
  onOpenChange,
  subject,
  defaultStage,
  defaultMode,
}: SubjectEditDialogProps) {
  const isEdit = !!subject;
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<SubjectFormValues>({
    resolver: zodResolver(createSubjectSchema),
    defaultValues: {
      name: "",
      level: "3",
      pnl: true,
      modes: [defaultMode ?? "agent"],
      stage: defaultStage ?? "signing",
      note: "",
    },
  });

  // 打开时按 subject/default 重置表单
  useEffect(() => {
    if (!open) return;
    form.reset({
      name: subject?.name ?? "",
      level: subject?.level ?? "3",
      pnl: subject?.pnl ?? true,
      // FinanceSubjectResponse.modes 为 string[]，表单需 SubjectMode[]，后端保证值为 agent/acquire
      modes: (subject?.modes as SubjectMode[]) ?? [defaultMode ?? "agent"],
      stage: subject?.stage ?? defaultStage ?? "signing",
      note: subject?.note ?? "",
    });
  }, [open, subject, defaultStage, defaultMode, form]);

  const watchedModes = form.watch("modes");

  // 可选阶段 = 已选模式的阶段并集（保持顺序）
  const availableStages = useMemo(() => {
    const seen = new Set<SubjectStage>();
    const result: { key: SubjectStage; name: string; sub: string; icon: string }[] = [];
    watchedModes.forEach((m) => {
      STAGE_META[m].forEach((s) => {
        if (!seen.has(s.key)) {
          seen.add(s.key);
          result.push(s);
        }
      });
    });
    return result;
  }, [watchedModes]);

  // 当前 stage 不在可选列表中时重置为第一个
  useEffect(() => {
    const current = form.getValues("stage");
    if (availableStages.length > 0 && !availableStages.some((s) => s.key === current)) {
      form.setValue("stage", availableStages[0].key);
    }
  }, [availableStages, form]);

  function toggleMode(m: SubjectMode) {
    const current = form.getValues("modes");
    const has = current.includes(m);
    if (has && current.length === 1) return; // 至少保留一个
    const next = has ? current.filter((x) => x !== m) : [...current, m];
    form.setValue("modes", next, { shouldDirty: true });
  }

  async function onSubmit(values: SubjectFormValues): Promise<void> {
    setSubmitting(true);
    try {
      const note = (values.note ?? "").trim();
      const payload = { ...values, note: note ? note : null };
      const res = isEdit ? await updateSubject(subject!.id, payload) : await createSubject(payload);
      if (res.success) {
        toast.success(isEdit ? "已保存" : "已新增科目");
        onOpenChange(false);
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error(isEdit ? "保存失败，请稍后重试" : "新增失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  const systemLocked = !!subject?.system;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 px-6 pb-2 pt-6">
          <DialogTitle>{isEdit ? "编辑科目" : "新增科目"}</DialogTitle>
          <DialogDescription className="text-xs">
            {isEdit
              ? "系统预置科目的名称与层级不可修改"
              : "新增用户自定义科目，选择适用的业务模式与阶段"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {/* 科目名称 */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      科目名称 <span className="text-rust">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="如：购房定金"
                        disabled={systemLocked}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    {systemLocked && <FormDescription>系统预置科目名称不可修改</FormDescription>}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 归入成本层级 */}
              <FormField
                control={form.control}
                name="level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      归入成本层级 <span className="text-rust">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={systemLocked}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(Object.entries(LEVEL_LABELS) as [SubjectLevel, string][]).map(
                          ([k, v]) => (
                            <SelectItem key={k} value={k}>
                              {v}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                    {systemLocked && <FormDescription>系统预置科目层级不可修改</FormDescription>}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 适用业务模式 */}
              <FormField
                control={form.control}
                name="modes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      适用业务模式 <span className="text-rust">*</span>
                    </FormLabel>
                    <div className="flex gap-2">
                      <ModeChip
                        active={field.value.includes("agent")}
                        onClick={() => toggleMode("agent")}
                      >
                        代理
                      </ModeChip>
                      <ModeChip
                        active={field.value.includes("acquire")}
                        onClick={() => toggleMode("acquire")}
                      >
                        收购
                      </ModeChip>
                    </div>
                    <FormDescription>至少选择一种，决定该科目在哪种业务流中可见</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 业务阶段 */}
              <FormField
                control={form.control}
                name="stage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      业务阶段 <span className="text-rust">*</span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableStages.map((s) => (
                          <SelectItem key={s.key} value={s.key}>
                            {s.icon} {s.name} · {s.sub}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>该科目主要发生的业务阶段</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 是否进损益 */}
              <FormField
                control={form.control}
                name="pnl"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">是否进损益</FormLabel>
                      <FormDescription>
                        {field.value ? "计入利润表，影响毛利/净利" : "现金流专属，不影响损益"}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* 备注 */}
              <FormField
                control={form.control}
                name="note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>备注</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="如：仅代理 · 差价×1%"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="shrink-0 gap-2 border-t bg-card px-6 py-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-rust text-pure-white hover:bg-rust/90"
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? "保存" : "新增"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ModeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-rust bg-apricot-wash/60 text-rust"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
