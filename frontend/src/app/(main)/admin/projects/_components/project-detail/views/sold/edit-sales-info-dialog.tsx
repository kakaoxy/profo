"use client";

import { useEffect, useState } from "react";
import { format, parseISO, isValid } from "date-fns";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { Project } from "../../../../types";
import { updateProjectAction } from "../../../../actions/core";

interface EditSalesInfoDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

// 将后端日期字符串(YYYY-MM-DD 或 ISO)解析为 Date，无效/空值返回 undefined
function parseDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const d = parseISO(value.split("T")[0]);
  return isValid(d) ? d : undefined;
}

export function EditSalesInfoDialog({
  project,
  open,
  onOpenChange,
  onSuccess,
}: EditSalesInfoDialogProps) {
  const [soldPrice, setSoldPrice] = useState("");
  const [soldDate, setSoldDate] = useState<Date | undefined>(undefined);
  const [listPrice, setListPrice] = useState("");
  const [listingDate, setListingDate] = useState<Date | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  // 每次打开时用当前值预填
  useEffect(() => {
    if (open) {
      setSoldPrice(project.sold_price ? String(project.sold_price) : "");
      setSoldDate(parseDate(project.sold_date));
      setListPrice(project.list_price ? String(project.list_price) : "");
      setListingDate(parseDate(project.listing_date));
    }
  }, [open, project.sold_price, project.sold_date, project.list_price, project.listing_date]);

  const handleConfirm = async () => {
    if (!soldPrice || Number(soldPrice) <= 0) {
      toast.error("请输入有效的成交价（必须大于 0）");
      return;
    }
    if (!soldDate) {
      toast.error("请选择成交日期");
      return;
    }
    if (listPrice && Number(listPrice) < 0) {
      toast.error("挂牌价不能为负数");
      return;
    }

    try {
      setIsSaving(true);
      const res = await updateProjectAction(project.id, {
        sold_price: Number(soldPrice),
        sold_date: format(soldDate, "yyyy-MM-dd"),
        list_price: listPrice ? Number(listPrice) : null,
        listing_date: listingDate ? format(listingDate, "yyyy-MM-dd") : null,
      });

      if (res.success) {
        toast.success("销售信息已更新");
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(res.message || "更新失败");
      }
    } catch {
      toast.error("更新时发生错误");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>修改销售信息</DialogTitle>
          <DialogDescription>
            修改成交价、成交日期、挂牌价及上架日期，保存后立即生效。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* 成交价 */}
          <div className="grid gap-2">
            <Label htmlFor="edit-sold-price" className="text-xs font-medium text-muted-foreground">
              成交价 (万元)
            </Label>
            <div className="relative">
              <Input
                id="edit-sold-price"
                type="number"
                placeholder="0.00"
                value={soldPrice}
                onChange={(e) => setSoldPrice(e.target.value)}
                className="pr-8"
              />
              <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">万</span>
            </div>
          </div>

          {/* 成交日期 */}
          <div className="grid gap-2">
            <Label htmlFor="edit-sold-date" className="text-xs font-medium text-muted-foreground">
              成交日期
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="edit-sold-date"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !soldDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {soldDate ? format(soldDate, "yyyy年MM月dd日") : <span>选择日期</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={soldDate} onSelect={setSoldDate} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          {/* 挂牌价 */}
          <div className="grid gap-2">
            <Label htmlFor="edit-list-price" className="text-xs font-medium text-muted-foreground">
              挂牌价 (万元)
            </Label>
            <div className="relative">
              <Input
                id="edit-list-price"
                type="number"
                placeholder="可选"
                value={listPrice}
                onChange={(e) => setListPrice(e.target.value)}
                className="pr-8"
              />
              <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">万</span>
            </div>
          </div>

          {/* 上架日期 */}
          <div className="grid gap-2">
            <Label
              htmlFor="edit-listing-date"
              className="text-xs font-medium text-muted-foreground"
            >
              上架日期
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="edit-listing-date"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !listingDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {listingDate ? format(listingDate, "yyyy年MM月dd日") : <span>选择日期</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={listingDate}
                  onSelect={setListingDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={isSaving || !soldPrice || !soldDate}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
