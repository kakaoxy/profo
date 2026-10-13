"use client";

/**
 * 新增小区弹窗（FR-07 / Task 7.3）.
 *
 * 小区名/区/板块必填，环线/锚点坐标（BD-09）/地址可空；
 * 重名拦截提示；撞同名 open pending 由后端自动转正（BR-26）；
 * 成功后即时生效进总览与联想。
 */

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { client } from "@/lib/api-client";

interface CreateCommunityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function CreateCommunityDialog({ open, onOpenChange, onCreated }: CreateCommunityDialogProps) {
  const [form, setForm] = useState({ name: "", district: "", businessCircle: "", ring: "", address: "" });
  const [lng, setLng] = useState("");
  const [lat, setLat] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!form.name.trim() || !form.district.trim() || !form.businessCircle.trim()) {
      toast.error("小区名/区/板块为必填项");
      return;
    }
    setSubmitting(true);
    try {
      const { error, response } = await client.POST("/api/v1/admin/building-dictionary/communities", {
        body: {
          name: form.name.trim(),
          district: form.district.trim(),
          business_circle: form.businessCircle.trim(),
          ring: form.ring.trim() || null,
          address: form.address.trim() || null,
          lng: lng ? Number(lng) : null,
          lat: lat ? Number(lat) : null,
        },
      });
      if (error) {
        const detail = (response as Response | undefined) ? undefined : undefined;
        toast.error(detail ?? "新增小区失败：可能重名（请直接选择或走治理合并）");
        return;
      }
      toast.success(`小区「${form.name.trim()}」已创建并即时生效`);
      setForm({ name: "", district: "", businessCircle: "", ring: "", address: "" });
      setLng("");
      setLat("");
      onOpenChange(false);
      onCreated?.();
    } finally {
      setSubmitting(false);
    }
  }, [form, lng, lat, onOpenChange, onCreated]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新增小区</DialogTitle>
          <DialogDescription>
            小区名/区/板块必填；环线/锚点坐标（BD-09）/地址可空。创建后即时生效进总览与联想。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label>小区名 *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label>区 *</Label>
              <Input value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} placeholder="如 浦东" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>板块 *</Label>
              <Input
                value={form.businessCircle}
                onChange={(e) => setForm((f) => ({ ...f, businessCircle: e.target.value }))}
                placeholder="如 北蔡"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>环线</Label>
            <Input value={form.ring} onChange={(e) => setForm((f) => ({ ...f, ring: e.target.value }))} placeholder="如 外环外（可空）" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>地址</Label>
            <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="可空" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label>经度（BD-09）</Label>
              <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="可空" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>纬度（BD-09）</Label>
              <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="可空" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button className="bg-ink text-white" disabled={submitting} onClick={handleSubmit}>
            {submitting ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
            创建
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
