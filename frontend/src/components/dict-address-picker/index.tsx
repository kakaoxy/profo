"use client";

/**
 * 四级地址选择器（共享组件 dict-address-picker，FR-09 / R6，设计稿 ARTBOARD 04）.
 * [不拆分理由] 四级级联（小区→楼栋→楼层→户室）共享同一份 v 状态与互斥清空逻辑，
 * 且被 project/lead/marketing/property 四类表单复用；拆分需跨文件传递 9 个
 * 联动状态，单文件承载是复杂度最低的形态。
 *
 * 级联：小区联想（复用 GET /admin/communities 含别名）→ 楼栋 → 楼层 → 户室；
 * - 楼栋/楼层/户室为选填渐进级联，仅选小区即满足必填；
 * - 楼层列 = 名义 ∪ 实际 ∪ pending（未分层置底，FR-04）；
 * - 门牌自动拼装可手改（0401 → 401；非标户室回退手填提示 BR-12）；
 * - 「＋新建楼栋 / 新建楼层 / 新建户室」入口：提交进审核池（不阻塞表单，FR-10）；
 * - pending 条目全系统可见带「未审核」标签（虚线/置灰）；本流程新建的楼栋/户室
 *   未审核也可选（选中回填 new_* 载荷，审核通过后自动关联，不阻塞录入流程），
 *   待审楼栋下可继续新建户室（parent=pending_building，BR-28 审核拓扑）；
 *   其他流程的 pending 保持置灰（hover「审核中，通过后可选」，BR-23）；
 * - 兼容模式：小区字段旁轻量入口切换手填地址（dict_status=manual）；
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Building2, ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { client } from "@/lib/api-client";

export interface DictAddressValue {
  /** 字典小区ID（兼容模式下可空） */
  communityId: string | null;
  communityName: string;
  /** 小区行政区/商圈（选中字典小区时下发，供表单回填） */
  district?: string | null;
  businessCircle?: string | null;
  buildingId: number | null;
  buildingNo: string;
  roomId: number | null;
  roomNo: string;
  /** 门牌预览（自动拼装结果，可手改） */
  address: string;
  /** linked=字典数据 / manual=兼容模式手填 / pending=提交了新增待审 */
  dictStatus: "linked" | "manual" | "pending" | null;
  /** 录入端新增载荷（搜不到时提交进审核池，FR-10） */
  newCommunity?: { name: string; district?: string | null; business_circle?: string | null } | null;
  newBuilding?: { name: string } | null;
  newRoom?: { name: string } | null;
}

export interface DictAddressPickerProps {
  value: DictAddressValue | null;
  onChange: (value: DictAddressValue) => void;
  /** 来源单据（回显 pending 选中用，AC-P3-1） */
  sourceBizType?: "project" | "lead" | "marketing" | "property";
  sourceBizId?: string;
  /** 是否允许「新增小区」入口（项目/线索/营销表单 = true） */
  allowCreate?: boolean;
  /** 是否允许「手动填写地址」兼容模式入口（默认 true；营销表单传 false，统一走字典选择） */
  allowManual?: boolean;
  disabled?: boolean;
  className?: string;
}

interface CommunityOption {
  id: string;
  name: string;
  district?: string | null;
  business_circle?: string | null;
}

interface BuildingOption {
  id: number;
  building_no: string;
  pending: boolean;
  pending_id: number | null;
}

interface RoomOption {
  id: number;
  room_no: string;
  floor: number | null;
  pending: boolean;
  pending_id: number | null;
  plate_no: string;
}

interface FloorGroup {
  floor: number | null;
  room_count: number;
  has_pending: boolean;
}

/** 生成门牌预览：小区名 + 楼栋号 + 户号映射（0401→401） */
function buildPlate(communityName: string, buildingNo: string, plateNo: string): string {
  const parts = [communityName, buildingNo && `${buildingNo}号`, plateNo].filter(Boolean);
  return parts.join(" ");
}

/** 楼栋列分页大小（大社区只渲染当页 + 滚动加载更多，防卡顿） */
const BUILDING_PAGE_SIZE = 50;

/** 户室号解析楼层（与后端 parse_room_floor 对齐：0401→4、202→2；非标为 null） */
function floorOfRoom(roomNo: string): number | null {
  if (/^\d{4}$/.test(roomNo)) {
    const f = parseInt(roomNo.slice(0, 2), 10);
    return f > 0 ? f : null;
  }
  if (/^\d{3}$/.test(roomNo)) {
    const f = parseInt(roomNo[0], 10);
    return f > 0 ? f : null;
  }
  return null;
}

