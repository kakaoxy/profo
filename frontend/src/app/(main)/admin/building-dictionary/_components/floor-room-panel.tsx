"use client";

/**
 * 楼层分组 + 户室网格（FR-04/05，抽屉内展开面板）.
 *
 * 楼层集合 = 名义 ∪ 实际 ∪ pending（未分层置底）；户室单选回显
 * 「选中 X 栋 Y」+ 门牌映射；pending 户室带「未审核」标签虚线置灰不可选
 * （hover「审核中，通过后可选」，BR-23）。
 * 可选 props：onPick（选中上报抽屉底部回显）/ onAddRoom + addRoomSlot
 * （admin 补录户室入口，FR-06 区间语法）。
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { client } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import type { BdBuildingDetail } from "./types";

interface FloorRoomPanelProps {
  buildingId: number;
  /** 户室选中上报（抽屉底部回显「已选 X 栋 Y」） */
  onPick?: (room: { roomNo: string; plate: string }) => void;
  /** 「+ 添加户室」入口回调（undefined = 不显示入口） */
  onAddRoom?: () => void;
  /** admin 补录户室行内表单插槽（由父级受控渲染） */
  addRoomSlot?: React.ReactNode;
}

interface FloorGroup {
  floor: number | null;
  room_count: number;
  has_pending: boolean;
}

interface RoomItem {
  id: number;
  room_no: string;
  floor: number | null;
  pending: boolean;
  pending_id: number | null;
  plate_no: string;
}

export function FloorRoomPanel({ buildingId, onPick, onAddRoom, addRoomSlot }: FloorRoomPanelProps) {
  const [floors, setFloors] = useState<FloorGroup[]>([]);
  const [detail, setDetail] = useState<BdBuildingDetail | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<{ no: string; plate: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [openFloors, setOpenFloors] = useState<Set<number | null>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [floorRes, detailRes] = await Promise.all([
        client.GET("/api/v1/admin/building-dictionary/buildings/{building_id}/floors", {
          params: { path: { building_id: buildingId } },
        }),
        client.GET("/api/v1/admin/building-dictionary/buildings/{building_id}", {
          params: { path: { building_id: buildingId } },
        }),
      ]);
      if (!floorRes.error && floorRes.data) {
        const groups = floorRes.data as unknown as FloorGroup[];
        setFloors(groups);
        setOpenFloors((prev) => {
          if (prev.size > 0) return prev;
          return new Set(groups.slice(0, 2).map((g) => g.floor));
        });
      }
      if (!detailRes.error && detailRes.data) {
        setDetail(detailRes.data as unknown as BdBuildingDetail);
      }
    } finally {
      setLoading(false);
    }
  }, [buildingId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="size-4 animate-spin text-graphite" />
      </div>
    );
  }

  const rooms = detail?.rooms ?? [];
  const byFloor = new Map<number | null, RoomItem[]>();
  for (const r of rooms) {
    const list = byFloor.get(r.floor) ?? [];
    list.push(r);
    byFloor.set(r.floor, list);
  }

  return (
    <div className="border-t border-dashed border-dove/40 bg-fog/40 py-3">
      {selectedRoom ? (
        <p className="mb-2 rounded-lg bg-apricot-wash/60 px-3 py-1.5 text-[13px] text-rust">
          选中：{selectedRoom.no}（门牌 {selectedRoom.plate}）
        </p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        {floors.map((f) => {
          const isOpen = openFloors.has(f.floor);
          const floorRooms = byFloor.get(f.floor) ?? [];
          return (
            <div key={f.floor ?? "none"} className="rounded-xl border border-dove/40 bg-white">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-1.5 text-[13px]"
                onClick={() => {
                  const next = new Set(openFloors);
                  if (isOpen) {
                    next.delete(f.floor);
                  } else {
                    next.add(f.floor);
                  }
                  setOpenFloors(next);
                }}
              >
                <span className="flex items-center gap-2">
                  <span className={cn("font-medium", f.floor == null && "text-graphite")}>
                    {f.floor == null ? "楼层待定" : `${f.floor} 层`}
                  </span>
                  {f.has_pending ? <Badge variant="outline" className="h-4 px-1 text-[10px]">未审核</Badge> : null}
                </span>
                <span className="text-graphite tabular-nums">{f.room_count} 户</span>
              </button>
              {isOpen ? (
                <div className="grid grid-cols-8 gap-1 px-3 pb-2">
                  {floorRooms.map((r) => {
                    const selected = selectedRoom?.no === r.room_no;
                    return (
                      <button
                        key={r.pending ? `pr-${r.pending_id}` : `r-${r.id}`}
                        type="button"
                        disabled={r.pending}
                        title={r.pending ? "审核中，通过后可选" : undefined}
                        className={cn(
                          "rounded border px-1 py-0.5 text-[11px] tabular-nums",
                          selected ? "border-ink bg-ink text-white" : "border-dove/50 hover:border-ash",
                          r.pending && "border-dashed text-dove opacity-60",
                        )}
                        onClick={() => {
                          setSelectedRoom({ no: r.room_no, plate: r.plate_no });
                          onPick?.({ roomNo: r.room_no, plate: r.plate_no });
                        }}
                      >
                        {r.plate_no}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {onAddRoom ? (
        <div className="px-3 pt-2">
          <button
            type="button"
            className="flex items-center gap-1.5 text-[11.5px] text-rust hover:underline"
            onClick={onAddRoom}
          >
            <span className="flex size-4.5 items-center justify-center rounded-full bg-apricot-wash text-[12px] font-semibold text-rust">
              +
            </span>
            添加户室，可一次加一批
          </button>
          {addRoomSlot}
        </div>
      ) : null}
    </div>
  );
}
