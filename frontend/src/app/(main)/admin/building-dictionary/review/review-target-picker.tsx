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
import { formatBuildingLabel } from "@/lib/dict-display";
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
  /** 待审楼栋（pending=true 时 id 恒为 0，真实条目 id 见 pending_id） */
  pending?: boolean;
  pending_id?: number | null;
}

interface RoomOption {
  id: number;
  room_no: string;
  floor: number | null;
  plate_no: string;
  pending?: boolean;
  pending_id?: number | null;
}

/**
 * 「用已有的」目标可用性（BR-29，由本组件上报给审核弹层）：
 * - ``available``：本小区/本楼栋存在可合并目标（含待审兄弟条目）；
 * - ``empty``：一条都没有 —— 审核弹层据此把默认动作降级为「确认新增」并摘掉推荐标；
 * - ``unknown``：尚未加载完（保持设计稿默认 merge，但不显示推荐标）。
 */
export type MergeAvailability = "available" | "empty" | "unknown";

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
  /** 可选目标可用性上报（BR-29：驱动审核弹层的默认动作与推荐标） */
  onAvailabilityChange?: (availability: MergeAvailability) => void;
  /** 是否把待审兄弟条目也列为可合并目标（BR-29，仅 merge 生效） */
  allowPendingTargets?: boolean;
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
  onAvailabilityChange,
  allowPendingTargets = true,
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
  const [buildingQ, setBuildingQ] = useState("");
  /** 楼栋搜索请求序号：只采纳最后一次请求的结果，防慢请求乱序回包覆盖新结果 */
  const buildingSearchSeqRef = useRef(0);
  /**
   * 小区下是否至少有一栋楼（不受关键词搜索影响）。
   *
   * 不能用 ``buildings.length``：搜索无结果时长度同样为 0，会把「搜不到」
   * 误判成「小区无楼栋」，进而让审核弹层把默认动作降级为「确认新增」。
   */
  const [hasAnyBuildings, setHasAnyBuildings] = useState<boolean | null>(null);
  /**
   * 楼栋列表是否**至少完成过一次加载**（BR-29 关键状态）.
   *
   * 不能用 ``buildings.length === 0`` 直接判「无目标」：初始态也是空数组，
   * 会在数据到达前就上报 empty → 审核弹层把默认动作切成「确认新增」→
   * ``needTarget`` 变 false 导致本组件被卸载 → 楼栋请求永不发出 →
   * 死锁在「无目标」（实测被 bd-iteration-fix 回归用例抓到）。
   */
  const [buildingsLoaded, setBuildingsLoaded] = useState(false);
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

  /** 楼栋/户室条目：按关键词搜索所属小区楼栋（与小区选择器同款交互） */
  const searchBuildings = useCallback(
    async (keyword: string) => {
      if (!communityId) return;
      const kw = keyword.trim();
      const seq = (buildingSearchSeqRef.current += 1);
      setLoadingBuildings(true);
      try {
        const { data } = await client.GET(
          "/api/v1/admin/building-dictionary/communities/{community_id}/buildings",
          {
            params: {
              path: { community_id: communityId },
              query: { page: 1, page_size: 100, keyword: kw || undefined },
            },
          },
        );
        // 乱序回包守卫：仅当仍是最后一次请求时才落地结果（输入改了又搜/连点搜索时，
        // 慢的旧请求后回包会把新结果覆盖回旧列表）
        if (data && seq === buildingSearchSeqRef.current) {
          // BR-29：待审楼栋不再被过滤 —— 新小区/新楼栋下常常一条实表都没有
          // （实测 2066/21732 个小区无楼栋），旧实现只列实表 → 无目标 → 提交按钮永久置灰。
          const items = data.items.map((b): BuildingOption => ({
            id: b.id,
            building_no: b.building_no,
            pending: b.pending === true,
            pending_id: b.pending_id ?? null,
          }));
          setBuildings(items);
          if (!kw) setHasAnyBuildings(data.total > 0 || items.length > 0);
        }
      } finally {
        if (seq === buildingSearchSeqRef.current) {
          setLoadingBuildings(false);
          // 无论成功失败都置位：失败时继续 unknown 会让弹层永远停在「待定」，
          // 置位后可如实上报 empty 并给出「改用确认新增」的明确引导。
          setBuildingsLoaded(true);
        }
      }
    },
    [communityId],
  );

  /** 初始加载小区楼栋 */
  useEffect(() => {
    if (isCommunityKind || !communityId) return;
    void searchBuildings("");
  }, [isCommunityKind, communityId, searchBuildings]);

  /**
   * BR-29：上报「用已有的」可用性（驱动审核弹层的默认动作/推荐标）.
   *
   * 判定口径：
   * - 小区条目：全库搜索，恒 available（总能搜到目标，搜不到是操作问题不是无数据）；
   * - 楼栋条目：所属小区楼栋数（含待审兄弟）> 0；
   * - 户室条目：所属楼栋户室数（含待审兄弟）> 0 —— 仅在选中楼栋后才知道，
   *   在户室加载完成后才上报；
   * - 归属小区为空 / 父楼栋不存在：直接 empty（无路可走）。
   */
  useEffect(() => {
    if (!onAvailabilityChange) return;
    if (isCommunityKind) {
      onAvailabilityChange("available");
      return;
    }
    if (!communityId) {
      onAvailabilityChange("empty");
      return;
    }
    // 首次加载未完成前一律 unknown —— 空数组只代表「还不知道」，不代表「没有」
    if (loadingBuildings || !buildingsLoaded) {
      onAvailabilityChange("unknown");
      return;
    }
    if (isRoomKind) {
      // 户室条目要选到楼栋后才知有无户室；未选楼栋前先按楼栋可用性判定
      if (!selection.building) {
        onAvailabilityChange((hasAnyBuildings ?? buildings.length > 0) ? "unknown" : "empty");
        return;
      }
      if (loadingRooms) {
        onAvailabilityChange("unknown");
        return;
      }
      onAvailabilityChange(rooms.length > 0 ? "available" : "empty");
      return;
    }
    onAvailabilityChange((hasAnyBuildings ?? buildings.length > 0) ? "available" : "empty");
  }, [
    onAvailabilityChange,
    isCommunityKind,
    isRoomKind,
    communityId,
    loadingBuildings,
    buildingsLoaded,
    loadingRooms,
    hasAnyBuildings,
    buildings.length,
    rooms.length,
    selection.building,
  ]);

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
            // BR-29：待审户室同样保留（待审户室的 id 为 0，真实条目 id 在 pending_id）
            ...(data.rooms ?? []).map((r): RoomOption => ({
              id: r.id,
              room_no: r.room_no,
              floor: r.floor ?? null,
              plate_no: r.plate_no,
              pending: r.pending === true,
              pending_id: r.pending_id ?? null,
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
          {/*
            BR-29：归属小区缺失（待审户室挂的父楼栋已被删除）时，级联无从加载。
            实测本地 41 条待审户室中 30 条属于此类 —— 旧实现面板一片空白、连提示都没有。
          */}
          {!communityId ? (
            <p className="mb-2 rounded-lg bg-[#fff5f5] px-3 py-2 text-[11.5px] leading-relaxed text-error">
              该条目的归属小区已丢失（父楼栋可能已被删除），无法列出可合并目标。
              请改用「确认新增」或「驳回」。
            </p>
          ) : null}
          {communityId ? (
            <div className="mb-2 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-dove" />
                <Input
                  value={buildingQ}
                  onChange={(e) => setBuildingQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void searchBuildings(buildingQ);
                  }}
                  placeholder="搜楼栋号（如 285）"
                  aria-label="搜索楼栋号"
                  className="h-8 pl-8 text-[12.5px]"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={loadingBuildings}
                onClick={() => void searchBuildings(buildingQ)}
              >
                {loadingBuildings ? <Loader2 className="size-3.5 animate-spin" /> : null}
                搜索
              </Button>
            </div>
          ) : null}
          {/* 楼栋 chips */}
          {loadingBuildings ? (
            <Loader2 className="size-4 animate-spin text-graphite" />
          ) : (
            <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
              {buildings.map((b) => (
                <button
                  key={b.pending ? `p-${b.pending_id}` : b.id}
                  type="button"
                  disabled={b.pending === true && !allowPendingTargets}
                  title={
                    b.pending
                      ? allowPendingTargets
                        ? "待审楼栋：选它会把来源单据改指到它，并顺手把它转正"
                        : "待审楼栋：仅合并时可作为目标"
                      : undefined
                  }
                  className={cn(
                    "rounded-md border px-2 py-1 font-mono text-[12px]",
                    selection.building?.id === b.id &&
                      selection.building?.pending_id === b.pending_id
                      ? "border-ink bg-ink text-white"
                      : "border-dove/50 text-ink hover:border-ash",
                    b.pending && "border-dashed text-graphite",
                    b.pending === true && !allowPendingTargets && "cursor-not-allowed opacity-50",
                  )}
                  onClick={() => void pickBuilding(b)}
                >
                  {formatBuildingLabel(b.building_no)}
                  {b.pending ? <span className="ml-1 text-[9.5px] opacity-70">待审</span> : null}
                </button>
              ))}
              {buildings.length === 0 ? (
                <span className="py-1 text-[11px] text-dove">
                  {hasAnyBuildings
                    ? "没有匹配的楼栋，换个楼栋号试试"
                    : "本小区暂无任何楼栋（含待审）—— 无可用合并目标，请改用「确认新增」"}
                </span>
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
                      key={r.pending ? `p-${r.pending_id}` : r.id}
                      type="button"
                      disabled={r.pending === true && !allowPendingTargets}
                      title={
                        r.pending
                          ? allowPendingTargets
                            ? "待审户室：选它会把来源单据改指到它，并顺手把它转正"
                            : "待审户室：仅合并时可作为目标"
                          : undefined
                      }
                      className={cn(
                        "rounded border px-1 py-0.5 text-[11px] tabular-nums",
                        selection.room?.id === r.id && selection.room?.pending_id === r.pending_id
                          ? "border-ink bg-ink text-white"
                          : "border-dove/50 text-ink hover:border-ash",
                        r.pending && "border-dashed text-graphite",
                        r.pending === true &&
                          !allowPendingTargets &&
                          "cursor-not-allowed opacity-50",
                      )}
                      onClick={() => onSelectionChange({ ...selection, room: r })}
                    >
                      {r.plate_no}
                    </button>
                  ))}
                  {visibleRooms.length === 0 ? (
                    <span className="col-span-8 py-1 text-[11px] text-dove">
                      该楼栋暂无任何户室（含待审）—— 无可用合并目标
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
