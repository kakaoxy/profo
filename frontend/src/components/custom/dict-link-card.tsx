"use client";

/**
 * 字典地址绑定卡（缺陷 F：房源/营销房源与字典小区绑定，与项目/线索同口径）.
 *
 * 呈现绑定状态徽标 + 小区名；「关联 / 修正」打开小区级字典选择器
 * （仅小区，allowCreate=false，PUT .../dictionary-link）、「解除关联」
 * （DELETE）。绑定仅落小区，building/room 不落库。
 */

import { useCallback, useState } from "react";
import { Link2, Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { client } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import { DictAddressPicker, type DictAddressValue } from "@/components/dict-address-picker";

interface DictLinkCardProps {
  bizType: "property" | "marketing";
  /** 业务标识：property=「data_source:source_property_id」，marketing=String(project.id) */
  bizId: string;
  communityId: string | null;
  communityName: string;
  dictStatus: string | null;
  /** 可选楼栋/户室四级展示（surface-dict-binding-info）：营销详情传入；房源侧（仅小区级）不传、渲染零变化 */
  buildingId?: number | null;
  roomId?: number | null;
  buildingNo?: string | null;
  roomNo?: string | null;
  /** 绑定/解绑成功后由宿主刷新详情（替代内部 router.refresh） */
  onChanged?: () => void;
}

const DICT_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  linked: { label: "已绑定", className: "bg-emerald-100 text-emerald-800" },
  pending: { label: "审核中", className: "bg-amber-100 text-amber-800" },
  rejected: { label: "已驳回", className: "bg-rose-100 text-rose-800" },
  manual: { label: "未绑定", className: "bg-apricot-wash text-rust" },
};

export function DictLinkCard({
  bizType,
  bizId,
  communityId,
  communityName,
  dictStatus,
  buildingId,
  roomId,
  buildingNo,
  roomNo,
  onChanged,
}: DictLinkCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerValue, setPickerValue] = useState<DictAddressValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [unbinding, setUnbinding] = useState(false);

  const bound = dictStatus === "linked" || dictStatus === "pending" || dictStatus === "rejected";
  const statusMeta = DICT_STATUS_LABEL[dictStatus ?? "manual"] ?? DICT_STATUS_LABEL.manual;

  const openPicker = useCallback(() => {
    setPickerValue({
      communityId: communityId ?? null,
      communityName: communityName ?? "",
      buildingId: null,
      buildingNo: "",
      roomId: null,
      roomNo: "",
      address: communityName ?? "",
      dictStatus: null,
    });
    setPickerOpen(true);
  }, [communityId, communityName]);

  const confirmBind = useCallback(async () => {
    if (!pickerValue?.communityId) {
      toast.error("请先选择小区");
      return;
    }
    setSaving(true);
    try {
      const community_id = pickerValue.communityId;
      const { error } =
        bizType === "property"
          ? await client.PUT("/api/v1/admin/properties/{property_id}/dictionary-link", {
              params: { path: { property_id: bizId } },
              body: { community_id },
            })
          : await client.PUT("/api/v1/admin/marketing/projects/{project_id}/dictionary-link", {
              params: { path: { project_id: Number(bizId) } },
              body: { community_id },
            });
      if (error) {
        toast.error("绑定失败，请检查后重试");
        return;
      }
      toast.success("关联成功");
      setPickerOpen(false);
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }, [pickerValue, bizType, bizId, onChanged]);

  const confirmUnbind = useCallback(async () => {
    setUnbinding(true);
    try {
      const { error } =
        bizType === "property"
          ? await client.DELETE("/api/v1/admin/properties/{property_id}/dictionary-link", {
              params: { path: { property_id: bizId } },
            })
          : await client.DELETE("/api/v1/admin/marketing/projects/{project_id}/dictionary-link", {
              params: { path: { project_id: Number(bizId) } },
            });
      if (error) {
        toast.error("解绑失败");
        return;
      }
      toast.success("已解除关联");
      onChanged?.();
    } finally {
      setUnbinding(false);
    }
  }, [bizType, bizId, onChanged]);

  return (
    <div className="bg-card border border-dove rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">字典绑定</h3>
          <p className="mt-1 truncate text-[13px] font-medium text-foreground">
            {communityName || "-"}
          </p>
          {/* 四级展示（surface-dict-binding-info）：楼栋/户室可选，传入才渲染；房源侧零变化 */}
          {(buildingNo || buildingId) || (roomNo || roomId) ? (
            <p className="mt-0.5 truncate text-[12px] text-graphite">
              {buildingNo ?? (buildingId ? `ID:${buildingId}` : null) ?? ""}
              {buildingNo && roomNo ? " / " : ""}
              {roomNo ?? (roomId ? `ID:${roomId}` : null) ?? ""}
            </p>
          ) : null}
        </div>
        <Badge variant="outline" className={cn("shrink-0 font-medium", statusMeta.className)}>
          {statusMeta.label}
        </Badge>
      </div>

      {dictStatus === "pending" && (buildingNo || roomNo) ? (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          新增楼栋/户室待审核，通过后显示字典名称（当前为待审内容）
        </p>
      ) : null}

      <div className="mt-3 flex justify-end gap-2">
        {bound ? (
          <Button
            variant="outline"
            size="sm"
            disabled={unbinding}
            onClick={() => void confirmUnbind()}
          >
            {unbinding ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Unlink className="mr-1 size-3.5" />}
            解除关联
          </Button>
        ) : null}
        <Button size="sm" className="bg-ink text-white" onClick={openPicker}>
          <Link2 className="mr-1 size-3.5" />
          {bound ? "修正" : "关联"}
        </Button>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>关联字典小区 · 小区必选</DialogTitle>
          </DialogHeader>
          <DictAddressPicker value={pickerValue} onChange={setPickerValue} allowCreate={false} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPickerOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-ink text-white"
              disabled={saving || !pickerValue?.communityId}
              onClick={() => void confirmBind()}
            >
              {saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
              确认关联
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
