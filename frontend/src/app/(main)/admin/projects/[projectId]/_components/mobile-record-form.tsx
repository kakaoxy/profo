"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { createSalesRecordAction } from "../../actions/sales";

interface MobileRecordFormProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  recordType: "viewing" | "offer" | "negotiation";
}

const TYPE_LABEL: Record<MobileRecordFormProps["recordType"], string> = {
  viewing: "带看",
  offer: "出价",
  negotiation: "面谈",
};

const PERSON_LABEL: Record<MobileRecordFormProps["recordType"], string> = {
  viewing: "带看人/机构",
  offer: "出价人",
  negotiation: "面谈对象",
};

export function MobileRecordForm({
  projectId,
  isOpen,
  onClose,
  onSuccess,
  recordType,
}: MobileRecordFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [date, setDate] = useState<Date | undefined>(undefined);
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
    if (!date || !person.trim()) {
      toast.error("请填写完整信息");
      return;
    }

    if (recordType === "offer") {
      const priceNum = Number(price);
      if (!price || !priceNum || priceNum <= 0) {
        toast.error("请输入有效的出价金额");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await createSalesRecordAction({
        projectId: projectId,
        recordType: recordType,
        customerName: person,
        recordDate: format(date, "yyyy-MM-dd"),
        price: recordType === "offer" ? Number(price) : undefined,
        notes: recordType === "negotiation" ? content : undefined,
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
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        className="flex max-h-[85vh] flex-col gap-0 rounded-t-2xl p-0"
      >
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="text-base">
            新增{TYPE_LABEL[recordType]}记录
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {/* 1. 日期 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              日期
            </span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-12 w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? (
                    format(date, "yyyy-MM-dd", { locale: zhCN })
                  ) : (
                    <span>选择日期</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                  locale={zhCN}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* 2. 人员 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {PERSON_LABEL[recordType]}
            </span>
            <Input
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              placeholder="请输入姓名或机构名"
              className="h-12 focus-visible:ring-primary"
            />
          </div>

          {/* 3. 出价金额 (仅出价) */}
          {recordType === "offer" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                出价金额 (万元)
              </span>
              <Input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="h-12 focus-visible:ring-primary"
              />
            </div>
          )}

          {/* 4. 沟通纪要 (仅面谈) */}
          {recordType === "negotiation" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                沟通纪要
              </span>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="记录核心谈判点..."
                className="min-h-24 focus-visible:ring-primary"
              />
            </div>
          )}
        </div>

        <SheetFooter className="border-t border-border bg-card px-4 py-3">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="h-12 w-full bg-success text-base font-semibold text-white hover:brightness-95"
          >
            确认添加
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
