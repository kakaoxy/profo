"use client";

/**
 * 项目详情「地址绑定」卡（FR-12 / 设计稿 ARTBOARD 05）.
 *
 * 呈现：绑定状态徽标（已绑到户 / 未绑 · 手填地址）+ 小区/手填门牌/楼栋/户室四格；
 * 动作：「绑定地址 / 改绑定」打开四级选择器弹窗（PUT dictionary-link）、「解绑」
 * （DELETE，绑定过才可点）；绑定只更新地址数据，原手填门牌文字转为备注保留。
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

interface AddressBindingCardProps {
  projectId: string;
  communityId: string | null;
  communityName: string | null;
  address: string | null;
  buildingId: number | null;
  roomId: number | null;
  dictStatus: string | null;
  onChanged?: () => void;
}

const DICT_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  linked: { label: "已绑到户", className: "bg-emerald-100 text-emerald-800" },
  pending: { label: "绑定审核中", className: "bg-amber-100 text-amber-800" },
  rejected: { label: "绑定被驳回", className: "bg-rose-100 text-rose-800" },
  manual: { label: "未绑 · 手填地址", className: "bg-apricot-wash text-rust" },
};

export function AddressBindingCard({
  projectId,
  communityId,
  communityName,
  address,
  buildingId,
  roomId,
  dictStatus,
  onChanged,
}: AddressBindingCardProps) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerValue, setPickerValue] = useState<DictAddressValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [unbinding, setUnbinding] = useState(false);

  const linked = dictStatus === "linked" || dictStatus === "pending";
  const statusMeta = DICT_STATUS_LABEL[dictStatus ?? "manual"] ?? DICT_STATUS_LABEL.manual;

  const openPicker = useCallback(() => {
    setPickerValue({
      communityId: communityId,
      communityName: communityName ?? "",
      buildingId: buildingId,
      buildingNo: "",
      roomId: roomId,
      roomNo: "",
      address: address ?? communityName ?? "",
      dictStatus: linked ? "linked" : null,
    });
    setPickerOpen(true);
  }, [communityId, communityName, buildingId, roomId, address, linked]);

  const confirmBind = useCallback(async () => {
    if (!pickerValue?.communityId) {
      toast.error("请先选择字典小区");
      return;
    }
    setSaving(true);
    try {
      const { error } = await client.PUT("/api/v1/admin/projects/{project_id}/dictionary-link", {
        params: { path: { project_id: projectId } },
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
      toast.success("绑定成功：数据层以字典为准（原手填门牌转备注保留）");
      setPickerOpen(false);
      onChanged?.();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }, [pickerValue, projectId, onChanged, router]);

  const confirmUnbind = useCallback(async () => {
    setUnbinding(true);
    try {
      const { error } = await client.DELETE("/api/v1/admin/projects/{project_id}/dictionary-link", {
        params: { path: { project_id: projectId } },
      });
      if (error) {
        toast.error("解绑失败");
        return;
      }
      toast.success("已解除关联 → dict_status = manual");
      onChanged?.();
      router.refresh();
    } finally {
      setUnbinding(false);
    }
  }, [projectId, onChanged, router]);

  return (
    <section className="rounded-cards bg-pure-white p-6 font-sohne shadow-steep">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-[500] text-ink">地址绑定</h3>
        <Badge variant="outline" className={cn("font-medium", statusMeta.className)}>
          {statusMeta.label}
        </Badge>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        <div>
          <dt className="text-graphite">小区</dt>
          <dd className="text-ink">{communityName || "—"}</dd>
        </div>
        <div>
          <dt className="text-graphite">手填门牌</dt>
          <dd className="text-ink">{address || "—"}</dd>
        </div>
        <div>
          <dt className="text-graphite">楼栋</dt>
          <dd className="text-ink tabular-nums">{linked && buildingId ? `${buildingId}` : "未绑定"}</dd>
        </div>
        <div>
          <dt className="text-graphite">户室</dt>
          <dd className="text-ink tabular-nums">{linked && roomId ? `${roomId}` : "未绑定"}</dd>
        </div>
      </dl>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={!linked || unbinding} onClick={() => void confirmUnbind()}>
          {unbinding ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Unlink className="mr-1 size-3.5" />}
          解绑
        </Button>
        <Button size="sm" className="bg-ink text-white" onClick={openPicker}>
          <Link2 className="mr-1 size-3.5" />
          {linked ? "改绑定" : "绑定地址"}
        </Button>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-graphite">
        绑定只更新地址数据，<b className="text-rust">原门牌文字转为备注保留</b>。字典里没有这户？去新建项目页添加（需审核）。
      </p>

      {/* 绑定地址弹窗（复用四级选择器共享组件，设计稿：给项目选楼栋和户室） */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>绑定地址 · 选楼栋和户室</DialogTitle>
          </DialogHeader>
          <DictAddressPicker
            value={pickerValue}
            onChange={setPickerValue}
            sourceBizType="project"
            sourceBizId={projectId}
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
    </section>
  );
}
