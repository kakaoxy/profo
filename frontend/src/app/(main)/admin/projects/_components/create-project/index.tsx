"use client";

import { useMemo } from "react";
import { Plus, Loader2, Save, Trash2, AlertCircle, Lock, Check, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";

// 引入逻辑 Hook
import { useCreateProject } from "./use-create-project";

// 引入拆分后的 Tab 组件
import { BasicInfoTab } from "./tabs/basic-info-tab";
import { AgencyAgreementTab } from "./tabs/agency-agreement-tab";
import { OwnerTab } from "./tabs/owner-tab";

import { Project } from "../../types";

interface CreateProjectDialogProps {
  project?: Project;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateProjectDialog({
  project,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onSuccess,
}: CreateProjectDialogProps = {}) {
  const {
    form,
    open,
    setOpen,
    loading,
    activeTab,
    setActiveTab,
    clearDraft,
    saveDraft,
    onSubmit,
    isEditMode,
  } = useCreateProject({
    project,
    onSuccess,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
  });

  // 使用 useMemo 缓存错误列表，避免每次渲染重新计算
  const errorEntries = useMemo(
    () => Object.entries(form.formState.errors),
    [form.formState.errors],
  );

  const hasErrors = errorEntries.length > 0;

  // 已售项目限制：后端只允许修改部分字段，其余字段修改会被静默丢弃
  const isSoldProject = isEditMode && project?.status === "sold";

  const steps = [
    { value: "basic", label: "基础信息", hint: "房源 · 面积 · 户型" },
    { value: "agency", label: "代理协议", hint: "合同 · 价格 · 周期" },
    { value: "owner", label: "业主信息", hint: "户号 · 产权人" },
  ] as const;
  const stepIndex = Math.max(0, steps.findIndex((step) => step.value === activeTab));
  const isLastStep = activeTab === "owner";
  const nextStep = () => setActiveTab(steps[Math.min(steps.length - 1, stepIndex + 1)].value);
  const prevStep = () => setActiveTab(steps[Math.max(0, stepIndex - 1)].value);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="mr-2 h-4 w-4" /> 新建项目
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        className={cn(
          "gap-0 overflow-hidden rounded-cards border-dove/40 p-0",
          isEditMode
            ? "flex h-[85vh] flex-col sm:max-w-187.5"
            : "h-[min(900px,92vh)] w-[calc(100vw-32px)] max-w-[1160px] p-0 sm:max-w-[1160px]",
        )}
      >
        <div className={cn("h-full min-h-0", isEditMode ? "flex flex-col" : "flex")}>
          {!isEditMode && (
            <aside className="hidden w-[258px] shrink-0 flex-col border-r border-[#ececef] bg-fog px-6 py-7 md:flex">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-[15px] font-[480] text-pure-white">P</span>
                <div>
                  <p className="text-[13px] font-[480] text-ink">项目管理</p>
                  <p className="text-[11px] font-[430] text-graphite">新建项目档案</p>
                </div>
              </div>
              <div className="mt-10 space-y-1" role="tablist" aria-orientation="vertical">
                {steps.map((step, index) => {
                  const active = index === stepIndex;
                  const done = index < stepIndex;
                  return (
                    <button
                      key={step.value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      data-state={active ? "active" : "inactive"}
                      onClick={() => setActiveTab(step.value)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-inputs px-2 py-3 text-left transition-colors",
                        active && "bg-pure-white shadow-[0_1px_2px_rgba(23,25,28,0.04)]",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border text-[11px] font-[480]",
                          active && "border-rust bg-rust text-pure-white",
                          done && "border-ink bg-ink text-pure-white",
                          !active && !done && "border-[#d8d8dc] bg-transparent text-dove",
                        )}
                      >
                        {done ? <Check className="h-3 w-3" /> : String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0">
                        <span className={cn("block text-[13px] font-[480]", active ? "text-ink" : "text-ash")}>{step.label}</span>
                        <span className="mt-1 block text-[11px] font-[430] text-graphite">{step.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-auto rounded-inputs border border-[#e8e8eb] bg-pure-white p-4">
                <p className="text-[12px] font-[480] text-ink">填写提示</p>
                <p className="mt-1.5 text-[11px] leading-relaxed font-[430] text-graphite">
                  带 * 为必填项；离开前会自动保存草稿，下次打开可继续填写。
                </p>
              </div>
            </aside>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
        {/* --- Header --- */}
        <DialogHeader className="px-7 py-5 border-b border-dove/30 bg-pure-white shrink-0">
          <div className="flex items-center justify-between">
            <div>
              {!isEditMode && (
                <p className="mb-2 text-[10px] font-[480] uppercase tracking-[0.16em] text-rust">
                  New Project · Step {String(stepIndex + 1).padStart(2, "0")} / 03
                </p>
              )}
              <DialogTitle className="font-signifier text-[26px] font-[450] leading-tight tracking-[-0.01em] text-ink">
                {project ? "编辑项目" : "新建项目"}
              </DialogTitle>
              <DialogDescription className="mt-1.5 text-graphite text-[13px] font-normal">
                {project ? "修改项目详细信息。" : "录入房源与合同信息，建立新的项目档案。"}
              </DialogDescription>
            </div>
            {/* 顶部工具栏：仅在新建模式显示草稿控制 */}
            {!isEditMode && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearDraft}
                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] text-graphite hover:text-error hover:bg-error/5 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  清空
                </button>
                <div className="flex items-center rounded-full bg-success/10 px-3 py-1.5 text-[13px] font-medium text-success">
                  <Save className="mr-1.5 h-3 w-3" />
                  自动保存中
                </div>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* 已售项目限制提示 */}
        {isSoldProject && (
          <div className="mx-7 mt-4 mb-0 shrink-0 rounded-inputs border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-2.5">
            <Lock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-[13px] text-amber-800 leading-relaxed">
              <div className="font-medium mb-0.5">此项目已售，部分字段不可修改</div>
              <div className="text-amber-700">
                仅可更新：小区、地址、面积、户型、朝向、楼层、户号、备注、业主信息。其他字段（如业务形式、合同、签约信息等）的修改将不会保存。
              </div>
            </div>
          </div>
        )}

        {/* --- Body --- */}
        <div className="flex-1 min-h-0 overflow-hidden bg-fog">
          <Form {...form}>
            <form onSubmit={onSubmit} className="h-full flex flex-col">
              {/* 表单错误提示 */}
              {hasErrors && (
                <Alert
                  variant="destructive"
                  className="mx-7 mt-5 mb-0 shrink-0 rounded-inputs border-dove/40"
                >
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    表单验证失败，请检查以下字段：
                    {errorEntries.map(([key, error]) => (
                      <div key={key} className="text-sm mt-1">
                        • {key}: {error?.message as string}
                      </div>
                    ))}
                  </AlertDescription>
                </Alert>
              )}
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="flex-1 min-h-0 flex flex-col overflow-hidden"
              >
                {!isEditMode && (
                  <div className="flex gap-1 overflow-x-auto px-7 pt-4 md:hidden" role="tablist">
                    {steps.map((step, index) => (
                      <button
                        key={step.value}
                        type="button"
                        role="tab"
                        aria-selected={index === stepIndex}
                        data-state={index === stepIndex ? "active" : "inactive"}
                        onClick={() => setActiveTab(step.value)}
                        className={cn(
                          "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-[480]",
                          index === stepIndex ? "bg-ink text-pure-white" : "bg-pure-white text-graphite",
                        )}
                      >
                        {index + 1}. {step.label}
                      </button>
                    ))}
                  </div>
                )}
                {/* Tabs 导航 — Steep: pill-style tabs on Fog canvas */}
                <div className={cn("px-7 pt-5 shrink-0", !isEditMode && "hidden")}>
                  <TabsList className="grid w-full grid-cols-3 gap-1 bg-pure-white rounded-inputs p-1 border border-dove/30 h-10">
                    <TabsTrigger
                      value="basic"
                      className="rounded-images text-[14px] font-medium data-[state=active]:bg-ink data-[state=active]:text-pure-white data-[state=active]:shadow-none data-[state=active]:hover:bg-ink/90"
                    >
                      基础信息
                    </TabsTrigger>
                    <TabsTrigger
                      value="agency"
                      className="rounded-images text-[14px] font-medium data-[state=active]:bg-ink data-[state=active]:text-pure-white data-[state=active]:shadow-none data-[state=active]:hover:bg-ink/90"
                    >
                      代理协议
                    </TabsTrigger>
                    <TabsTrigger
                      value="owner"
                      className="rounded-images text-[14px] font-medium data-[state=active]:bg-ink data-[state=active]:text-pure-white data-[state=active]:shadow-none data-[state=active]:hover:bg-ink/90"
                    >
                      业主信息
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Tabs 内容区域
                    ⚠️ 内层容器必须 relative（建立包含块）：ScrollArea 根只有 `relative`，
                    内容中 RadioGroupItem 等 sr-only 绝对定位元素若无更近的定位祖先，
                    会以 ScrollArea 根为包含块，把根的 scrollHeight 撑大于 clientHeight，
                    使根成为可滚动区域；点选朝向/业务形式时浏览器对聚焦元素的
                    scroll-into-view 会滚动它（实为 Tabs 祖先链），tabbar 被顶出弹窗、
                    内容整体位移。回归用例：e2e/admin-project-create-dialog-scroll.spec.ts */}
                <ScrollArea className="flex-1 min-h-0">
                  <div className="relative p-7">
                    <TabsContent value="basic" className="m-0">
                      <BasicInfoTab form={form} />
                    </TabsContent>

                    <TabsContent value="agency" className="m-0">
                      <AgencyAgreementTab form={form} />
                    </TabsContent>

                    <TabsContent value="owner" className="m-0">
                      {/* onSave(草稿手动保存)仅新建模式传入；编辑模式传入会把当前项目数据写入草稿，
                          下次新建时被恢复逻辑读回，造成跨项目数据残留（含业主手机号/身份证等敏感信息） */}
                      <OwnerTab form={form} onSave={!isEditMode ? saveDraft : undefined} />
                    </TabsContent>
                  </div>
                </ScrollArea>
              </Tabs>

              {/* --- Footer — Steep: one filled CTA + text link secondary */}
              <DialogFooter className="px-7 py-4 border-t border-dove/30 bg-pure-white shrink-0">
                {!isEditMode ? (
                  <div className="flex w-full items-center justify-between gap-4">
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-[430] text-graphite">
                      <Save className="h-3.5 w-3.5" />
                      草稿已自动保存 · {stepIndex + 1}/3
                    </span>
                    <div className="flex items-center gap-2">
                      {stepIndex > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={prevStep}
                          className="rounded-full px-4 text-[14px] font-[450] text-graphite hover:bg-fog hover:text-ink"
                        >
                          <ChevronLeft className="mr-1 h-4 w-4" /> 上一步
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setOpen(false)}
                        className="rounded-full px-4 text-[14px] font-[450] text-graphite hover:bg-fog hover:text-ink"
                      >
                        取消
                      </Button>
                      {!isLastStep ? (
                        <Button
                          type="button"
                          onClick={nextStep}
                          className="rounded-full border-0 bg-ink px-6 text-[14px] font-[450] text-pure-white shadow-none hover:bg-ink/90"
                        >
                          下一步：{steps[stepIndex + 1].label}
                        </Button>
                      ) : (
                        <Button
                          type="submit"
                          disabled={loading}
                          className="rounded-full border-0 bg-ink px-6 text-[14px] font-[450] text-pure-white shadow-none hover:bg-ink/90"
                        >
                          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          创建项目
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setOpen(false)}
                      className="rounded-full px-4 text-[14px] font-medium text-graphite hover:bg-fog hover:text-ink"
                    >
                      取消
                    </Button>
                    <Button
                      type="submit"
                      disabled={loading}
                      className="rounded-full border-0 bg-ink px-6 text-[14px] font-medium text-pure-white shadow-none hover:bg-ink/90"
                    >
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      保存修改
                    </Button>
                  </div>
                )}
              </DialogFooter>
            </form>
          </Form>
        </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