/** 门牌户号映射（与后端 format_plate_no 对齐：0401→401，非标/0 层原样返回） */
function plateOfRoom(roomNo: string): string {
  if (!/^\d{4}$/.test(roomNo) || parseInt(roomNo.slice(0, 2), 10) <= 0) return roomNo;
  return String(Number(roomNo));
}

export function DictAddressPicker({
  value,
  onChange,
  sourceBizType,
  sourceBizId,
  allowCreate = true,
  allowManual = true,
  disabled = false,
  className,
}: DictAddressPickerProps) {
  const [manualMode, setManualMode] = useState(value?.dictStatus === "manual");
  const [communityOpen, setCommunityOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [communityOptions, setCommunityOptions] = useState<CommunityOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [buildings, setBuildings] = useState<BuildingOption[]>([]);
  const [buildingKeyword, setBuildingKeyword] = useState("");
  const [buildingPage, setBuildingPage] = useState(1);
  const [buildingTotal, setBuildingTotal] = useState(0);
  const [loadingMoreBuildings, setLoadingMoreBuildings] = useState(false);
  const [floors, setFloors] = useState<FloorGroup[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [selectedFloor, setSelectedFloor] = useState<number | null | "all">(null);
  const [loadingBuildings, setLoadingBuildings] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [manualAddress, setManualAddress] = useState(value?.address ?? "");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const buildingSearchRef = useRef<NodeJS.Timeout | null>(null);

  const v: DictAddressValue = useMemo(
    () =>
      value ?? {
        communityId: null,
        communityName: "",
        buildingId: null,
        buildingNo: "",
        roomId: null,
        roomNo: "",
        address: "",
        dictStatus: null,
      },
    [value],
  );

  /** 小区联想（防抖） */
  useEffect(() => {
    if (!communityOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!keyword.trim()) {
        setCommunityOptions([]);
        return;
      }
      setSearching(true);
      try {
        const { data, error } = await client.GET("/api/v1/admin/building-dictionary/communities", {
          params: { query: { keyword: keyword.trim(), page: 1, page_size: 20 } },
        });
        if (!error && data) {
          setCommunityOptions(
            data.items.map((c) => ({
              id: c.id,
              name: c.name,
              district: c.district ?? null,
              business_circle: c.business_circle ?? null,
            })),
          );
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [keyword, communityOpen]);

  /** 楼栋列表：服务端 keyword 搜索 + 分页懒加载（大社区只渲染当页，防卡顿） */
  const loadBuildings = useCallback(
    async (communityId: string, opts?: { keyword?: string; page?: number; append?: boolean }) => {
      const kw = opts?.keyword ?? "";
      const pg = opts?.page ?? 1;
      const append = opts?.append ?? false;
      if (append) {
        setLoadingMoreBuildings(true);
      } else {
        setLoadingBuildings(true);
      }
      try {
        const { data, error } = await client.GET(
          "/api/v1/admin/building-dictionary/communities/{community_id}/buildings",
          {
            params: {
              path: { community_id: communityId },
              query: {
                page: pg,
                page_size: BUILDING_PAGE_SIZE,
                keyword: kw || undefined,
                ...(sourceBizType && sourceBizId
                  ? { source_biz_type: sourceBizType, source_biz_id: sourceBizId }
                  : {}),
              },
            },
          },
        );
        if (!error && data) {
          const items = data.items.map((b) => ({
            id: b.id,
            building_no: b.building_no,
            pending: b.pending,
            pending_id: b.pending_id ?? null,
          }));
          setBuildings((prev) => (append ? [...prev, ...items] : items));
          setBuildingTotal(data.total);
          setBuildingPage(pg);
        }
      } finally {
        if (append) {
          setLoadingMoreBuildings(false);
        } else {
          setLoadingBuildings(false);
        }
      }
    },
    [sourceBizType, sourceBizId],
  );

  /** 楼栋搜索防抖 + 小区切换首载（统一走 effect，避免双请求） */
  const activeCommunityId = v.communityId;
  useEffect(() => {
    if (!activeCommunityId) return;
    if (buildingSearchRef.current) clearTimeout(buildingSearchRef.current);
    buildingSearchRef.current = setTimeout(() => {
      void loadBuildings(activeCommunityId, { keyword: buildingKeyword, page: 1 });
    }, 300);
    return () => {
      if (buildingSearchRef.current) clearTimeout(buildingSearchRef.current);
    };
  }, [activeCommunityId, buildingKeyword, loadBuildings]);

  /** 楼栋「加载更多」 */
  const loadMoreBuildings = useCallback(() => {
    if (!v.communityId) return;
    void loadBuildings(v.communityId, {
      keyword: buildingKeyword,
      page: buildingPage + 1,
      append: true,
    });
  }, [v.communityId, buildingKeyword, buildingPage, loadBuildings]);

  /** 选中楼栋后加载楼层分组 + 户室 */
  const loadRooms = useCallback(
    async (buildingId: number) => {
      setLoadingRooms(true);
      setRooms([]);
      try {
        const [floorRes, roomRes] = await Promise.all([
          client.GET("/api/v1/admin/building-dictionary/buildings/{building_id}/floors", {
            params: { path: { building_id: buildingId } },
          }),
          client.GET("/api/v1/admin/building-dictionary/buildings/{building_id}", {
            params: {
              path: { building_id: buildingId },
              // P3：户室分页（默认 200/页）；四级级联按楼层筛选，取上限 500 覆盖单栋绝大多数楼层
              query: {
                room_page: 1,
                room_page_size: 500,
                ...(sourceBizType && sourceBizId
                  ? { source_biz_type: sourceBizType, source_biz_id: sourceBizId }
                  : {}),
              },
            },
          }),
        ]);
        if (!floorRes.error && floorRes.data) {
          setFloors(
            floorRes.data.map((g): FloorGroup => ({
              floor: g.floor ?? null,
              room_count: g.room_count,
              has_pending: g.has_pending,
            })),
          );
        }
        if (!roomRes.error && roomRes.data) {
          setRooms(
            (roomRes.data.rooms ?? []).map((r) => ({
              id: r.id,
              room_no: r.room_no,
              floor: r.floor ?? null,
              pending: r.pending,
              pending_id: r.pending_id ?? null,
              plate_no: r.plate_no,
            })),
          );
        }
      } finally {
        setLoadingRooms(false);
      }
    },
    [sourceBizType, sourceBizId],
  );

  const emit = useCallback(
    (patch: Partial<DictAddressValue>) => {
      onChange({ ...v, ...patch });
    },
    [onChange, v],
  );

  /** 提交新增小区进审核池（FR-10，不阻塞表单） */
  const handleCreateCommunity = useCallback(async () => {
    if (!keyword.trim()) return;
    try {
      const { data, error } = await client.POST("/api/v1/admin/building-dictionary/pending", {
        body: {
          kind: "community",
          name: keyword.trim(),
          source_type: sourceBizType ?? null,
          source_id: sourceBizId ?? null,
        },
      });
      if (error || !data) {
        toast.error("提交新增小区失败");
        return;
      }
      toast.success("已提交审核池，小区审核通过后自动关联");
      emit({
        communityId: null,
        communityName: keyword.trim(),
        buildingId: null,
        buildingNo: "",
        roomId: null,
        roomNo: "",
        address: keyword.trim(),
        dictStatus: "pending",
        newCommunity: { name: keyword.trim() },
        newBuilding: null,
        newRoom: null,
      });
      setCommunityOpen(false);
    } catch {
      toast.error("提交新增小区失败");
    }
  }, [keyword, sourceBizType, sourceBizId, emit]);

  /** 提交新增楼栋进审核池 */
  const handleCreateBuilding = useCallback(async () => {
    if (!v.communityId) return;
    const no = window.prompt("新楼栋号（如 122乙）——提交后进入审核池：");
    if (!no || !no.trim()) return;
    const buildingNo = no.trim();
    if (buildings.some((b) => b.building_no === buildingNo)) {
      toast.error(`楼栋「${buildingNo}」已存在 → 建议直接选择（用已有的）`);
      return;
    }
    const { data, error } = await client.POST("/api/v1/admin/building-dictionary/pending", {
      body: {
        kind: "building",
        name: buildingNo,
        parent_kind: "community",
        parent_id: v.communityId,
        source_type: sourceBizType ?? null,
        source_id: sourceBizId ?? null,
      },
    });
    if (error || !data) {
      toast.error("提交新楼栋失败");
      return;
    }
    toast.success(`已提交「新楼栋 ${buildingNo}」→ 审核池；通过前带「未审核」标签展示`);
    emit({
      newBuilding: { name: buildingNo },
      buildingId: null,
      buildingNo: "",
      roomId: null,
      roomNo: "",
    });
    void loadBuildings(v.communityId, { keyword: buildingKeyword, page: 1 });
  }, [v.communityId, buildings, buildingKeyword, sourceBizType, sourceBizId, emit, loadBuildings]);

  /** 选中的待审楼栋（本流程新建：buildingId 为空、楼栋号命中楼栋列 pending 项） */
  const selectedPendingBuilding = useMemo(
    () =>
      v.buildingId == null && v.buildingNo
        ? (buildings.find((b) => b.pending && b.building_no === v.buildingNo) ?? null)
        : null,
    [buildings, v.buildingId, v.buildingNo],
  );

  /** 提交新增户室进审核池（新楼层 = 提交该层首个户室，隐式建层，楼层从户室号解析）.
   *
   * 待审楼栋下可继续新建：parent 挂 pending_building 条目（BR-28 审核拓扑），
   * 创建即选中并回填 newRoom 载荷（待审楼栋无实表 id，户室列表不可拉取）。
   */
  const handleCreateRoom = useCallback(async () => {
    // 分支一：父级为待审楼栋条目
    if (selectedPendingBuilding) {
      const raw = window.prompt(
        `新户室号（如 0403）——挂待审楼栋「${v.buildingNo}」下，提交后进入审核池：`,
      );
      if (!raw || !raw.trim()) return;
      const roomNo = raw.trim();
      if (floorOfRoom(roomNo) == null) {
        toast.error("户室号需为3位或4位纯数字，且楼层位>0（如202=2层、0403=4层）");
        return;
      }
      const { data, error } = await client.POST("/api/v1/admin/building-dictionary/pending", {
        body: {
          kind: "room",
          name: roomNo,
          parent_kind: "pending_building",
          parent_id: String(selectedPendingBuilding.pending_id),
          source_type: sourceBizType ?? null,
          source_id: sourceBizId ?? null,
        },
      });
      if (error || !data) {
        toast.error("提交新户室失败");
        return;
      }
      toast.success(`已提交「${v.buildingNo}号 ${roomNo}」→ 审核池（挂待审楼栋）`);
      emit({
        newRoom: { name: roomNo },
        roomId: null,
        roomNo,
        address: buildPlate(v.communityName, v.buildingNo, plateOfRoom(roomNo)),
        dictStatus: "pending",
      });
      return;
    }
    // 分支二：父级为实表楼栋
    if (!v.communityId || !v.buildingId) return;
    const raw = window.prompt(
      selectedFloor != null && selectedFloor !== "all"
        ? `该层首个新户室号（两位，如 03）→ ${String(selectedFloor).padStart(2, "0")}□□，提交后进入审核池：`
        : "新户室号（如 0403）——提交后进入审核池：",
    );
    if (!raw || !raw.trim()) return;
    const roomNo = raw.trim();
    const f = floorOfRoom(roomNo);
    if (f == null) {
      toast.error("户室号需为3位或4位纯数字，且楼层位>0（如202=2层、0403=4层）");
      return;
    }
    if (rooms.some((r) => r.room_no === roomNo)) {
      toast.error(`户室「${roomNo}」已存在 → 建议直接选择（用已有的）`);
      return;
    }
    const { data, error } = await client.POST("/api/v1/admin/building-dictionary/pending", {
      body: {
        kind: "room",
        name: roomNo,
        parent_kind: "building",
        parent_id: String(v.buildingId),
        source_type: sourceBizType ?? null,
        source_id: sourceBizId ?? null,
      },
    });
    if (error || !data) {
      toast.error("提交新户室失败");
      return;
    }
    toast.success(`已提交「新户室 ${v.buildingNo}号 ${roomNo}」→ 审核池；通过后该层自动出现`);
    emit({ newRoom: { name: roomNo }, roomId: null, roomNo: "" });
    void loadRooms(v.buildingId);
  }, [
    v.communityId,
    v.buildingId,
    v.buildingNo,
    v.communityName,
    selectedFloor,
    rooms,
    selectedPendingBuilding,
    sourceBizType,
    sourceBizId,
    emit,
    loadRooms,
  ]);

  /** 楼层过滤后的户室（选中楼层展示该层；否则全部） */
  const visibleRooms = useMemo(() => {
    if (selectedFloor == null || selectedFloor === "all") return rooms;
    return rooms.filter((r) => r.floor === selectedFloor);
  }, [rooms, selectedFloor]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {manualMode ? (
        <div className="flex flex-col gap-4 rounded-cards border border-dove/40 bg-white p-4">
          <p className="flex items-center gap-1.5 text-[12px] text-graphite">
            <AlertTriangle className="size-3.5 text-rust" />
            兼容模式：手动填写不经楼盘字典，行政区/商圈需自行填写
          </p>
          {/* 手填模式下小区名称仍需可填（表单 community_name 必填校验依赖） */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium uppercase tracking-wider text-graphite">
              小区名称 <span className="text-rust">*</span>
            </Label>
            <Input
              value={v.communityName}
              onChange={(e) => emit({ communityName: e.target.value, dictStatus: "manual" })}
              placeholder="手动输入小区名称"
              disabled={disabled}
              className="h-10 rounded-inputs border-dove/50 bg-white text-sm font-medium text-ink focus-visible:ring-ink/10"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium uppercase tracking-wider text-graphite">
                手填地址
              </Label>
              <button
                type="button"
                className="flex items-center gap-0.5 text-[12px] text-rust hover:underline"
                disabled={disabled}
                onClick={() => {
                  setManualMode(false);
                  emit({ dictStatus: null });
                }}
              >
                返回字典选择
              </button>
            </div>
            <Input
              value={manualAddress}
              onChange={(e) => {
                setManualAddress(e.target.value);
                emit({ address: e.target.value, dictStatus: "manual" });
              }}
              placeholder="如：泗塘三村61号401"
              disabled={disabled}
              className="h-10 rounded-inputs border-dove/50 bg-white text-sm font-medium text-ink focus-visible:ring-ink/10"
            />
          </div>
        </div>
      ) : (
        <div className="@container flex flex-col gap-4 rounded-cards border border-dove/40 bg-white p-4">
          {/* 选中进度指示：小区必选，楼栋/户室选填（选中后逐级点亮，与表单其余 Steep 字段风格一致） */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[13px]">
              {(
                [
                  { label: v.communityName, active: !!v.communityName },
                  { label: v.buildingNo ? `${v.buildingNo}号` : null, active: !!v.buildingNo },
                  { label: v.roomNo ? plateOfRoom(v.roomNo) : null, active: !!v.roomNo },
                ] as const
              ).some((s) => s.label) ? (
                <>
                  {(
                    [
                      { label: v.communityName, active: true },
                      { label: v.buildingNo ? `${v.buildingNo}号` : null, active: !!v.buildingNo },
                      { label: v.roomNo ? plateOfRoom(v.roomNo) : null, active: !!v.roomNo },
                    ] as const
                  )
                    .filter((s) => s.label)
                    .map((s, i) => (
                      <span key={i} className="flex min-w-0 items-center gap-1.5">
                        {i > 0 ? <ChevronRight className="size-3 shrink-0 text-dove" /> : null}
                        <span
                          className={cn(
                            "truncate font-medium",
                            s.active ? "text-ink" : "text-graphite",
                          )}
                        >
                          {s.label}
                        </span>
                      </span>
                    ))}
                  {v.dictStatus === "pending" ? (
                    <Badge className="h-4 px-1 text-[9px]" variant="outline">
                      未审核
                    </Badge>
                  ) : null}
                </>
              ) : (
                <span className="text-[13px] text-dove">从楼盘字典选择地址</span>
              )}
            </div>
            {allowManual ? (
              <button
                type="button"
                className="shrink-0 text-[12px] text-rust hover:underline"
                disabled={disabled}
                onClick={() => {
                  setManualMode(true);
                  setManualAddress(v.address);
                  emit({
                    dictStatus: "manual",
                    communityId: null,
                    buildingId: null,
                    roomId: null,
                    newCommunity: null,
                    newBuilding: null,
                    newRoom: null,
                    district: null,
                    businessCircle: null,
                  });
                }}
              >
                手动填写地址
              </button>
            ) : null}
          </div>

          {/* 一级：小区联想 */}
          <div className="flex flex-col gap-1.5">
            <Popover open={communityOpen} onOpenChange={setCommunityOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  disabled={disabled}
                  className={cn(
                    "h-11 justify-between rounded-inputs border-dove/50 bg-white px-4 text-sm font-medium shadow-none focus-visible:ring-ink/10",
                    !v.communityName && "text-dove",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Building2 className="size-4 shrink-0 text-graphite" />
                    <span className="truncate font-normal">
                      {v.communityName ||
                        (v.dictStatus === "pending" ? `${v.communityName}（未审核）` : "搜索小区…")}
                    </span>
                  </span>
                  {searching ? (
                    <Loader2 className="size-4 shrink-0 animate-spin" />
                  ) : (
                    <Search className="size-4 shrink-0 text-graphite" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-88 rounded-2xl border-dove/40 p-0 shadow-steep-sm"
                align="start"
              >
                <div className="border-b border-dove/30 p-2">
                  <Input
                    autoFocus
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="输入小区名/地址/别名搜索"
                    className="h-10 rounded-xl border-dove/40 bg-fog text-sm font-medium focus-visible:ring-ink/10"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto p-1.5">
                  {communityOptions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[14px] transition-colors hover:bg-fog",
                        v.communityId === c.id && "bg-fog font-medium text-ink",
                      )}
                      onClick={() => {
                        emit({
                          communityId: c.id,
                          communityName: c.name,
                          district: c.district ?? null,
                          businessCircle: c.business_circle ?? null,
                          buildingId: null,
                          buildingNo: "",
                          roomId: null,
                          roomNo: "",
                          address: c.name,
                          dictStatus: null,
                          newCommunity: null,
                        });
                        setSelectedFloor(null);
                        setCommunityOpen(false);
                        // 楼栋列表由 effect 统一加载（小区切换重置搜索词后自动首载）
                        setBuildingKeyword("");
                        setRooms([]);
                        setFloors([]);
                      }}
                    >
                      <span>{c.name}</span>
                      {c.district ? (
                        <span className="text-[12px] text-graphite">{c.district}</span>
                      ) : null}
                    </button>
                  ))}
                  {keyword.trim() && !searching && communityOptions.length === 0 ? (
                    allowCreate ? (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-rust transition-colors hover:bg-fog"
                        onClick={handleCreateCommunity}
                      >
                        <Plus className="size-4" />
                        新增小区「{keyword.trim()}」（需审核，项目照常建）
                      </button>
                    ) : (
                      <p className="px-2 py-4 text-center text-[13px] text-graphite">无匹配小区</p>
                    )
                  ) : null}
                  {!keyword.trim() && communityOptions.length === 0 ? (
                    <p className="px-2 py-4 text-center text-[13px] text-dove">
                      输入关键字搜索小区
                    </p>
                  ) : null}
                </div>
              </PopoverContent>
            </Popover>
            {v.dictStatus === "pending" && !v.communityId ? (
              <p className="flex items-center gap-1 text-[13px] text-amber-700">
                <AlertTriangle className="size-3.5" />
                小区审核中，通过后开放楼栋/户室选择
              </p>
            ) : null}
          </div>

          {/* 二~四级：楼栋 / 楼层 / 户室 三栏级联（选填下钻，参考设计稿 casc 三栏式） */}
          {v.communityId ? (
            <div className="grid grid-cols-1 gap-2 @[560px]:grid-cols-[1.2fr_0.8fr_1.6fr]">
              {/* 栏一：楼栋（搜索 + 分页懒加载 + 新建入口） */}
              <div className="flex min-w-0 flex-col rounded-2xl border border-dove/40 bg-fog/60">
                <div className="flex items-center justify-between border-b border-dove/30 px-3 py-2">
                  <span className="text-[12px] font-medium text-ink">
                    楼栋 <span className="ml-0.5 text-[10px] font-normal text-dove">选填</span>
                    {buildingTotal > 0 ? (
                      <span className="ml-1 text-[10px] font-normal text-dove tabular-nums">
                        {buildingTotal}
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="flex items-center gap-0.5 text-[11px] text-rust hover:underline"
                    disabled={disabled}
                    onClick={() => void handleCreateBuilding()}
                  >
                    <Plus className="size-3" />
                    新建
                  </button>
                </div>
                <div className="border-b border-dove/20 px-2 py-1.5">
                  <input
                    value={buildingKeyword}
                    onChange={(e) => setBuildingKeyword(e.target.value)}
                    placeholder="搜楼栋号…"
                    disabled={disabled}
                    className="h-7 w-full rounded-lg bg-white px-2.5 text-[12px] text-ink shadow-none outline-none placeholder:text-dove"
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-1.5" style={{ maxHeight: 176 }}>
                  {!loadingBuildings && buildings.length === 0 ? (
                    <p className="px-2 py-3 text-[11.5px] leading-relaxed text-dove">
                      {buildingKeyword
                        ? "没找到该楼栋，可新建（需审核）"
                        : "暂无楼栋，可新建（需审核）"}
                    </p>
                  ) : null}
                  {loadingBuildings ? (
                    <div className="flex justify-center py-3">
                      <Loader2 className="size-4 animate-spin text-graphite" />
                    </div>
                  ) : null}
                  {!loadingBuildings &&
                    buildings.map((b) => {
                      // 本流程新建的待审楼栋可选（不阻塞录入，FR-10）；其他流程 pending 置灰（BR-23）
                      const flowCreated = b.pending && b.building_no === v.newBuilding?.name;
                      const selected = b.pending
                        ? v.buildingId == null && v.buildingNo === b.building_no
                        : v.buildingId === b.id;
                      return (
                        <button
                          key={b.pending ? `pending-${b.pending_id}` : `b-${b.id}`}
                          type="button"
                          disabled={b.pending && !flowCreated}
                          title={
                            b.pending
                              ? flowCreated
                                ? "审核中，通过后自动关联"
                                : "审核中，通过后可选"
                              : undefined
                          }
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12px] font-medium transition-colors",
                            selected ? "bg-ink text-white" : "text-ink hover:bg-white",
                            b.pending && !selected && "border-dashed text-dove opacity-70",
                          )}
                          onClick={() => {
                            setSelectedFloor(null);
                            if (b.pending) {
                              // 待审楼栋无实表 id：buildingId 置空，回填 newBuilding 载荷
                              emit({
                                buildingId: null,
                                buildingNo: b.building_no,
                                roomId: null,
                                roomNo: "",
                                address: buildPlate(v.communityName, b.building_no, ""),
                                dictStatus: "pending",
                                newBuilding: { name: b.building_no },
                                newRoom: null,
                              });
                              setRooms([]);
                              setFloors([]);
                              return;
                            }
                            emit({
                              buildingId: b.id,
                              buildingNo: b.building_no,
                              roomId: null,
                              roomNo: "",
                              address: buildPlate(v.communityName, b.building_no, ""),
                              dictStatus: "linked",
                              newBuilding: null,
                              newRoom: null,
                            });
                            void loadRooms(b.id);
                          }}
                        >
                          <span className="tabular-nums">{b.building_no}号</span>
                          {b.pending ? (
                            <Badge className="h-4 px-1 text-[9px]" variant="outline">
                              未审核
                            </Badge>
                          ) : null}
                        </button>
                      );
                    })}
                  {!loadingBuildings && buildings.length < buildingTotal ? (
                    <button
                      type="button"
                      className="mt-1 w-full rounded-lg border border-dashed border-dove py-1.5 text-[11px] text-graphite transition-colors hover:border-ash"
                      disabled={loadingMoreBuildings}
                      onClick={loadMoreBuildings}
                    >
                      {loadingMoreBuildings
                        ? "加载中…"
                        : `加载更多（${buildings.length}/${buildingTotal}）`}
                    </button>
                  ) : null}
                </div>
              </div>

              {/* 栏二：楼层（名义 ∪ 实际 ∪ pending，未分层置底） */}
              <div className="flex min-w-0 flex-col rounded-2xl border border-dove/40 bg-fog/60">
                <div className="flex items-center justify-between border-b border-dove/30 px-3 py-2">
                  <span className="text-[12px] font-medium text-ink">
                    楼层 <span className="ml-0.5 text-[10px] font-normal text-dove">选填</span>
                  </span>
                  {v.buildingId || selectedPendingBuilding ? (
                    <button
                      type="button"
                      className="flex items-center gap-0.5 text-[11px] text-rust hover:underline"
                      disabled={disabled}
                      onClick={() => void handleCreateRoom()}
                    >
                      <Plus className="size-3" />
                      新建
                    </button>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-1.5" style={{ maxHeight: 176 }}>
                  {!v.buildingId && !selectedPendingBuilding ? (
                    <p className="px-2 py-3 text-[11.5px] text-dove">← 选择楼栋</p>
                  ) : selectedPendingBuilding ? (
                    <p className="px-2 py-3 text-[11.5px] text-dove">楼栋审核中，通过后展示楼层</p>
                  ) : loadingRooms ? (
                    <div className="flex justify-center py-3">
                      <Loader2 className="size-4 animate-spin text-graphite" />
                    </div>
                  ) : floors.length === 0 ? (
                    <p className="px-2 py-3 text-[11.5px] text-dove">暂无楼层，可新建（需审核）</p>
                  ) : (
                    floors.map((f) => {
                      const selected = selectedFloor === f.floor;
                      return (
                        <button
                          key={f.floor ?? "none"}
                          type="button"
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12px] font-medium transition-colors",
                            selected ? "bg-ink text-white" : "text-ink hover:bg-white",
                          )}
                          onClick={() => setSelectedFloor(selected ? null : f.floor)}
                        >
                          <span className="tabular-nums">
                            {f.floor == null ? "楼层待定" : `${f.floor} 层`}
                          </span>
                          <span className="flex items-center gap-1">
                            <span
                              className={cn(
                                "text-[10px] font-normal",
                                selected ? "opacity-70" : "text-dove",
                              )}
                            >
                              {f.room_count}户
                            </span>
                            {f.has_pending ? (
                              <Badge className="h-4 px-1 text-[9px]" variant="outline">
                                未审核
                              </Badge>
                            ) : null}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 栏三：户室网格（含新建入口） */}
              <div className="flex min-w-0 flex-col rounded-2xl border border-dove/40 bg-fog/60">
                <div className="flex items-center justify-between border-b border-dove/30 px-3 py-2">
                  <span className="text-[12px] font-medium text-ink">
                    户室 <span className="ml-0.5 text-[10px] font-normal text-dove">选填</span>
                    {v.buildingNo ? (
                      <span className="ml-1 text-[10px] font-normal text-dove tabular-nums">
                        {v.buildingNo}号
                        {selectedFloor != null && selectedFloor !== "all"
                          ? ` · ${selectedFloor}层`
                          : ""}
                      </span>
                    ) : null}
                  </span>
                  {(v.buildingId ? floors.length === 0 : !!selectedPendingBuilding) ? (
                    <button
                      type="button"
                      className="flex items-center gap-0.5 text-[11px] text-rust hover:underline"
                      disabled={disabled}
                      onClick={() => void handleCreateRoom()}
                    >
                      <Plus className="size-3" />
                      新建
                    </button>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-1.5" style={{ maxHeight: 176 }}>
                  {!v.buildingId && !selectedPendingBuilding ? (
                    <p className="px-2 py-3 text-[11.5px] text-dove">← 选择楼栋</p>
                  ) : selectedPendingBuilding ? (
                    v.roomNo ? (
                      <div className="grid grid-cols-4 gap-1">
                        <span className="flex items-center justify-center rounded-lg border border-dashed border-ink bg-ink px-1 py-1 text-[11px] font-medium tabular-nums text-white">
                          {plateOfRoom(v.roomNo)}
                          <Badge
                            className="ml-0.5 h-3 border-white/50 px-0.5 text-[8px]"
                            variant="outline"
                          >
                            审
                          </Badge>
                        </span>
                      </div>
                    ) : (
                      <p className="px-2 py-3 text-[11.5px] text-dove">
                        楼栋审核中 · 可新建户室（需审核）
                      </p>
                    )
                  ) : loadingRooms ? (
                    <div className="flex justify-center py-3">
                      <Loader2 className="size-4 animate-spin text-graphite" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-1">
                      {visibleRooms.map((r) => {
                        // 本流程新建的待审户室可选（不阻塞录入，FR-10）；其他流程 pending 置灰（BR-23）
                        const flowCreated = r.pending && r.room_no === v.newRoom?.name;
                        const selected = r.pending
                          ? v.roomId == null && v.roomNo === r.room_no
                          : v.roomId === r.id && v.roomNo === r.room_no;
                        const lockable = r.pending && !flowCreated;
                        return (
                          <button
                            key={r.pending ? `pr-${r.pending_id}` : `r-${r.id}`}
                            type="button"
                            disabled={lockable}
                            title={
                              r.pending
                                ? flowCreated
                                  ? "审核中，通过后自动关联"
                                  : "审核中，通过后可选"
                                : undefined
                            }
                            className={cn(
                              "rounded-lg border px-1 py-1.5 text-[11px] font-medium tabular-nums transition-colors",
                              selected
                                ? "border-ink bg-ink text-white"
                                : "border-dove/50 bg-white text-ink hover:border-ash",
                              r.pending && !selected && "border-dashed text-dove opacity-60",
                            )}
                            onClick={() => {
                              if (r.plate_no === r.room_no && !/^\d{4}$/.test(r.room_no)) {
                                toast.info("非标户室号，门牌需手动填写");
                              }
                              emit(
                                r.pending
                                  ? {
                                      // 待审户室无实表 id：roomId 置空，回填 newRoom 载荷
                                      roomId: null,
                                      roomNo: r.room_no,
                                      address: buildPlate(
                                        v.communityName,
                                        v.buildingNo,
                                        r.plate_no,
                                      ),
                                      dictStatus: "linked",
                                      newRoom: { name: r.room_no },
                                    }
                                  : {
                                      roomId: r.id || null,
                                      roomNo: r.room_no,
                                      address: buildPlate(
                                        v.communityName,
                                        v.buildingNo,
                                        r.plate_no,
                                      ),
                                      dictStatus: "linked",
                                      newRoom: null,
                                    },
                              );
                            }}
                          >
                            {r.plate_no}
                            {r.pending ? (
                              <Badge className="ml-0.5 h-3 px-0.5 text-[8px]" variant="outline">
                                审
                              </Badge>
                            ) : null}
                          </button>
                        );
                      })}
                      {visibleRooms.length === 0 && !loadingRooms ? (
                        <button
                          type="button"
                          className="col-span-4 rounded-lg border border-dashed border-dove bg-white py-1.5 text-[11px] font-medium text-rust transition-colors hover:border-ash"
                          onClick={() => void handleCreateRoom()}
                        >
                          <Plus className="mr-0.5 inline size-3" />
                          本层暂无户室 · 新建（需审核）
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {/* 门牌预览可手改（FR-09） */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium uppercase tracking-wider text-graphite">
              <span className="rounded-md bg-apricot-wash px-1.5 py-0.5 text-[10px] normal-case text-rust">
                自动门牌
              </span>
              <span className="ml-1 text-[10px] font-normal normal-case tracking-normal text-dove">
                系统自动拼好，可手改
              </span>
            </Label>
            <Input
              value={v.address}
              onChange={(e) => emit({ address: e.target.value })}
              placeholder="选楼栋/户室后自动拼装"
              disabled={disabled}
              className="h-10 rounded-inputs border-dove/50 bg-white text-sm font-medium text-ink focus-visible:ring-ink/10"
            />
          </div>
        </div>
      )}
    </div>
  );
}
