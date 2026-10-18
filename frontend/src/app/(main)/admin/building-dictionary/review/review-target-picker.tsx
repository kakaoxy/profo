"use client";

/**
 * 审核目标级联选择器（FR-11 / 设计稿 renderReviewModal 级联区，从 review-resolve-modal 拆出）.
 *
 * 两种形态：
 * - kind=community：全库按名/地址搜索选目标小区（覆盖名字差异大的同一小区）；
 * - kind=building/room：小区固定为条目所属小区 → 楼栋 chips → 楼层 chips → 户室网格
 *   （prefillFloor 用于户室条目预填：提交楼栋 + 提交户室楼层 + 该层首个户室）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { client } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export interface CommunityOption {
  id: string;
  name: string;
  district: string | null;
  address: string | null;
}

interface BuildingOption {
  id: number;
  building_no: string;
  pending?: boolean;
}

interface RoomOption {
  id: number;
  room_no: string;
  floor: number | null;
  plate_no: string;
  pending?: boolean;
}

/** 户室分页大小（后端上限 500）；超大楼栋逐页取全（实测最大 928 户） */
const ROOM_PAGE_SIZE = 500;
/** 户室分页安全上限（10 页 ≈ 5000 户） */
const ROOM_MAX_PAGES = 10;

export interface TargetSelection {
  community: CommunityOption | null;
  building: BuildingOption | null;
  room: RoomOption | null;
}

interface ReviewTargetPickerProps {
  kind: "community" | "building" | "room";
  /** 条目所属小区（楼栋/户室条目固定，不出现搜索框） */
  communityId: string | null;
  communityName: string | null;
  /** 户室条目预填：提交楼栋 id + 提交户室号楼层 */
  prefillBuildingId?: number | null;
  prefillFloor?: number | null;
  /** merge=并到哪个 / reject=当场改选（必选） */
  actionLabel: "merge" | "reject";
  selection: TargetSelection;
  onSelectionChange: (next: TargetSelection) => void;
}

