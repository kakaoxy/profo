"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm,  UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { format } from "date-fns";
import { 
  Plus, 
  Loader2, 
  Save, 
  Trash2, 
  Calendar as CalendarIcon 
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

import { createProjectAction } from "../actions";
// 引入自动生成的 API 类型
import { components } from "@/lib/api-types";

// ==========================================
// 1. Zod Schema 定义 (单一事实来源)
// ==========================================

// 辅助：处理数字输入，允许空字符串转为 undefined
const numberInputSchema = z.union([z.string(), z.number()])
  .transform((v) => (v === "" ? undefined : Number(v)))
  .optional();

const formSchema = z.object({
  // --- 必填项 ---
  name: z.string().min(1, "项目名称不能为空").max(200, "名称不能超过200字"),

  // --- 基础信息 ---
  community_name: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  manager: z.string().max(100).optional(),
  tags: z.string().optional(), // 前端用字符串逗号分隔

  // --- 交易数据 ---
  signing_price: numberInputSchema,
  area: numberInputSchema,
  signing_period: numberInputSchema,
  extensionPeriod: numberInputSchema,
  extensionRent: numberInputSchema,

  // --- 业主信息 ---
  owner_name: z.string().max(100).optional(),
  owner_phone: z.string().max(20).optional(),
  owner_id_card: z.string().max(18).optional(),

  // --- 日期 (前端使用 Date 对象，提交时转字符串) ---
  signing_date: z.date().optional(),
  planned_handover_date: z.date().optional(),

  // --- 协议与备注 ---
  costAssumption: z.string().max(50).optional(),
  otherAgreements: z.string().optional(),
  notes: z.string().optional(),
  remarks: z.string().optional(),
});

// 自动推断表单类型
type FormValues = z.infer<typeof formSchema>;

// 后端 API 需要的类型
type ProjectCreateReq = components["schemas"]["ProjectCreate"];

const DRAFT_KEY = "create_project_draft_v2";

// ==========================================
// 2. 主组件
// ==========================================

export function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");

  // 初始化 Form
  // 注意：不要给 useForm 传泛型，让它根据 resolver 自动推断，这是解决类型报错的关键
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      community_name: "",
      address: "",
      manager: "",
      tags: "",
      owner_name: "",
      owner_phone: "",
      owner_id_card: "",
      costAssumption: "",
      otherAgreements: "",
      notes: "",
      remarks: "",
      // 数字和日期字段保持 undefined 即可
    },
  });

  // --- 草稿逻辑 ---
  useEffect(() => {
    if (open) {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          // 恢复 Date 对象
          if (parsed.signing_date) parsed.signing_date = new Date(parsed.signing_date);
          if (parsed.planned_handover_date) parsed.planned_handover_date = new Date(parsed.planned_handover_date);
          form.reset(parsed);
          toast.info("已恢复上次未保存的草稿");
        } catch (e) {
          console.error("Draft parse error", e);
        }
      }
    }
  }, [open, form]);

  useEffect(() => {
    if (!open) return;
    const sub = form.watch((val) => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(val));
    });
    return () => sub.unsubscribe();
  }, [open, form]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
    form.reset({ name: "" }); // 重置为初始状态
    toast.success("草稿已清空");
  }, [form]);

  // --- 提交逻辑 ---
  const onSubmit = async (values: FormValues) => {
    setLoading(true);

    // [类型转换防火墙] 将 FormValues 转换为 ProjectCreateReq
    // 1. 处理 Tags 字符串转数组
    const tagArray = values.tags
      ? values.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
      : null;

    // 2. 构建 Payload
    const payload: ProjectCreateReq = {
      name: values.name,
      community_name: values.community_name || null,
      address: values.address || null,
      manager: values.manager || null,
      tags: tagArray,
      
      // 数字处理：undefined 转 null
      signing_price: values.signing_price ?? null,
      area: values.area ?? null,
      signing_period: values.signing_period ?? null,
      extensionPeriod: values.extensionPeriod ?? null,
      extensionRent: values.extensionRent ?? null,

      // 字符串处理：空串转 null
      owner_name: values.owner_name || null,
      owner_phone: values.owner_phone || null,
      owner_id_card: values.owner_id_card || null,
      costAssumption: values.costAssumption || null,
      otherAgreements: values.otherAgreements || null,
      notes: values.notes || null,
      remarks: values.remarks || null,

      // 日期处理：Date 转 ISO String
      signing_date: values.signing_date?.toISOString() || null,
      planned_handover_date: values.planned_handover_date?.toISOString() || null,
      
      // 暂时不处理的文件字段
      signing_materials: null,
      owner_info: null,
    };

    try {
      const res = await createProjectAction(payload);
      if (res.success) {
        toast.success("项目创建成功");
        localStorage.removeItem(DRAFT_KEY);
        setOpen(false);
        form.reset();
        setActiveTab("basic");
      } else {
        toast.error(res.message || "创建失败");
      }
    } catch (error) {
      toast.error("网络请求错误");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> 新建项目
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[750px] p-0 gap-0 overflow-hidden h-[85vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b bg-white flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>新建项目</DialogTitle>
              <DialogDescription className="mt-1">
                录入新项目信息。支持自动保存草稿。
              </DialogDescription>
            </div>
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

        {/* Body */}
        <div className="flex-1 overflow-hidden bg-slate-50/50">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="h-full flex flex-col">
              
              <Tabs 
                value={activeTab} 
                onValueChange={setActiveTab} 
                className="flex-1 flex flex-col overflow-hidden"
              >
                {/* Tab List */}
                <div className="px-6 pt-4 flex-shrink-0">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="basic">基础信息</TabsTrigger>
                    <TabsTrigger value="transaction">交易数据</TabsTrigger>
                    <TabsTrigger value="owner">业主信息</TabsTrigger>
                    <TabsTrigger value="agreement">合同与备注</TabsTrigger>
                  </TabsList>
                </div>

                {/* Tab Content Area with Scroll */}
                <ScrollArea className="flex-1">
                  <div className="p-6">
                    {/* Tab 1: 基础信息 */}
                    <TabsContent value="basic" className="space-y-5 m-0">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-red-600 after:content-['*'] after:ml-0.5">项目名称</FormLabel>
                            <FormControl>
                              <Input placeholder="例如：中远两湾城-3-201" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="community_name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>小区名称</FormLabel>
                              <FormControl>
                                <Input placeholder="输入小区..." {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="manager"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>负责人</FormLabel>
                              <FormControl>
                                <Input placeholder="项目经理" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>详细地址</FormLabel>
                            <FormControl>
                              <Input placeholder="街道/楼栋/门牌号" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="tags"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>标签</FormLabel>
                            <FormControl>
                              <Input placeholder="急售, 学区 (逗号分隔)" {...field} />
                            </FormControl>
                            <FormDescription>
                              多个标签请用逗号或中文逗号分隔
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TabsContent>

                    {/* Tab 2: 交易数据 */}
                    <TabsContent value="transaction" className="space-y-5 m-0">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="signing_price"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>签约价格 (万)</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="area"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>产证面积 (㎡)</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="signing_period"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>签约周期 (天)</FormLabel>
                              <FormControl>
                                <Input type="number" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="extensionPeriod"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>顺延期 (月)</FormLabel>
                              <FormControl>
                                <Input type="number" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="extensionRent"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>顺延期租金 (元/月)</FormLabel>
                            <FormControl>
                              <Input type="number" step="100" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TabsContent>

                    {/* Tab 3: 业主信息 */}
                    <TabsContent value="owner" className="space-y-5 m-0">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="owner_name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>业主姓名</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="owner_phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>联系电话</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="owner_id_card"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>身份证号</FormLabel>
                            <FormControl>
                              <Input placeholder="18位身份证号" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TabsContent>

                    {/* Tab 4: 合同与备注 */}
                    <TabsContent value="agreement" className="space-y-5 m-0">
                      <div className="grid grid-cols-2 gap-4">
                        <DatePickerField 
                          form={form} 
                          name="signing_date" 
                          label="签约日期" 
                        />
                        <DatePickerField 
                          form={form} 
                          name="planned_handover_date" 
                          label="计划交房时间" 
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="costAssumption"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>税费及佣金承担</FormLabel>
                            <FormControl>
                              <Input placeholder="如：各付各税" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="otherAgreements"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>其他约定</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>内部备注</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="仅内部可见..." 
                                className="resize-none min-h-[80px]" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="remarks"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>公开备注</FormLabel>
                            <FormControl>
                              <Input placeholder="对外可见..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TabsContent>
                  </div>
                </ScrollArea>
              </Tabs>

              {/* Footer */}
              <DialogFooter className="px-6 py-4 border-t bg-white flex-shrink-0">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
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

// ==========================================
// 3. 辅助组件
// ==========================================

interface DatePickerProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>; 
  name: string; // 不再限制具体字段名，增加通用性
  label: string;
}

function DatePickerField({ form, name, label }: DatePickerProps) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormLabel>{label}</FormLabel>
          <Popover>
            <PopoverTrigger asChild>
              <FormControl>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full pl-3 text-left font-normal",
                    !field.value && "text-muted-foreground"
                  )}
                >
                  {field.value ? (
                    format(new Date(field.value), "yyyy-MM-dd")
                  ) : (
                    <span>选择日期</span>
                  )}
                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={field.value ? new Date(field.value) : undefined}
                onSelect={field.onChange}
                disabled={(date) =>
                  date < new Date("1900-01-01")
                }
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}