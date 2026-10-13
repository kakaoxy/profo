"use client";

/**
 * 四级地址选择器（共享组件 dict-address-picker，FR-09 / R6，设计稿 ARTBOARD 04）.
 *
 * 级联：小区联想（复用 GET /admin/communities 含别名）→ 楼栋 → 楼层 → 户室；
 * - 楼层列 = 名义 ∪ 实际 ∪ pending（未分层置底，FR-04）；
 * - 门牌自动拼装可手改（0401 → 401；非标户室回退手填提示 BR-12）；
 * - 「＋新建楼栋 / 新建楼层 / 新建户室」入口：提交进审核池（不阻塞表单，FR-10）；
 * - 兼容模式开关：跳过字典手填地址（dict_status=manual）；
 * - pending 条目全系统可见带「未审核」标签（虚线/置灰），仅来源单据回显可选，
 *   其他表单置灰（hover「审核中，通过后可选」，BR-23）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Building2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { client } from "@/lib/api-client";

export interface DictAddressValue {
  /** 字典小区ID（兼容模式下可空） */
  communityId: string | null;
  communityName: string;
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

/** 户室号前两位解析楼层（0401→4；非两位数字开头为 null） */
function floorOfRoom(roomNo: string): number | null {
  const m = roomNo.match(/^(\d{2})/);
  return m ? parseInt(m[1], 10) : null;
}

