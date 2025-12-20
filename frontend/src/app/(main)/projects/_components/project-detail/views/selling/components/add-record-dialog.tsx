"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

import { createSalesRecordAction } from "../../../../../actions";

interface AddRecordDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultTab: "viewing" | "offer" | "negotiation";
}

export function AddRecordDialog({
  projectId,
  isOpen,
  onClose,
  onSuccess,
  defaultTab,
}: AddRecordDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [person, setPerson] = useState("");
  const [price, setPrice] = useState("");
  const [content, setContent] = useState("");

  // 每次打开弹窗重置表单
  useEffect(() => {
    if (isOpen) {
      setDate(new Date());
      setPerson("");
      setPrice("");
      setContent("");
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!date || !person) {
      toast.error("请填写完整信息");
      return;
    }

    if (defaultTab === "offer" && !price) {
      toast.error("请输入出价金额");
      return;
    }

    setIsSubmitting(true);
    try {
      // [关键修复] 将前端的 "offer" 映射为后端的 "offer"
      const recordTypeMap = {
        viewing: "viewing",
        offer: "offer",
        negotiation: "negotiation",
      };

      const res = await createSalesRecordAction({
        projectId: projectId,
        recordType: recordTypeMap[defaultTab] as
          | "viewing"
          | "offer"
          | "negotiation", // 使用映射后的类型
        customerName: person,
        recordDate: date.toISOString(),
        price: defaultTab === "offer" ? Number(price) : undefined,
        notes: defaultTab === "negotiation" ? content : undefined,
      });

      if (res.success) {
        toast.success("记录已添加");
        onSuccess();
        onClose();
      } else {
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>
            新增
            {defaultTab === "viewing"
              ? "带看"
              : defaultTab === "offer"
              ? "出价"
              : "面谈"}
            记录
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 1. 时间 */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-slate-500">日期时间</span>
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
              {defaultTab === "viewing"
                ? "带看人/机构"
                : defaultTab === "offer"
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
          {defaultTab === "offer" && (
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
          {defaultTab === "negotiation" && (
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
  );
}
