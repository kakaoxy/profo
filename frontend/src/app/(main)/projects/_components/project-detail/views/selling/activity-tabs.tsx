"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Trash2, Plus, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Project, SalesRecord } from "../../../../types";
import {
  createSalesRecordAction,
  deleteSalesRecordAction,
} from "../../../../actions";

interface ActivityTabsProps {
  project: Project;
  onRefresh?: () => void;
}

type TabType = "viewing" | "bid" | "negotiation";

export function ActivityTabs({ project, onRefresh }: ActivityTabsProps) {
  // 1. 获取并标准化记录
  const records: SalesRecord[] = project.sales_records || [];

  // 2. 状态管理
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("viewing");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 表单状态
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [person, setPerson] = useState("");
  const [price, setPrice] = useState("");
  const [content, setContent] = useState("");

  // 3. 提交逻辑
  const handleSubmit = async () => {
    if (!date || !person) {
      toast.error("请填写完整信息");
      return;
    }

    // 出价 Tab 必须填价格
    if (activeTab === "bid" && !price) {
      toast.error("请输入出价金额");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createSalesRecordAction({
        projectId: project.id,
        recordType: activeTab,
        customerName: person,
        recordDate: date.toISOString(),
        price: activeTab === "bid" ? Number(price) : undefined,
        notes: activeTab === "negotiation" ? content : undefined,
      });

      if (res.success) {
        toast.success("记录已添加");
        setIsDialogOpen(false);
        // 重置表单
        setPerson("");
        setPrice("");
        setContent("");
        setDate(new Date());
        if (onRefresh) onRefresh();
      } else {
        // [修复 1] 处理后端返回的 message 可能是验证错误数组的情况
        const errorMsg =
          typeof res.message === "string"
            ? res.message
            : "提交失败：数据格式校验错误";
        toast.error(errorMsg);
      }
    } catch {
      toast.error("提交失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. 删除逻辑
  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这条记录吗？")) return;
    try {
      const res = await deleteSalesRecordAction(project.id, id);
      if (res.success) {
        toast.success("删除成功");
        if (onRefresh) onRefresh();
      } else {
        // [修复 2] 处理后端返回的 message 可能是验证错误数组的情况
        const errorMsg =
          typeof res.message === "string" ? res.message : "删除失败";
        toast.error(errorMsg);
      }
    } catch {
      toast.error("删除失败");
    }
  };

  // 5. 数据过滤与排序 (降序: 新的在前)
  const sortByDate = (a: SalesRecord, b: SalesRecord) =>
    new Date(b.record_date).getTime() - new Date(a.record_date).getTime();

  const viewings = records
    .filter((r) => r.record_type === "viewing")
    .sort(sortByDate);

  // 兼容 offer 和 bid
  const bids = records
    .filter((r) => r.record_type === "bid" || r.record_type === "offer")
    .sort(sortByDate);
  const maxBidPrice =
    bids.length > 0 ? Math.max(...bids.map((b) => b.price || 0)) : 0;

  const talks = records
    .filter((r) => r.record_type === "negotiation")
    .sort(sortByDate);

  return (
    <div className="space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">销售活动记录</h3>
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          onClick={() => setIsDialogOpen(true)}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          新增记录
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabType)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3 bg-slate-100 h-9 p-1">
          <TabsTrigger
            value="viewing"
            className="text-xs data-[state=active]:bg-white data-[state=active]:text-emerald-700"
          >
            带看记录
          </TabsTrigger>
          <TabsTrigger
            value="bid"
            className="text-xs data-[state=active]:bg-white data-[state=active]:text-emerald-700"
          >
            出价记录
          </TabsTrigger>
          <TabsTrigger
            value="negotiation"
            className="text-xs data-[state=active]:bg-white data-[state=active]:text-emerald-700"
          >
            面谈记录
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: 带看 (Table) */}
        <TabsContent value="viewing" className="mt-4">
          <div className="rounded-md border border-slate-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="w-[120px] text-xs">时间</TableHead>
                  <TableHead className="text-xs">带看人/机构</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {viewings.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-xs text-muted-foreground py-8"
                    >
                      暂无数据
                    </TableCell>
                  </TableRow>
                ) : (
                  viewings.map((item) => (
                    <TableRow
                      key={item.id}
                      className="text-xs hover:bg-slate-50"
                    >
                      <TableCell className="text-muted-foreground font-mono">
                        {format(parseISO(item.record_date), "MM-dd HH:mm")}
                      </TableCell>
                      <TableCell className="font-medium text-slate-700">
                        {item.customer_name}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Tab 2: 出价 (Cards) */}
        <TabsContent value="bid" className="mt-4 space-y-2">
          {bids.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8 border border-dashed border-slate-200 rounded-md">
              暂无出价
            </div>
          ) : (
            bids.map((item) => {
              const isMax = (item.price || 0) === maxBidPrice;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border bg-white transition-all",
                    isMax
                      ? "border-red-100 shadow-sm ring-1 ring-red-50"
                      : "border-slate-100"
                  )}
                >
                  <div className="flex flex-col">
                    <span
                      className={cn(
                        "text-sm font-bold",
                        isMax
                          ? "text-red-600 flex items-center gap-1"
                          : "text-slate-700"
                      )}
                    >
                      ¥{item.price}万{" "}
                      {isMax && (
                        <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded font-normal">
                          最高
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex flex-col text-right mr-4 flex-1">
                    <span className="text-xs font-medium text-slate-700">
                      {item.customer_name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(parseISO(item.record_date), "MM-dd HH:mm")}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-slate-300 hover:text-red-500 p-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </TabsContent>

        {/* Tab 3: 面谈 (Timeline) */}
        <TabsContent value="negotiation" className="mt-4">
          <div className="relative pl-4 space-y-6 pb-2">
            <div className="absolute left-[5px] top-2 bottom-2 w-0.5 bg-slate-200" />
            {talks.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-8 ml-[-1rem]">
                暂无面谈
              </div>
            ) : (
              talks.map((item) => (
                <div key={item.id} className="relative pl-4 group">
                  <div className="absolute left-[-4px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-emerald-500 bg-white group-hover:bg-emerald-500 transition-colors z-10" />
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground font-mono">
                        {format(parseISO(item.record_date), "yyyy/MM/dd HH:mm")}
                      </span>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="text-sm font-bold text-slate-800">
                      {item.customer_name}
                    </div>
                    {item.notes && (
                      <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded mt-1 border border-slate-100">
                        {item.notes}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* 新增记录弹窗 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              新增
              {activeTab === "viewing"
                ? "带看"
                : activeTab === "bid"
                ? "出价"
                : "面谈"}
              记录
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* 1. 时间 */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-slate-500">
                日期时间
              </span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? (
                      format(date, "yyyy-MM-dd HH:mm")
                    ) : (
                      <span>选择时间</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* 2. 人名 */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-slate-500">
                {activeTab === "viewing"
                  ? "带看人/机构"
                  : activeTab === "bid"
                  ? "出价人"
                  : "面谈对象"}
              </span>
              <Input
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                placeholder="请输入姓名或机构名"
                className="focus-visible:ring-emerald-500"
              />
            </div>

            {/* 3. 出价金额 (仅出价) */}
            {activeTab === "bid" && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-slate-500">
                  出价金额 (万元)
                </span>
                <Input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  className="focus-visible:ring-emerald-500"
                />
              </div>
            )}

            {/* 4. 面谈内容 (仅面谈) */}
            {activeTab === "negotiation" && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-slate-500">
                  沟通纪要
                </span>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="记录核心谈判点..."
                  className="h-20 focus-visible:ring-emerald-500"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 w-full text-white"
            >
              确认添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
