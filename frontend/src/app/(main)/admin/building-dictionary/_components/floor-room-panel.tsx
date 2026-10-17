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

import type { components } from "@/lib/api-types";

type Schemas = components["schemas"];
import type { BdBuildingDetail, BdRoomItem } from "./types";

interface FloorRoomPanelProps {
  buildingId: number;
  /** 变化时重载楼层/户室数据（父级户室补录成功后 +1），保留展开与选中状态 */
  refreshSignal?: number;
  /** 户室选中上报（抽屉底部回显「已选 X 栋 Y」） */
  onPick?: (room: { roomNo: string; plate: string }) => void;
  /** 「+ 添加户室」入口回调（undefined = 不显示入口） */
  onAddRoom?: () => void;
  /** admin 补录户室行内表单插槽（由父级受控渲染） */
  addRoomSlot?: React.ReactNode;
  /** 删除楼层（= 删该层全部户室；undefined = 不显示入口） */
  onDeleteFloor?: (floor: number | null, floorLabel: string) => void;
  /** 删除单个户室（undefined = 不显示入口） */
  onDeleteRoom?: (roomId: number, roomNo: string) => void;
}

interface FloorGroup {
  floor: number | null;
  room_count: number;
  has_pending: boolean;
}

// M4 修复：复用生成类型派生（与后端 BdRoomItem schema 对齐）
type RoomItem = BdRoomItem;

/** 户室分页大小（P3：后端上限 500，默认 200；楼栋最多 928 户需翻页加载） */
const ROOM_PAGE_SIZE = 200;

/** 生成类型收敛：schema 层 rooms/floor/pending_id 可选，消费侧统一为必有 */
function normalizeDetail(d: Schemas["BdBuildingDetail"]): BdBuildingDetail {
  return {
    ...d,
    rooms: (d.rooms ?? []).map((r) => ({
      ...r,
      floor: r.floor ?? null,
      pending_id: r.pending_id ?? null,
    })),
  };
}

