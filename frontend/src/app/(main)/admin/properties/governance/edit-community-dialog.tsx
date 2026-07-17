"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
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
import { Switch } from "@/components/ui/switch";
import { updateCommunityAction } from "@/app/(main)/admin/leads/actions/update-community";
import type { CommunityMinified } from "./pick-community-fields";

const editSchema = z.object({
  name: z
    .string()
    .min(1, "小区名称不能为空")
    .max(200, "小区名称最多 200 字符"),
  district: z.string().max(100, "行政区最多 100 字符"),
  business_circle: z.string().max(100, "商圈最多 100 字符"),
});

interface EditCommunityDialogProps {
  community: CommunityMinified;
  onSuccess?: () => void;
}

export function EditCommunityDialog({
  community,
  onSuccess,
}: EditCommunityDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState(community.name);
  const [district, setDistrict] = useState(community.district ?? "");
  const [businessCircle, setBusinessCircle] = useState(
    community.business_circle ?? ""
  );
  const [isActive, setIsActive] = useState(community.is_active);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = editSchema.safeParse({
      name: name.trim(),
      district: district.trim(),
      business_circle: businessCircle.trim(),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "参数不合法");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await updateCommunityAction(community.id, {
        name: parsed.data.name,
        district: parsed.data.district || null,
        business_circle: parsed.data.business_circle || null,
        is_active: isActive,
      });
      if (result.success) {
        toast.success("小区信息已更新");
        setIsOpen(false);
        onSuccess?.();
      } else {
        toast.error(result.message ?? "更新失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil className="mr-1 h-4 w-4" />
          编辑
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>编辑小区</DialogTitle>
          <DialogDescription>
            修改小区基础信息。行政区/商圈留空将清空对应字段。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="edit-community-name" className="text-sm font-medium">
              小区名称 <span className="text-error">*</span>
            </Label>
            <Input
              id="edit-community-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：黄浦花园"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label
                htmlFor="edit-community-district"
                className="text-sm font-medium"
              >
                行政区
              </Label>
              <Input
                id="edit-community-district"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="如：黄浦区"
              />
            </div>
            <div className="grid gap-2">
              <Label
                htmlFor="edit-community-business-circle"
                className="text-sm font-medium"
              >
                商圈
              </Label>
              <Input
                id="edit-community-business-circle"
                value={businessCircle}
                onChange={(e) => setBusinessCircle(e.target.value)}
                placeholder="如：人民广场"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="edit-community-is-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <Label
              htmlFor="edit-community-is-active"
              className="text-sm font-medium"
            >
              启用（关闭后将软删除该小区）
            </Label>
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
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
