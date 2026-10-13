"use client";

/**
 * 线索详情「地址绑定」卡（FR-12/FR-18：存量线索绑定字典，与项目同口径）.
 *
 * 呈现绑定状态 + 小区/楼栋/户室；「绑定地址 / 改绑定」打开四级选择器
 * （PUT /admin/leads/{id}/dictionary-link）、「解绑」（DELETE）。
 * 绑定不强制、未绑定零影响；community_name 冗余不改写（BR-25）。
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { client } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import { DictAddressPicker, type DictAddressValue } from "@/components/dict-address-picker";

interface LeadAddressBindingCardProps {
  leadId: string;
  communityId?: string;
  communityName: string;
  buildingId?: number | null;
  roomId?: number | null;
  dictStatus?: string | null;
}

const DICT_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  linked: { label: "已绑定", className: "bg-emerald-100 text-emerald-800" },
  pending: { label: "绑定审核中", className: "bg-amber-100 text-amber-800" },
  rejected: { label: "绑定被驳回", className: "bg-rose-100 text-rose-800" },
  manual: { label: "未绑 · 自由文本", className: "bg-apricot-wash text-rust" },
};

export function LeadAddressBindingCard({
  leadId,
  communityId,
  communityName,
  buildingId,
  roomId,
  dictStatus,
}: LeadAddressBindingCardProps) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerValue, setPickerValue] = useState<DictAddressValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [unbinding, setUnbinding] = useState(false);

  const linked = dictStatus === "linked" || dictStatus === "pending";
  const statusMeta = DICT_STATUS_LABEL[dictStatus ?? "manual"] ?? DICT_STATUS_LABEL.manual;

  const openPicker = useCallback(() => {
    setPickerValue({
      communityId: communityId ?? null,
      communityName: communityName ?? "",
      buildingId: buildingId ?? null,
      buildingNo: "",
      roomId: roomId ?? null,
      roomNo: "",
      address: communityName ?? "",
      dictStatus: linked ? "linked" : null,
    });
    setPickerOpen(true);
  }, [communityId, communityName, buildingId, roomId, linked]);

  const confirmBind = useCallback(async () => {
    if (!pickerValue?.communityId) {
      toast.error("小区必选（楼栋/户室选填落库，FR-18）");
      return;
    }
    setSaving(true);
    try {
      const { error } = await client.PUT("/api/v1/admin/leads/{lead_id}/dictionary-link", {
        params: { path: { lead_id: leadId } },
        body: {
          community_id: pickerValue.communityId,
          building_id: pickerValue.buildingId ?? null,
          room_id: pickerValue.roomId ?? null,
        },
      });
      if (error) {
        toast.error("绑定失败，请检查后重试");
        return;
      }
      toast.success("绑定成功：关联字段生效，community_name 不改写");
      setPickerOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }, [pickerValue, leadId, router]);

  const confirmUnbind = useCallback(async () => {
    setUnbinding(true);
    try {
      const { error } = await client.DELETE("/api/v1/admin/leads/{lead_id}/dictionary-link", {
        params: { path: { lead_id: leadId } },
      });
      if (error) {
        toast.error("解绑失败");
        return;
      }
      toast.success("已解除关联 → dict_status = manual");
      router.refresh();
    } finally {
      setUnbinding(false);
    }
  }, [leadId, router]);

  return (
    <div className="bg-card border border-dove rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">地址绑定</h3>
        <Badge variant="outline" className={cn("font-medium", statusMeta.className)}>
          {statusMeta.label}
        </Badge>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-[13px]">
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">小区</dt>
          <dd className="font-semibold text-foreground">{communityName || "-"}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">楼栋</dt>
          <dd className="font-semibold tabular-nums text-foreground">
            {linked && buildingId ? buildingId : "未绑定"}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">户室</dt>
          <dd className="font-semibold tabular-nums text-foreground">
            {linked && roomId ? roomId : "未绑定"}
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={!linked || unbinding} onClick={() => void confirmUnbind()}>
          {unbinding ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Unlink className="mr-1 size-3.5" />}
          解绑
        </Button>
        <Button size="sm" className="bg-ink text-white" onClick={openPicker}>
          <Link2 className="mr-1 size-3.5" />
          {linked ? "改绑定" : "绑定地址"}
        </Button>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>绑定地址 · 小区必选，楼栋/户室选填</DialogTitle>
          </DialogHeader>
          <DictAddressPicker
            value={pickerValue}
            onChange={setPickerValue}
            sourceBizType="lead"
            sourceBizId={leadId}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPickerOpen(false)}>
              取消
            </Button>
            <Button className="bg-ink text-white" disabled={saving || !pickerValue?.communityId} onClick={() => void confirmBind()}>
              {saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
              确认绑定
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
