"use client";

import { useMemo } from "react";
import { Plus, Loader2, Save, Trash2, AlertCircle } from "lucide-react";
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
import { AttachmentsTab } from "./tabs/attachments-tab";

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
    [form.formState.errors]
  );

  const hasErrors = errorEntries.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
           <Button>
             <Plus className="mr-2 h-4 w-4" /> 新建项目
           </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[750px] p-0 gap-0 overflow-hidden h-[85vh] flex flex-col rounded-cards border-dove/40">
        {/* --- Header --- */}
        <DialogHeader className="px-7 py-5 border-b border-dove/30 bg-pure-white shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-foreground font-sohne font-medium text-[18px] tracking-tight">
                {project ? "编辑项目" : "新建项目"}
              </DialogTitle>
              <DialogDescription className="mt-1.5 text-graphite text-[14px] font-normal">
                {project ? "修改项目详细信息。" : "录入新项目信息。支持自动保存草稿。"}
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

        {/* --- Body --- */}
        <div className="flex-1 min-h-0 overflow-hidden bg-fog">
          <Form {...form}>
            <form onSubmit={onSubmit} className="h-full flex flex-col">
              {/* 表单错误提示 */}
              {hasErrors && (
                <Alert variant="destructive" className="mx-7 mt-5 mb-0 shrink-0 rounded-inputs border-dove/40">
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
                {/* Tabs 导航 — Steep: pill-style tabs on Fog canvas */}
                <div className="px-7 pt-5 shrink-0">
                <TabsList className="grid w-full grid-cols-4 gap-1 bg-pure-white rounded-inputs p-1 border border-dove/30 h-10">
                    <TabsTrigger value="basic" className="rounded-[12px] text-[14px] font-medium data-[state=active]:bg-ink data-[state=active]:text-pure-white data-[state=active]:shadow-none data-[state=active]:hover:bg-ink/90">基础信息</TabsTrigger>
                    <TabsTrigger value="agency" className="rounded-[12px] text-[14px] font-medium data-[state=active]:bg-ink data-[state=active]:text-pure-white data-[state=active]:shadow-none data-[state=active]:hover:bg-ink/90">代理协议</TabsTrigger>
                    <TabsTrigger value="owner" className="rounded-[12px] text-[14px] font-medium data-[state=active]:bg-ink data-[state=active]:text-pure-white data-[state=active]:shadow-none data-[state=active]:hover:bg-ink/90">业主信息</TabsTrigger>
                    <TabsTrigger value="attachments" className="rounded-[12px] text-[14px] font-medium data-[state=active]:bg-ink data-[state=active]:text-pure-white data-[state=active]:shadow-none data-[state=active]:hover:bg-ink/90">附件上传</TabsTrigger>
                  </TabsList>
                </div>

                {/* Tabs 内容区域 */}
                <ScrollArea className="flex-1 min-h-0">
                  <div className="p-7">
                    <TabsContent value="basic" className="m-0">
                      <BasicInfoTab form={form} />
                    </TabsContent>

                    <TabsContent value="agency" className="m-0">
                      <AgencyAgreementTab form={form} />
                    </TabsContent>

                    <TabsContent value="owner" className="m-0">
                      <OwnerTab form={form} onSave={saveDraft} />
                    </TabsContent>

                    <TabsContent value="attachments" className="m-0">
                      <AttachmentsTab form={form} />
                    </TabsContent>
                  </div>
                </ScrollArea>
              </Tabs>

              {/* --- Footer — Steep: one filled CTA + text link secondary */}
              <DialogFooter className="px-7 py-4 border-t border-dove/30 bg-pure-white shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  className="text-graphite hover:text-ink hover:bg-transparent text-[14px] font-medium px-4"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-ink hover:bg-ink/90 text-pure-white rounded-full px-6 font-medium text-[14px] shadow-none border-0"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEditMode ? "保存修改" : "创建项目"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