export function FloorRoomPanel({
  buildingId,
  refreshSignal = 0,
  onPick,
  onAddRoom,
  addRoomSlot,
  onDeleteFloor,
  onDeleteRoom,
}: FloorRoomPanelProps) {
  const [floors, setFloors] = useState<FloorGroup[]>([]);
  const [detail, setDetail] = useState<BdBuildingDetail | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<{
    id: number;
    no: string;
    plate: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openFloors, setOpenFloors] = useState<Set<number | null>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [floorRes, detailRes] = await Promise.all([
        client.GET("/api/v1/admin/building-dictionary/buildings/{building_id}/floors", {
          params: { path: { building_id: buildingId } },
        }),
        client.GET("/api/v1/admin/building-dictionary/buildings/{building_id}", {
          params: {
            path: { building_id: buildingId },
            query: { room_page: 1, room_page_size: ROOM_PAGE_SIZE },
          },
        }),
      ]);
      if (!floorRes.error && floorRes.data) {
        const groups: FloorGroup[] = floorRes.data.map((g) => ({
          floor: g.floor ?? null,
          room_count: g.room_count,
          has_pending: g.has_pending,
        }));
        setFloors(groups);
        setOpenFloors((prev) => {
          if (prev.size > 0) return prev;
          return new Set(groups.slice(0, 2).map((g) => g.floor));
        });
      }
      if (!detailRes.error && detailRes.data) {
        setDetail(normalizeDetail(detailRes.data));
      }
    } finally {
      setLoading(false);
    }
  }, [buildingId]);

  /** P3：加载下一页户室并追加（超大楼栋 928 户不再一次性返回） */
  const loadMoreRooms = useCallback(async () => {
    if (!detail?.room_has_more || loadingMore) return;
    setLoadingMore(true);
    try {
      const { data, error } = await client.GET(
        "/api/v1/admin/building-dictionary/buildings/{building_id}",
        {
          params: {
            path: { building_id: buildingId },
            query: { room_page: (detail.room_page ?? 1) + 1, room_page_size: ROOM_PAGE_SIZE },
          },
        },
      );
      if (!error && data) {
        const next = normalizeDetail(data);
        setDetail((prev) =>
          prev
            ? {
                ...next,
                // 分页元信息取新页（room_page / room_has_more 前进）；
                // rooms = 已加载的实表户室（上一页）+ 本页实表户室 + pending 户室。
                // pending 户室后端每页都会附带（不分页），只能保留一份，否则重复渲染。
                rooms: [
                  ...prev.rooms.filter((r) => !r.pending),
                  ...next.rooms.filter((r) => !r.pending),
                  ...next.rooms.filter((r) => r.pending),
                ],
              }
            : next,
        );
      }
    } finally {
      setLoadingMore(false);
    }
  }, [buildingId, detail, loadingMore]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

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
    // 派生类型中 floor/pending_id 可选（schema 层 Optional），消费侧收敛为必有
    const floor = r.floor ?? null;
    const item: RoomItem = { ...r, floor, pending_id: r.pending_id ?? null };
    const list = byFloor.get(floor) ?? [];
    list.push(item);
    byFloor.set(floor, list);
  }

  return (
    <div className="border-t border-dashed border-dove/40 pt-2.5">
      <div className="flex flex-col gap-2">
        {detail && detail.room_has_more ? (
          <p className="rounded-lg bg-fog px-2.5 py-1.5 text-[11px] text-graphite">
            已显示 {rooms.filter((r) => !r.pending).length} / {detail.room_total}{" "}
            户（按楼层分组展示）
            <button
              type="button"
              className="ml-2 text-rust hover:underline disabled:opacity-50"
              disabled={loadingMore}
              onClick={() => void loadMoreRooms()}
            >
              {loadingMore ? "加载中…" : "加载更多户室"}
            </button>
          </p>
        ) : null}
        {floors.map((f) => {
          const isOpen = openFloors.has(f.floor);
          const floorRooms = byFloor.get(f.floor) ?? [];
          return (
            <div key={f.floor ?? "none"} className="floor-sect">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-graphite"
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
                  <span className="text-[9px] text-dove">{isOpen ? "▾" : "▸"}</span>
                  <span
                    className={cn(
                      "font-mono text-[11px] font-semibold",
                      f.floor == null ? "text-graphite" : "text-ink",
                    )}
                  >
                    {f.floor == null ? "楼层待定" : `${f.floor} 层`}
                  </span>
                  <em className="not-italic text-dove">{f.room_count} 户</em>
                  {f.has_pending ? (
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">
                      未审核
                    </Badge>
                  ) : null}
                </button>
                {/* 「删除本层」= 批量删除该层全部户室（楼层待定分组无楼层号，仅支持逐户删除） */}
                {onDeleteFloor && f.floor != null ? (
                  <button
                    type="button"
                    className="ml-auto text-[10px] text-dove transition-colors hover:text-rust"
                    onClick={() => onDeleteFloor(f.floor, `${f.floor} 层`)}
                  >
                    删除本层
                  </button>
                ) : null}
              </div>
              {isOpen ? (
                <div className="mt-2 grid grid-cols-8 gap-1 border-t border-dashed border-dove/40 pt-2">
                  {floorRooms.map((r) => {
                    const selected = selectedRoom?.no === r.room_no;
                    return (
                      <button
                        key={r.pending ? `pr-${r.pending_id}` : `r-${r.id}`}
                        type="button"
                        disabled={r.pending}
                        title={r.pending ? "审核中，通过后可选" : undefined}
                        className={cn(
                          "rounded-[7px] px-1 py-1 font-mono text-[10px] transition-colors",
                          selected
                            ? "bg-ink text-white"
                            : "bg-fog text-ash hover:bg-[var(--sky,#e8f0f8)] hover:text-ink",
                          r.pending &&
                            "border border-dashed bg-transparent text-dove opacity-60 hover:bg-transparent",
                        )}
                        onClick={() => {
                          setSelectedRoom({ id: r.id, no: r.room_no, plate: r.plate_no });
                          onPick?.({ roomNo: r.room_no, plate: r.plate_no });
                        }}
                      >
                        {/* 设计稿：网格展示原始户室号（如 0401），门牌映射只在底部回显 */}
                        {r.room_no}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {/* 选中户室后的删除入口（admin；业务引用由后端拦截） */}
              {isOpen &&
              selectedRoom &&
              onDeleteRoom &&
              floorRooms.some((r) => !r.pending && r.room_no === selectedRoom.no) ? (
                <div className="mt-1.5">
                  <button
                    type="button"
                    className="text-[10.5px] text-rust hover:underline"
                    onClick={() => onDeleteRoom(selectedRoom.id, selectedRoom.no)}
                  >
                    删除所选户室 {selectedRoom.no}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {onAddRoom || addRoomSlot ? (
        <div className="pt-2.5">
          {onAddRoom ? (
            <button
              type="button"
              className="flex items-center gap-1.5 text-[11.5px] text-rust"
              onClick={onAddRoom}
            >
              <span className="flex size-4.5 items-center justify-center rounded-full bg-apricot-wash text-[12px] font-semibold text-rust">
                +
              </span>
              添加户室，可一次加一批
            </button>
          ) : null}
          {/* 插槽与按钮分开渲染：点击后父级将 onAddRoom 置 undefined 并传入表单插槽，
              若把插槽包在 onAddRoom 条件内会导致表单永不出现（点击无反应） */}
          {addRoomSlot}
        </div>
      ) : null}
    </div>
  );
}
