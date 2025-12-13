"use client";

import { Plus, Loader2, Save, Trash2 } from "lucide-react";
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

// 引入逻辑 Hook
import { useCreateProject } from "./use-create-project";

// 引入拆分后的 Tab 组件
import { BasicInfoTab } from "./tabs/basic-info-tab";
import { TransactionTab } from "./tabs/transaction-tab";
import { OwnerTab } from "./tabs/owner-tab";
import { AgreementTab } from "./tabs/agreement-tab";
import { AttachmentsTab } from "./tabs/attachments-tab";

export function CreateProjectDialog() {
  // 一行代码获取所有逻辑
  const {
    form,
    open,
    setOpen,
    loading,
    activeTab,
    setActiveTab,
    clearDraft,
    onSubmit,
  } = useCreateProject();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> 新建项目
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[750px] p-0 gap-0 overflow-hidden h-[85vh] flex flex-col">
        {/* --- Header --- */}
        <DialogHeader className="px-6 py-4 border-b bg-white flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>新建项目</DialogTitle>
              <DialogDescription className="mt-1">
                录入新项目信息。支持自动保存草稿。
              </DialogDescription>
            </div>
            {/* 顶部工具栏：清空 & 状态提示 */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearDraft}
                className="h-8 text-xs text-muted-foreground hover:text-red-600"
              >
                <Trash2 className="mr-1 h-3 w-3" />
                清空
              </Button>
              <div className="flex items-center rounded-full bg-green-50 px-2 py-1 text-xs text-green-600">
                <Save className="mr-1 h-3 w-3" />
                自动保存中
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* --- Body --- */}
        <div className="flex-1 overflow-hidden bg-slate-50/50">
          <Form {...form}>
            <form onSubmit={onSubmit} className="h-full flex flex-col">
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="flex-1 flex flex-col overflow-hidden"
              >
                {/* Tabs 导航 */}
                <div className="px-6 pt-4 flex-shrink-0">
                <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="basic">基础信息</TabsTrigger>
                    <TabsTrigger value="transaction">交易数据</TabsTrigger>
                    <TabsTrigger value="owner">业主信息</TabsTrigger>
                    <TabsTrigger value="agreement">合同与备注</TabsTrigger>
                    <TabsTrigger value="attachments">附件上传</TabsTrigger>
                  </TabsList>
                </div>

                {/* Tabs 内容区域 */}
                <ScrollArea className="flex-1">
                  <div className="p-6">
                    <TabsContent value="basic" className="m-0">
                      <BasicInfoTab form={form} />
                    </TabsContent>

                    <TabsContent value="transaction" className="m-0">
                      <TransactionTab form={form} />
                    </TabsContent>

                    <TabsContent value="owner" className="m-0">
                      <OwnerTab form={form} />
                    </TabsContent>

                    <TabsContent value="agreement" className="m-0">
                      <AgreementTab form={form} />
                    </TabsContent>

                    <TabsContent value="attachments" className="m-0">
                      <AttachmentsTab form={form} />
                    </TabsContent>
                  </div>
                </ScrollArea>
              </Tabs>

              {/* --- Footer --- */}
              <DialogFooter className="px-6 py-4 border-t bg-white flex-shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  取消
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  创建项目
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