export function DictAddressPicker({
  value,
  onChange,
  sourceBizType,
  sourceBizId,
  allowCreate = true,
  disabled = false,
  className,
}: DictAddressPickerProps) {
  const [manualMode, setManualMode] = useState(value?.dictStatus === "manual");
  const [communityOpen, setCommunityOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [communityOptions, setCommunityOptions] = useState<CommunityOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [buildings, setBuildings] = useState<BuildingOption[]>([]);
  const [floors, setFloors] = useState<FloorGroup[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [selectedFloor, setSelectedFloor] = useState<number | null | "all">(null);
  const [loadingBuildings, setLoadingBuildings] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [manualAddress, setManualAddress] = useState(value?.address ?? "");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

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

  /** 选中小区后加载楼栋 */
  const loadBuildings = useCallback(
    async (communityId: string) => {
      setLoadingBuildings(true);
      setBuildings([]);
      setRooms([]);
      setFloors([]);
      try {
        const { data, error } = await client.GET(
          "/api/v1/admin/building-dictionary/communities/{community_id}/buildings",
          {
            params: {
              path: { community_id: communityId },
              query: {
                page: 1,
                page_size: 100,
                ...(sourceBizType && sourceBizId ? { source_biz_type: sourceBizType, source_biz_id: sourceBizId } : {}),
              },
            },
          },
        );
        if (!error && data) {
          setBuildings(
            data.items.map((b) => ({
              id: b.id,
              building_no: b.building_no,
              pending: b.pending,
              pending_id: b.pending_id ?? null,
            })),
          );
        }
      } finally {
        setLoadingBuildings(false);
      }
    },
    [sourceBizType, sourceBizId],
  );

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
              query: sourceBizType && sourceBizId ? { source_biz_type: sourceBizType, source_biz_id: sourceBizId } : {},
            },
          }),
        ]);
        if (!floorRes.error && floorRes.data) {
          setFloors(floorRes.data as unknown as FloorGroup[]);
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
    emit({ newBuilding: { name: buildingNo }, buildingId: null, buildingNo: "", roomId: null, roomNo: "" });
    void loadBuildings(v.communityId);
  }, [v.communityId, buildings, sourceBizType, sourceBizId, emit, loadBuildings]);

  /** 提交新增户室进审核池（新楼层 = 提交该层首个户室，隐式建层） */
  const handleCreateRoom = useCallback(async () => {
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
      toast.error("户室号需以两位楼层号开头（如 0403 = 4 层 03 户）");
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
    toast.success(`已提交「新户室 ${v.buildingNo} 栋 ${roomNo}」→ 审核池；通过后该层自动出现`);
    emit({ newRoom: { name: roomNo }, roomId: null, roomNo: "" });
    void loadRooms(v.buildingId);
  }, [v.communityId, v.buildingId, v.buildingNo, selectedFloor, rooms, sourceBizType, sourceBizId, emit, loadRooms]);

  const selectedBuilding = useMemo(
    () => buildings.find((b) => b.id === v.buildingId),
    [buildings, v.buildingId],
  );

  /** 楼层过滤后的户室（选中楼层展示该层；否则全部） */
  const visibleRooms = useMemo(() => {
    if (selectedFloor == null || selectedFloor === "all") return rooms;
    return rooms.filter((r) => r.floor === selectedFloor);
  }, [rooms, selectedFloor]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* 兼容模式开关 */}
      <div className="flex items-center justify-between rounded-lg border border-dove/40 bg-fog px-3 py-2">
        <div>
          <p className="text-[14px] font-medium text-ink">字典选择</p>
          <p className="text-[13px] text-graphite">关闭后可手动填写地址（小区可不选）</p>
        </div>
        <Switch
          checked={!manualMode}
          onCheckedChange={(checked) => {
            setManualMode(!checked);
            if (checked) {
              emit({ dictStatus: null });
            } else {
              emit({
                dictStatus: "manual",
                communityId: null,
                buildingId: null,
                roomId: null,
                newCommunity: null,
                newBuilding: null,
                newRoom: null,
              });
            }
          }}
          disabled={disabled}
          aria-label="字典选择模式"
        />
      </div>

      {manualMode ? (
        <div className="flex flex-col gap-1.5">
          <Label>手填地址</Label>
          <Input
            value={manualAddress}
            onChange={(e) => {
              setManualAddress(e.target.value);
              emit({ address: e.target.value, dictStatus: "manual" });
            }}
            placeholder="如：泗塘三村61号401"
            disabled={disabled}
          />
        </div>
      ) : (
        <>
          {/* 一级：小区联想 */}
          <div className="flex flex-col gap-1.5">
            <Label>
              小区 <span className="text-rust">*</span>
              <span className="ml-1 text-[10px] font-normal text-dove">搜小区名或地址；没有可新建（需审核）</span>
            </Label>
            <Popover open={communityOpen} onOpenChange={setCommunityOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  disabled={disabled}
                  className={cn("justify-between", !v.communityName && "text-dove")}
                >
                  <span className="truncate">
                    {v.communityName || (v.dictStatus === "pending" ? `${v.communityName}（未审核）` : "搜索小区…")}
                  </span>
                  {searching ? <Loader2 className="size-4 animate-spin" /> : <Building2 className="size-4 opacity-50" />}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="start">
                <div className="border-b border-dove/30 p-2">
                  <Input
                    autoFocus
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="输入小区名/地址/别名搜索"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto p-1">
                  {communityOptions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-[14px] hover:bg-fog",
                        v.communityId === c.id && "bg-fog",
                      )}
                      onClick={() => {
                        emit({
                          communityId: c.id,
                          communityName: c.name,
                          buildingId: null,
                          buildingNo: "",
                          roomId: null,
                          roomNo: "",
                          address: c.name,
                          dictStatus: "linked",
                          newCommunity: null,
                        });
                        setSelectedFloor(null);
                        setCommunityOpen(false);
                        void loadBuildings(c.id);
                      }}
                    >
                      <span>{c.name}</span>
                      {c.district ? <span className="text-[12px] text-graphite">{c.district}</span> : null}
                    </button>
                  ))}
                  {keyword.trim() && !searching && communityOptions.length === 0 ? (
                    allowCreate ? (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[14px] text-rust hover:bg-fog"
                        onClick={handleCreateCommunity}
                      >
                        <Plus className="size-4" />
                        新增小区「{keyword.trim()}」（需审核，项目照常建）
                      </button>
                    ) : (
                      <p className="px-2 py-3 text-center text-[13px] text-graphite">无匹配小区</p>
                    )
                  ) : null}
                </div>
              </PopoverContent>
            </Popover>
            {v.dictStatus === "pending" ? (
              <p className="flex items-center gap-1 text-[13px] text-amber-700">
                <AlertTriangle className="size-3.5" />
                小区审核中，通过后开放楼栋/户室选择
              </p>
            ) : null}
          </div>

          {/* 二级：楼栋（含新建入口） */}
          {v.communityId ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label>楼栋 {selectedBuilding ? <span className="text-[10px] font-normal text-dove">{buildings.length} 栋</span> : null}</Label>
                <button
                  type="button"
                  className="flex items-center gap-0.5 text-[11px] text-rust hover:underline"
                  disabled={disabled}
                  onClick={() => void handleCreateBuilding()}
                >
                  <Plus className="size-3" />
                  新建楼栋（需审核）
                </button>
              </div>
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                {loadingBuildings ? (
                  <Loader2 className="size-4 animate-spin text-graphite" />
                ) : (
                  buildings.map((b) => {
                    const selected = v.buildingId === b.id;
                    return (
                      <button
                        key={b.pending ? `pending-${b.pending_id}` : `b-${b.id}`}
                        type="button"
                        disabled={b.pending && v.dictStatus !== "pending"}
                        title={b.pending ? "审核中，通过后可选" : undefined}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-[13px] transition-colors",
                          selected
                            ? "border-ink bg-ink text-white"
                            : "border-dove/50 text-ink hover:border-ash",
                          b.pending && !selected && "border-dashed text-dove opacity-70",
                        )}
                        onClick={() => {
                          emit({
                            buildingId: b.id,
                            buildingNo: b.building_no,
                            roomId: null,
                            roomNo: "",
                            address: buildPlate(v.communityName, b.building_no, ""),
                            dictStatus: "linked",
                          });
                          setSelectedFloor(null);
                          void loadRooms(b.id);
                        }}
                      >
                        {b.building_no}栋
                        {b.pending ? <Badge className="ml-1 h-4 px-1 text-[10px]" variant="outline">未审核</Badge> : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}

          {/* 三级：楼层（名义 ∪ 实际 ∪ pending，未分层置底） */}
          {v.buildingId && floors.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label>楼层</Label>
                <button
                  type="button"
                  className="flex items-center gap-0.5 text-[11px] text-rust hover:underline"
                  disabled={disabled}
                  onClick={() => void handleCreateRoom()}
                >
                  <Plus className="size-3" />
                  新建楼层（填这层第一户，需审核）
                </button>
              </div>
              <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                {floors.map((f) => {
                  const selected = selectedFloor === f.floor;
                  return (
                    <button
                      key={f.floor ?? "none"}
                      type="button"
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-[12px] tabular-nums transition-colors",
                        selected ? "border-ink bg-ink text-white" : "border-dove/50 text-ink hover:border-ash",
                      )}
                      onClick={() => setSelectedFloor(selected ? null : f.floor)}
                    >
                      {f.floor == null ? "楼层待定" : `${f.floor} 层`}
                      <span className="ml-1 text-[10px] opacity-60">{f.room_count}户</span>
                      {f.has_pending ? <Badge className="ml-1 h-4 px-1 text-[9px]" variant="outline">未审核</Badge> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* 四级：户室网格（含新建入口） */}
          {v.buildingId && selectedBuilding ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label>
                  户室
                  {v.buildingNo ? (
                    <span className="ml-1 text-[10px] font-normal text-dove">
                      {v.buildingNo} 栋{selectedFloor != null && selectedFloor !== "all" ? ` · ${selectedFloor} 层` : ""}
                    </span>
                  ) : null}
                </Label>
                {floors.length === 0 ? (
                  <button
                    type="button"
                    className="flex items-center gap-0.5 text-[11px] text-rust hover:underline"
                    disabled={disabled}
                    onClick={() => void handleCreateRoom()}
                  >
                    <Plus className="size-3" />
                    新建户室（需审核）
                  </button>
                ) : null}
              </div>
              <div className="grid max-h-40 grid-cols-6 gap-1.5 overflow-y-auto">
                {loadingRooms ? (
                  <Loader2 className="size-4 animate-spin text-graphite" />
                ) : (
                  visibleRooms.map((r) => {
                    const selected = v.roomId === r.id && v.roomNo === r.room_no;
                    const lockable = r.pending && !selected;
                    return (
                      <button
                        key={r.pending ? `pr-${r.pending_id}` : `r-${r.id}`}
                        type="button"
                        disabled={lockable}
                        title={r.pending ? "审核中，通过后可选" : undefined}
                        className={cn(
                          "rounded-md border px-1 py-1 text-[12px] tabular-nums transition-colors",
                          selected ? "border-ink bg-ink text-white" : "border-dove/50 text-ink hover:border-ash",
                          lockable && "border-dashed text-dove opacity-60",
                        )}
                        onClick={() => {
                          if (r.plate_no === r.room_no && !/^\d{4}$/.test(r.room_no)) {
                            toast.info("非标户室号，门牌需手动填写");
                          }
                          emit({
                            roomId: r.id || null,
                            roomNo: r.room_no,
                            address: buildPlate(v.communityName, v.buildingNo, r.plate_no),
                            dictStatus: "linked",
                          });
                        }}
                      >
                        {r.plate_no}
                        {r.pending ? <Badge className="ml-0.5 h-3 px-0.5 text-[8px]" variant="outline">审</Badge> : null}
                      </button>
                    );
                  })
                )}
                {visibleRooms.length === 0 && !loadingRooms ? (
                  <button
                    type="button"
                    className="col-span-6 rounded-md border border-dashed border-dove py-1.5 text-[11.5px] text-rust hover:border-ash"
                    onClick={() => void handleCreateRoom()}
                  >
                    <Plus className="mr-0.5 inline size-3" />
                    本层暂无户室 · 新建户室（需审核）
                  </button>
                ) : null}
              </div>
              {/* 门牌预览可手改（FR-09） */}
              <div className="mt-1 flex flex-col gap-1.5">
                <Label>
                  <span className="rounded-md bg-apricot-wash px-1.5 py-0.5 text-[10px] text-rust">自动门牌</span>
                  <span className="ml-1 text-[10px] font-normal text-dove">系统自动拼好，可手改</span>
                </Label>
                <Input
                  value={v.address}
                  onChange={(e) => emit({ address: e.target.value })}
                  placeholder="选楼栋/户室后自动拼装"
                  disabled={disabled}
                />
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