export function ReviewTargetPicker({
  kind,
  communityId,
  communityName,
  prefillBuildingId,
  prefillFloor,
  actionLabel,
  selection,
  onSelectionChange,
}: ReviewTargetPickerProps) {
  const isCommunityKind = kind === "community";
  const isRoomKind = kind === "room";

  // 小区条目：全库搜索
  const [commQ, setCommQ] = useState("");
  const [commOptions, setCommOptions] = useState<CommunityOption[]>([]);
  const [searchingComm, setSearchingComm] = useState(false);

  // 楼栋/户室条目：小区固定级联
  const [buildings, setBuildings] = useState<BuildingOption[]>([]);
  const [loadingBuildings, setLoadingBuildings] = useState(false);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const prefillDoneRef = useRef(false);

  const searchCommunities = useCallback(async () => {
    const kw = commQ.trim();
    if (!kw) {
      toast.error("输入小区名或地址检索");
      return;
    }
    setSearchingComm(true);
    try {
      const { data } = await client.GET("/api/v1/admin/building-dictionary/communities", {
        params: { query: { keyword: kw, page: 1, page_size: 10 } },
      });
      if (data) {
        setCommOptions(
          data.items.map((c): CommunityOption => ({
            id: c.id,
            name: c.name,
            district: c.district ?? null,
            address: c.address ?? null,
          })),
        );
        if (data.items.length === 0) toast.error("没找到匹配的小区，换个关键词试试");
      }
    } finally {
      setSearchingComm(false);
    }
  }, [commQ]);

  /** 楼栋/户室条目：加载所属小区楼栋 */
  useEffect(() => {
    if (isCommunityKind || !communityId) return;
    void (async () => {
      setLoadingBuildings(true);
      try {
        const { data } = await client.GET(
          "/api/v1/admin/building-dictionary/communities/{community_id}/buildings",
          { params: { path: { community_id: communityId }, query: { page: 1, page_size: 100 } } },
        );
        if (data) {
          setBuildings(
            data.items
              .filter((b) => !b.pending)
              .map((b): BuildingOption => ({ id: b.id, building_no: b.building_no })),
          );
        }
      } finally {
        setLoadingBuildings(false);
      }
    })();
  }, [isCommunityKind, communityId]);

  /** 选楼栋 → 加载户室（prefillFloor 用于户室条目预填该层首户） */
  const pickBuilding = useCallback(
    async (b: BuildingOption, floor?: number | null) => {
      onSelectionChange({ ...selection, building: b, room: null });
      setSelectedFloor(null);
      setLoadingRooms(true);
      try {
        // P3：楼栋详情户室已分页（默认 200/页）。本选择器要让审核员选到任意目标户室，
        // 单页会使 200 户以上楼栋的高楼层户室无法选择（合并/改选只能选前 200 户），
        // 故逐页取全（实测最大楼栋 928 户）。
        const collected: RoomOption[] = [];
        for (let page = 1; page <= ROOM_MAX_PAGES; page += 1) {
          const { data } = await client.GET(
            "/api/v1/admin/building-dictionary/buildings/{building_id}",
            {
              params: {
                path: { building_id: b.id },
                query: { room_page: page, room_page_size: ROOM_PAGE_SIZE },
              },
            },
          );
          if (!data) break;
          collected.push(
            ...(data.rooms ?? [])
              .filter((r) => !r.pending)
              .map((r): RoomOption => ({
                id: r.id,
                room_no: r.room_no,
                floor: r.floor ?? null,
                plate_no: r.plate_no,
              })),
          );
          if (!data.room_has_more) break;
        }
        setRooms(collected);
        if (floor !== undefined) {
          setSelectedFloor(floor);
          const hit = collected.find((r) => r.floor === floor) ?? collected[0];
          if (hit) onSelectionChange({ ...selection, building: b, room: hit });
        }
      } finally {
        setLoadingRooms(false);
      }
    },
    [selection, onSelectionChange],
  );

  /** 户室条目预填（设计稿：默认提交楼栋 + 提交户室楼层 + 该层首户） */
  useEffect(() => {
    if (isRoomKind && !prefillDoneRef.current && buildings.length > 0 && prefillBuildingId) {
      const b = buildings.find((x) => x.id === prefillBuildingId);
      if (b) {
        prefillDoneRef.current = true;
        void pickBuilding(b, prefillFloor ?? undefined);
      }
    }
  }, [isRoomKind, prefillBuildingId, prefillFloor, buildings, pickBuilding]);

  /** 楼层 chips（从实表户室派生，未分层置底） */
  const floorChips = useMemo(() => {
    const counts = new Map<number | null, number>();
    for (const r of rooms) counts.set(r.floor, (counts.get(r.floor) ?? 0) + 1);
    const chips: { floor: number | null; count: number }[] = [...counts.keys()]
      .filter((f): f is number => f != null)
      .sort((a, b) => a - b)
      .map((f) => ({ floor: f, count: counts.get(f) ?? 0 }));
    if (counts.has(null)) chips.push({ floor: null, count: counts.get(null) ?? 0 });
    return chips;
  }, [rooms]);

  const visibleRooms = useMemo(
    () => (selectedFloor == null ? rooms : rooms.filter((r) => r.floor === selectedFloor)),
    [rooms, selectedFloor],
  );

  return (
    <div className="rounded-2xl border border-dove/40 p-3">
      {isCommunityKind ? (
        <>
          <p className="mb-2 text-[12px] font-medium text-ink">
            选已有小区
            <span className="ml-2 text-[10.5px] font-normal text-dove">
              {actionLabel === "reject" ? "必选（当场改选）" : "并到哪个"}
            </span>
          </p>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-dove" />
              <Input
                value={commQ}
                onChange={(e) => setCommQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void searchCommunities();
                }}
                placeholder="搜目标小区名或地址（覆盖名字差异大的情况）"
                className="h-8 pl-8 text-[12.5px]"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={searchingComm}
              onClick={() => void searchCommunities()}
            >
              {searchingComm ? <Loader2 className="size-3.5 animate-spin" /> : null}
              搜索
            </Button>
          </div>
          {commOptions.length > 0 ? (
            <div className="mt-2 max-h-36 overflow-y-auto rounded-xl border border-dove/30">
              {commOptions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between border-b border-dove/20 px-3 py-2 text-left text-[13px] last:border-0 hover:bg-fog",
                    selection.community?.id === c.id && "bg-apricot-wash/60 text-rust",
                  )}
                  onClick={() => onSelectionChange({ ...selection, community: c })}
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-[11px] text-graphite">
                    {[c.district, c.address].filter(Boolean).join(" · ") || "—"}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="mb-2 text-[12px] font-medium text-ink">
            选已有{isRoomKind ? "户室" : "楼栋"}
            <span className="ml-2 text-[10.5px] font-normal text-dove">
              小区固定为「{communityName ?? "—"}」
              {actionLabel === "reject" ? " · 必选（当场改选）" : ""}
            </span>
          </p>
          {/* 楼栋 chips */}
          {loadingBuildings ? (
            <Loader2 className="size-4 animate-spin text-graphite" />
          ) : (
            <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
              {buildings.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={cn(
                    "rounded-md border px-2 py-1 font-mono text-[12px]",
                    selection.building?.id === b.id
                      ? "border-ink bg-ink text-white"
                      : "border-dove/50 text-ink hover:border-ash",
                  )}
                  onClick={() => void pickBuilding(b)}
                >
                  {b.building_no}栋
                </button>
              ))}
              {buildings.length === 0 ? (
                <span className="py-1 text-[11px] text-dove">本小区暂无实表楼栋</span>
              ) : null}
            </div>
          )}
          {/* 楼层 chips（户室条目） */}
          {isRoomKind && selection.building ? (
            <div className="mt-2">
              <p className="mb-1 text-[11px] text-graphite">楼层</p>
              <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
                {floorChips.map((f) => (
                  <button
                    key={f.floor ?? "none"}
                    type="button"
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[11.5px] tabular-nums",
                      selectedFloor === f.floor
                        ? "border-ink bg-ink text-white"
                        : "border-dove/50 text-ink hover:border-ash",
                    )}
                    onClick={() => setSelectedFloor(f.floor)}
                  >
                    {f.floor == null ? "楼层待定" : `${f.floor} 层`}
                    <span className="ml-1 text-[9.5px] opacity-60">{f.count}户</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {/* 户室网格（户室条目） */}
          {isRoomKind && selection.building ? (
            <div className="mt-2">
              <p className="mb-1 text-[11px] text-graphite">户室（必选）</p>
              {loadingRooms ? (
                <Loader2 className="size-4 animate-spin text-graphite" />
              ) : (
                <div className="grid max-h-28 grid-cols-8 gap-1 overflow-y-auto">
                  {visibleRooms.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className={cn(
                        "rounded border px-1 py-0.5 text-[11px] tabular-nums",
                        selection.room?.id === r.id
                          ? "border-ink bg-ink text-white"
                          : "border-dove/50 text-ink hover:border-ash",
                      )}
                      onClick={() => onSelectionChange({ ...selection, room: r })}
                    >
                      {r.plate_no}
                    </button>
                  ))}
                  {visibleRooms.length === 0 ? (
                    <span className="col-span-8 py-1 text-[11px] text-dove">
                      该楼栋暂无实表户室
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
