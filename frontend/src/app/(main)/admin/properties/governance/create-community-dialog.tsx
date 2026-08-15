"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCommunityAction } from "@/app/(main)/admin/leads/actions";

interface CreateCommunityDialogProps {
  onSuccess?: () => void;
}

/**
 * 新增小区对话框
 * 提供小区名称、行政区、商圈录入入口（小区库 district 录入入口）
 */
export function CreateCommunityDialog({ onSuccess }: CreateCommunityDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [district, setDistrict] = useState("");
  const [businessCircle, setBusinessCircle] = useState("");

  const handleReset = () => {
    setName("");
    setDistrict("");
    setBusinessCircle("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("请输入小区名称");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await createCommunityAction({
        name: name.trim(),
        district: district.trim() || null,
        business_circle: businessCircle.trim() || null,
      });
      if (result.success) {
        toast.success(`小区"${result.data.name}"已创建`);
        handleReset();
        setIsOpen(false);
        onSuccess?.();
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) handleReset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="default">
          <Plus className="mr-2 h-4 w-4" />
          新增小区
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>新增小区</DialogTitle>
          <DialogDescription>
            录入小区基础信息。行政区将用于项目列表的行政区联动展示。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="community-name" className="text-sm font-medium">
              小区名称 <span className="text-error">*</span>
            </Label>
            <Input
              id="community-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：黄浦花园"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="community-district" className="text-sm font-medium">
                行政区
              </Label>
              <Input
                id="community-district"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="如：黄浦区"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="community-business-circle" className="text-sm font-medium">
                商圈
              </Label>
              <Input
                id="community-business-circle"
                value={businessCircle}
                onChange={(e) => setBusinessCircle(e.target.value)}
                placeholder="如：人民广场"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
