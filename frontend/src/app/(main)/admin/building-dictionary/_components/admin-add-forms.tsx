"use client";

/**
 * admin 补录楼栋/户室（FR-06，v1.3 批量区间语法）.
 *
 * 楼栋「29-55」/ 户室「7-12 层 × 01-08 室」笛卡尔展开，后端 uq 跳过已有、
 * 上限 60 栋 / 200 户，返回 {added, skipped}；admin 即时生效留审计。
 */

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { client } from "@/lib/api-client";

interface BuildingAddFormProps {
  communityId: string;
  onDone: (added: number) => void;
  onCancel: () => void;
}

/** 楼栋补录行内表单（支持区间 29-55） */
export function BuildingAddForm({ communityId, onDone, onCancel }: BuildingAddFormProps) {
  const [no, setNo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async () => {
    const v = no.trim();
    if (!v) {
      toast.error("请填写楼栋号（支持区间如 29-55，单次 ≤ 60）");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await client.POST("/api/v1/admin/building-dictionary/buildings", {
        body: { community_id: communityId, building_no: v },
      });
      if (error || !data) {
        toast.error("补录失败（检查上限 60 栋）");
        return;
      }
      if (data.added === 0) {
        toast.error(`楼栋已全部存在（uq 约束，跳过 ${data.skipped}）`);
        return;
      }
      toast.success(
        `已添加 ${data.added} 栋 → bd_buildings（admin 即时生效 · 留审计）` +
          (data.skipped ? `，跳过已有 ${data.skipped}` : ""),
      );
      onDone(data.added);
    } finally {
      setSubmitting(false);
    }
  }, [communityId, no, onDone]);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-rust/30 bg-apricot-wash/50 px-3 py-2 text-[12px] text-graphite">
      <span>楼栋号</span>
      <Input
        autoFocus
        value={no}
        onChange={(e) => setNo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="如 122乙 或 29-55"
        className="h-7 w-36 font-mono text-[12px]"
      />
      <span className="text-[10px]">填 29-55 可一次加多栋（≤60）</span>
      <button
        type="button"
        className="rounded-full bg-ink px-3 py-1 text-[11px] text-white disabled:opacity-50"
        disabled={submitting}
        onClick={() => void submit()}
      >
        {submitting ? <Loader2 className="inline size-3 animate-spin" /> : null} 添加
      </button>
      <button type="button" className="rounded-full border border-dove/60 px-3 py-1 text-[11px] text-graphite" onClick={onCancel}>
        取消
      </button>
    </div>
  );
}

interface RoomAddFormProps {
  buildingId: number;
  onDone: (added: number, lastRoomNo: string) => void;
  onCancel: () => void;
}

/** 户室补录行内表单（楼层 7-12 × 户号 01-08 笛卡尔展开） */
export function RoomAddForm({ buildingId, onDone, onCancel }: RoomAddFormProps) {
  const [floor, setFloor] = useState("");
  const [suffix, setSuffix] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async () => {
    if (!floor.trim() || !suffix.trim()) {
      toast.error("请填写楼层与户号（支持区间如 7-12 层 / 01-08 室）");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await client.POST("/api/v1/admin/building-dictionary/buildings/{building_id}/rooms", {
        params: { path: { building_id: buildingId } },
        body: { building_id: buildingId, floor: floor.trim(), room_suffix: suffix.trim() },
      });
      if (error || !data) {
        toast.error("补录失败（展开超出单次上限 200 户）");
        return;
      }
      if (data.added === 0) {
        toast.error(`户室已全部存在（uq 约束，跳过 ${data.skipped}）`);
        return;
      }
      toast.success(
        `已添加 ${data.added} 户 → bd_rooms（admin 即时生效 · 留审计）` +
          (data.skipped ? `，跳过已有 ${data.skipped}` : ""),
      );
      onDone(data.added, "");
    } finally {
      setSubmitting(false);
    }
  }, [buildingId, floor, suffix, onDone]);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-rust/30 bg-apricot-wash/50 px-3 py-2 text-[12px] text-graphite">
      <span>楼层</span>
      <Input
        autoFocus
        value={floor}
        onChange={(e) => setFloor(e.target.value)}
        placeholder="4 或 7-12"
        className="h-7 w-20 font-mono text-[12px]"
      />
      <span>户室</span>
      <Input
        value={suffix}
        onChange={(e) => setSuffix(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="01-08"
        className="h-7 w-20 font-mono text-[12px]"
      />
      <span className="text-[10px]">填 7-12 可一次加多层；新楼层号自动建层</span>
      <button
        type="button"
        className="rounded-full bg-ink px-3 py-1 text-[11px] text-white disabled:opacity-50"
        disabled={submitting}
        onClick={() => void submit()}
      >
        {submitting ? <Loader2 className="inline size-3 animate-spin" /> : null} 添加
      </button>
      <button type="button" className="rounded-full border border-dove/60 px-3 py-1 text-[11px] text-graphite" onClick={onCancel}>
        取消
      </button>
    </div>
  );
}
