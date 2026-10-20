"use client";

/**
 * 小区详情抽屉（FR-02~07/14/20，对齐设计稿 v2.0 ARTBOARD 02，560px）.
 * [不拆分理由] 抽屉内画像是「小区→楼栋→户室」同一钻取动线的连续上下文，
 * 区块间共享 detail/buildings/expandedBuilding 等十余项状态；强行拆分会把
 * 状态提升到宿主形成 prop drilling，反而增加维护成本。
 *
 * 画像区（地址/锚点 BD-09/物业/开发商/计数 + 修正画像编辑态 PATCH）；
 * 户型图库区块（FR-20，复用现有 images 端点，上传/改描述/调排序/软删）；
 * 合并信息区块（v2.0 修订二）：
 *   - 被并视角：merged_into_id → 主档信息 + 解除合并；
 *   - 主档视角：merged_children 逐条呈现（地址/楼栋/户室/已绑）+ 单条解除合并；
 * 楼栋列表（搜索/20 分页/pending 虚线叠加/已绑项目徽标）→ 展开楼层分组 → 户室网格
 * （单选 + BD-09 坐标回显 + 门牌映射）+ admin 区间补录楼栋/户室（FR-06）；
 * 任一写操作成功后回调 onUpdated（父级 router.refresh 同步列表页），户室补录
 * 另触发 FloorRoomPanel refreshSignal 重载网格；
 * 底部操作条：编辑资料（画像编辑态）+ 绑定项目（选中户室后可点）。
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { client } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatBuildingLabel } from "@/lib/dict-display";

import { BuildingAddForm, RoomAddForm } from "./admin-add-forms";
import { CommunityImagesSection } from "./community-images-section";
import { FloorRoomPanel } from "./floor-room-panel";
import { MergeDialog } from "./merge-dialog";
import type { BdBuildingListItem, BdCommunityDetail } from "./types";

interface CommunityDrawerProps {
  communityId: string | null;
  communityName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 任一写操作（画像修正/合并/解除合并/补录楼栋户室）成功后回调，父级触发 router.refresh() */
  onUpdated?: () => void;
}

export function CommunityDrawer({
  communityId,
  communityName,
  open,
  onOpenChange,
  onUpdated,
}: CommunityDrawerProps) {
  const { hasPermission } = usePermission();
  const canGovern = hasPermission(PERMISSION_CODES.PROPERTY_GOVERNANCE);

  const [detail, setDetail] = useState<BdCommunityDetail | null>(null);
  const [buildings, setBuildings] = useState<BdBuildingListItem[]>([]);
  const [buildingTotal, setBuildingTotal] = useState(0);
  const [buildingPage, setBuildingPage] = useState(1);
  const [buildingKeyword, setBuildingKeyword] = useState("");
  const [buildingSearch, setBuildingSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [patchForm, setPatchForm] = useState({
    ring: "",
    eraFrom: "",
    eraTo: "",
    address: "",
    lng: "",
    lat: "",
    propertyMgmt: "",
    developer: "",
  });
  const [mergeOpen, setMergeOpen] = useState(false);
  const [expandedBuilding, setExpandedBuilding] = useState<number | null>(null);
  const [addingBld, setAddingBld] = useState(false);
  const [addingRoomFor, setAddingRoomFor] = useState<number | null>(null);
  const [picked, setPicked] = useState<{ buildingNo: string; roomNo: string; plate: string; lng: number | null; lat: number | null } | null>(null);
  /** 户室补录成功后 +1，触发展开的 FloorRoomPanel 重载楼层/户室网格 */
  const [roomRefreshTick, setRoomRefreshTick] = useState(0);
  /** BR-29 楼栋内联改名（id + 正在编辑的值） */
  const [renamingBuilding, setRenamingBuilding] = useState<{ id: number; value: string } | null>(null);
  const [renamingBuildingBusy, setRenamingBuildingBusy] = useState(false);
  /** BR-29 小区名内联改名 */
  const [renamingCommunity, setRenamingCommunity] = useState(false);
  const [communityNameDraft, setCommunityNameDraft] = useState("");
  const [renamingCommunityBusy, setRenamingCommunityBusy] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!communityId) return;
    setLoading(true);
    try {
      const { data, error } = await client.GET("/api/v1/admin/building-dictionary/communities/{community_id}", {
        params: { path: { community_id: communityId } },
      });
      if (!error && data) {
        // 生成类型收敛：schema 层 property_types 可选（PG text[] 历史数据可能为 null）
        const d: BdCommunityDetail = { ...data, property_types: data.property_types ?? [] };
        setDetail(d);
        setPatchForm({
          ring: d.ring ?? "",
          eraFrom: String(d.era_from ?? ""),
          eraTo: String(d.era_to ?? ""),
          address: d.address ?? "",
          lng: d.lng != null ? String(d.lng) : "",
          lat: d.lat != null ? String(d.lat) : "",
          propertyMgmt: d.property_mgmt ?? "",
          developer: d.developer ?? "",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  const loadBuildings = useCallback(async () => {
    if (!communityId) return;
    setLoading(true);
    try {
      const { data, error } = await client.GET(
        "/api/v1/admin/building-dictionary/communities/{community_id}/buildings",
        {
          params: {
            path: { community_id: communityId },
            query: { page: buildingPage, page_size: 20, keyword: buildingSearch || undefined },
          },
        },
      );
      if (!error && data) {
        setBuildings(data.items);
        setBuildingTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [communityId, buildingPage, buildingSearch]);

  useEffect(() => {
    if (open && communityId) {
      void loadDetail();
      void loadBuildings();
    }
  }, [open, communityId, loadDetail, loadBuildings]);

  // 楼栋搜索防抖（400ms）
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setBuildingSearch(buildingKeyword);
      setBuildingPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [buildingKeyword, open]);

  /** 修正画像（PATCH，admin + 审计）——对应设计稿「编辑资料」 */
  const handlePatch = useCallback(async () => {
    if (!communityId) return;
    const body: Record<string, unknown> = {};
    if (patchForm.ring !== (detail?.ring ?? "")) body.ring = patchForm.ring || null;
    if (patchForm.eraFrom !== String(detail?.era_from ?? "")) body.era_from = patchForm.eraFrom ? Number(patchForm.eraFrom) : null;
    if (patchForm.eraTo !== String(detail?.era_to ?? "")) body.era_to = patchForm.eraTo ? Number(patchForm.eraTo) : null;
    if (patchForm.address !== (detail?.address ?? "")) body.address = patchForm.address || null;
    const lngTrim = patchForm.lng.trim();
    if (lngTrim !== (detail?.lng != null ? String(detail.lng) : "")) {
      if (lngTrim && Number.isNaN(Number(lngTrim))) {
        toast.error("经度格式不正确");
        return;
      }
      body.lng = lngTrim ? Number(lngTrim) : null;
    }
    const latTrim = patchForm.lat.trim();
    if (latTrim !== (detail?.lat != null ? String(detail.lat) : "")) {
      if (latTrim && Number.isNaN(Number(latTrim))) {
        toast.error("纬度格式不正确");
        return;
      }
      body.lat = latTrim ? Number(latTrim) : null;
    }
    if (patchForm.propertyMgmt !== (detail?.property_mgmt ?? "")) body.property_mgmt = patchForm.propertyMgmt || null;
    if (patchForm.developer !== (detail?.developer ?? "")) body.developer = patchForm.developer || null;
    if (Object.keys(body).length === 0) {
      setEditing(false);
      return;
    }
    const { error } = await client.PATCH("/api/v1/admin/building-dictionary/communities/{community_id}", {
      params: { path: { community_id: communityId } },
      body,
    });
    if (error) {
      toast.error("画像修正失败");
      return;
    }
    toast.success("画像已更新（admin + 审计）");
    setEditing(false);
    void loadDetail();
    onUpdated?.();
  }, [communityId, detail, patchForm, loadDetail, onUpdated]);

  /** 主档视角解除合并：恢复被并小区为独立（POST /admin/communities/unmerge） */
  const handleUnmergeChild = useCallback(
    async (childId: string, childName: string) => {
      const { error } = await client.POST("/api/v1/admin/communities/unmerge", {
        body: { merged_id: childId, primary_id: communityId as string },
      });
      if (error) {
        toast.error("解除合并失败");
        return;
      }
      toast.success(`已解除合并：「${childName}」拆回独立小区 · 数据无损`);
      void loadDetail();
      onUpdated?.();
    },
    [communityId, loadDetail, onUpdated],
  );

  const mergedChildren = detail?.merged_children ?? [];

  /** 删除小区（未使用直接删；被业务单据引用/存在待审楼栋/被并入时由后端 409 拦截） */
  const handleDeleteCommunity = useCallback(async () => {
    if (!communityId || !detail) return;
    if (
      !window.confirm(
        `确认删除小区「${detail.name}」？其下 ${detail.building_count} 栋楼栋及全部户室/别名/图片将一并删除，删除后不可恢复。`,
      )
    ) {
      return;
    }
    const { error } = await client.DELETE("/api/v1/admin/building-dictionary/communities/{community_id}", {
      params: { path: { community_id: communityId } },
    });
    if (error) {
      const msg = (error as { message?: string }).message ?? "小区被业务单据引用或存在待审条目时会拦截";
      toast.error(`删除失败：${msg}`);
      return;
    }
    toast.success(`已删除小区「${detail.name}」（留审计）`);
    onOpenChange(false);
    onUpdated?.();
  }, [communityId, detail, onOpenChange, onUpdated]);

  /** BR-29：楼栋号修正（uq 冲突由后端 409 拦截，前端透出原文） */
  const handleRenameBuilding = useCallback(
    async (b: BdBuildingListItem) => {
      const next = renamingBuilding?.value.trim() ?? "";
      if (!next) {
        toast.error("楼栋号不能为空");
        return;
      }
      setRenamingBuildingBusy(true);
      try {
        const { data, error } = await client.PATCH(
          "/api/v1/admin/building-dictionary/buildings/{building_id}",
          {
            params: { path: { building_id: b.id } },
            body: { building_no: next },
          },
        );
        if (error || !data) {
          toast.error((error as { message?: string }).message ?? "改名失败");
          return;
        }
        toast.success(data.message);
        setRenamingBuilding(null);
        // 楼层/户室面板按楼栋 id 挂载，改名不影响；列表与画像计数需重载
        await Promise.all([loadBuildings(), loadDetail()]);
        onUpdated?.();
      } finally {
        setRenamingBuildingBusy(false);
      }
    },
    [renamingBuilding, loadBuildings, loadDetail, onUpdated],
  );

  /** BR-29：小区名修正（旧名自动沉淀为别名，仍可搜索） */
  const handleRenameCommunity = useCallback(async () => {
    if (!communityId) return;
    const next = communityNameDraft.trim();
    if (!next) {
      toast.error("小区名不能为空");
      return;
    }
    setRenamingCommunityBusy(true);
    try {
      const { data, error } = await client.PATCH(
        "/api/v1/admin/building-dictionary/communities/{community_id}/rename",
        {
          params: { path: { community_id: communityId } },
          body: { name: next },
        },
      );
      if (error || !data) {
        toast.error((error as { message?: string }).message ?? "小区改名失败");
        return;
      }
      toast.success(data.message);
      setRenamingCommunity(false);
      await loadDetail();
      onUpdated?.();
    } finally {
      setRenamingCommunityBusy(false);
    }
  }, [communityId, communityNameDraft, loadDetail, onUpdated]);

  /** 删除楼栋（含其下全部户室；业务引用/待审子级由后端拦截） */
  const handleDeleteBuilding = useCallback(
    async (b: BdBuildingListItem) => {
      if (!window.confirm(`确认删除楼栋「${b.building_no}」及其下 ${b.room_count} 户？删除后不可恢复。`)) return;
      const { error } = await client.DELETE("/api/v1/admin/building-dictionary/buildings/{building_id}", {
        params: { path: { building_id: b.id } },
      });
      if (error) {
        toast.error("删除失败：楼栋被业务单据引用或存在待审户室时会拦截");
        return;
      }
      toast.success(`已删除楼栋「${b.building_no}」及其下户室（留审计）`);
      setExpandedBuilding(null);
      void loadDetail();
      void loadBuildings();
      onUpdated?.();
    },
    [loadDetail, loadBuildings, onUpdated],
  );

  /** 删除楼层 = 批量删除该层全部户室（楼层随户室派生，删空即消失） */
  const handleDeleteFloor = useCallback(
    async (buildingId: number, floor: number | null, floorLabel: string) => {
      if (floor == null) {
        toast.error("「楼层待定」分组请逐户删除");
        return;
      }
      if (!window.confirm(`确认删除${floorLabel}的全部户室？删除后不可恢复。`)) return;
      const { error } = await client.DELETE("/api/v1/admin/building-dictionary/buildings/{building_id}/floors/{floor}", {
        params: { path: { building_id: buildingId, floor } },
      });
      if (error) {
        toast.error("删除失败：该层户室被业务单据引用时会拦截");
        return;
      }
      toast.success(`已删除${floorLabel}全部户室（留审计）`);
      setRoomRefreshTick((t) => t + 1);
      void loadDetail();
      void loadBuildings();
      onUpdated?.();
    },
    [loadDetail, loadBuildings, onUpdated],
  );

  /** BR-29：户室号修正（楼层由后端重算；成功后必须重载网格，楼层分组可能变化） */
  const handleRenameRoom = useCallback(
    async (buildingId: number, roomId: number, roomNo: string) => {
      const next = window.prompt(`修正户室号（当前 ${roomNo}）：`, roomNo);
      if (next === null) return;
      const trimmed = next.trim();
      if (!trimmed) {
        toast.error("户室号不能为空");
        return;
      }
      const { data, error } = await client.PATCH(
        "/api/v1/admin/building-dictionary/buildings/{building_id}/rooms/{room_id}",
        {
          params: { path: { building_id: buildingId, room_id: roomId } },
          body: { room_no: trimmed },
        },
      );
      if (error || !data) {
        toast.error((error as { message?: string }).message ?? "户室改名失败");
        return;
      }
      toast.success(data.message);
      setPicked(null);
      // 楼层号由后端从户室号重算，可能换层 → 必须重载网格而不是本地替换
      setRoomRefreshTick((t) => t + 1);
      void loadDetail();
      void loadBuildings();
      onUpdated?.();
    },
    [loadDetail, loadBuildings, onUpdated],
  );

  /** 删除单个户室（业务引用由后端拦截） */
  const handleDeleteRoom = useCallback(
    async (buildingId: number, roomId: number, roomNo: string) => {
      if (!window.confirm(`确认删除户室「${roomNo}」？删除后不可恢复。`)) return;
      const { error } = await client.DELETE("/api/v1/admin/building-dictionary/buildings/{building_id}/rooms/{room_id}", {
        params: { path: { building_id: buildingId, room_id: roomId } },
      });
      if (error) {
        toast.error("删除失败：户室被业务单据引用时会拦截");
        return;
      }
      toast.success(`已删除户室「${roomNo}」（留审计）`);
      setPicked(null);
      setRoomRefreshTick((t) => t + 1);
      void loadDetail();
      void loadBuildings();
      onUpdated?.();
    },
    [loadDetail, loadBuildings, onUpdated],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[560px] flex-col gap-0 overflow-hidden sm:w-[560px] sm:max-w-[560px] [&>[data-slot=sheet-close]]:top-5 [&>[data-slot=sheet-close]]:right-5 [&>[data-slot=sheet-close]]:flex [&>[data-slot=sheet-close]]:size-[30px] [&>[data-slot=sheet-close]]:items-center [&>[data-slot=sheet-close]]:justify-center [&>[data-slot=sheet-close]]:rounded-full [&>[data-slot=sheet-close]]:bg-fog [&>[data-slot=sheet-close]]:text-graphite [&>[data-slot=sheet-close]]:opacity-100"
      >
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center justify-between pr-8">
            {renamingCommunity ? (
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <Input
                  autoFocus
                  value={communityNameDraft}
                  onChange={(e) => setCommunityNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleRenameCommunity();
                    if (e.key === "Escape") setRenamingCommunity(false);
                  }}
                  className="h-9 min-w-0 flex-1 rounded-[10px] text-[18px] font-semibold"
                  placeholder="小区名"
                />
                <button
                  type="button"
                  className="shrink-0 rounded-full bg-ink px-3 py-1 text-[11px] text-white disabled:opacity-50"
                  disabled={renamingCommunityBusy}
                  onClick={() => void handleRenameCommunity()}
                >
                  {renamingCommunityBusy ? <Loader2 className="inline size-3 animate-spin" /> : null} 保存
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded-full border border-dove/60 px-3 py-1 text-[11px] text-graphite"
                  onClick={() => setRenamingCommunity(false)}
                >
                  取消
                </button>
              </span>
            ) : (
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-display text-[26px] leading-tight tracking-[-0.01em]">
                  {detail?.name ?? communityName}
                </span>
                {detail && canGovern ? (
                  /* BR-29：审核通过后纠错 —— 小区名可改（旧名自动沉淀为别名，仍可搜索） */
                  <button
                    type="button"
                    title="修正小区名（旧名自动存为别名，仍可搜索）"
                    className="shrink-0 rounded-full border border-dove/50 px-2 py-0.5 text-[10px] text-graphite hover:border-rust hover:text-rust"
                    onClick={() => {
                      setCommunityNameDraft(detail.name);
                      setRenamingCommunity(true);
                    }}
                  >
                    改名
                  </button>
                ) : null}
              </span>
            )}
            <span className="flex shrink-0 items-center gap-2">
              {canGovern ? (
                <Button
                  size="sm"
                  className="h-7 rounded-full bg-ink px-3 text-[11px] text-white hover:bg-ink/90"
                  onClick={() => setMergeOpen(true)}
                >
                  合并
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className="h-7 rounded-full border-error/40 px-3 text-[11px] text-error hover:bg-error/5"
                onClick={() => void handleDeleteCommunity()}
              >
                删除
              </Button>
            </span>
          </SheetTitle>
          {detail ? (
            <div className="mt-1 flex flex-wrap gap-1.5 pr-8">
              {detail.ring ? (
                <span className="rounded-full bg-apricot-wash px-2.5 py-0.5 text-[10.5px] text-rust">{detail.ring}</span>
              ) : null}
              {/* 设计稿：无值不占位（不渲染「—」空 chip） */}
              {detail.district || detail.business_circle ? (
                <span className="rounded-full bg-fog px-2.5 py-0.5 text-[10.5px] text-graphite">
                  {[detail.district, detail.business_circle].filter(Boolean).join(" · ")}
                </span>
              ) : null}
              {detail.property_types.length ? (
                <span className="rounded-full bg-fog px-2.5 py-0.5 text-[10.5px] text-graphite">
                  {detail.property_types.join(" · ")}
                </span>
              ) : null}
              {detail.era_from ? (
                <span className="rounded-full bg-fog px-2.5 py-0.5 text-[10.5px] text-graphite tabular-nums">
                  {detail.era_from}{detail.era_to ? `~${detail.era_to}` : ""}
                </span>
              ) : null}
            </div>
          ) : null}
        </SheetHeader>

        {loading && !detail ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-graphite" />
          </div>
        ) : detail ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="flex flex-col gap-5 px-6 pb-6">
              {/* 画像区（设计稿 info-grid：雾底双列 6 格；编辑态 4 格转输入 + 环线/年代补位格） */}
              <section className="grid grid-cols-2 gap-2.5">
                <div className="rounded-[14px] bg-fog px-3.5 py-2.5">
                  <p className="text-[10.5px] text-graphite">地址</p>
                  {editing ? (
                    <Input
                      className="mt-1 h-7 rounded-[9px] border-line bg-white text-[12px]"
                      value={patchForm.address}
                      onChange={(e) => setPatchForm((f) => ({ ...f, address: e.target.value }))}
                      placeholder="小区地址"
                    />
                  ) : (
                    <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-ink">{detail.address || "—"}</p>
                  )}
                </div>
                <div className="rounded-[14px] bg-fog px-3.5 py-2.5">
                  <p className="text-[10.5px] text-graphite">位置坐标（BD-09）</p>
                  {editing ? (
                    <div className="mt-1 flex gap-1">
                      <Input
                        className="h-7 rounded-[9px] border-line bg-white font-mono text-[12px]"
                        value={patchForm.lng}
                        onChange={(e) => setPatchForm((f) => ({ ...f, lng: e.target.value }))}
                        placeholder="经度"
                      />
                      <Input
                        className="h-7 rounded-[9px] border-line bg-white font-mono text-[12px]"
                        value={patchForm.lat}
                        onChange={(e) => setPatchForm((f) => ({ ...f, lat: e.target.value }))}
                        placeholder="纬度"
                      />
                    </div>
                  ) : (
                    <p className="mt-0.5 font-mono text-[12px] font-medium leading-relaxed text-ink">
                      {detail.lng != null && detail.lat != null ? `${detail.lng.toFixed(6)}, ${detail.lat.toFixed(6)}` : "—"}
                    </p>
                  )}
                </div>
                <div className="rounded-[14px] bg-fog px-3.5 py-2.5">
                  <p className="text-[10.5px] text-graphite">物业公司</p>
                  {editing ? (
                    <Input
                      className="mt-1 h-7 rounded-[9px] border-line bg-white text-[12px]"
                      value={patchForm.propertyMgmt}
                      onChange={(e) => setPatchForm((f) => ({ ...f, propertyMgmt: e.target.value }))}
                      placeholder="物业公司"
                    />
                  ) : (
                    <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-ink">{detail.property_mgmt || "—"}</p>
                  )}
                </div>
                <div className="rounded-[14px] bg-fog px-3.5 py-2.5">
                  <p className="text-[10.5px] text-graphite">开发商</p>
                  {editing ? (
                    <Input
                      className="mt-1 h-7 rounded-[9px] border-line bg-white text-[12px]"
                      value={patchForm.developer}
                      onChange={(e) => setPatchForm((f) => ({ ...f, developer: e.target.value }))}
                      placeholder="开发商"
                    />
                  ) : (
                    <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-ink">{detail.developer || "—"}</p>
                  )}
                </div>
                <div className="rounded-[14px] bg-fog px-3.5 py-2.5">
                  <p className="text-[10.5px] text-graphite">楼栋 / 户室</p>
                  <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-ink tabular-nums">
                    {detail.building_count} 栋 · {detail.room_count.toLocaleString()} 户
                  </p>
                </div>
                <div className="rounded-[14px] bg-fog px-3.5 py-2.5">
                  <p className="text-[10.5px] text-graphite">已绑项目</p>
                  <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-ink tabular-nums">{detail.linked_project_count} 个</p>
                </div>
                {/* 编辑态补位格：环线/建成年代在设计稿展示态只出现在头部 chips */}
                {editing ? (
                  <>
                    <div className="rounded-[14px] bg-fog px-3.5 py-2.5">
                      <p className="text-[10.5px] text-graphite">环线</p>
                      <Input
                        className="mt-1 h-7 rounded-[9px] border-line bg-white font-mono text-[12px]"
                        value={patchForm.ring}
                        onChange={(e) => setPatchForm((f) => ({ ...f, ring: e.target.value }))}
                        placeholder="如 外环外"
                      />
                    </div>
                    <div className="rounded-[14px] bg-fog px-3.5 py-2.5">
                      <p className="text-[10.5px] text-graphite">建成年代</p>
                      <div className="mt-1 flex gap-1">
                        <Input
                          className="h-7 rounded-[9px] border-line bg-white font-mono text-[12px]"
                          value={patchForm.eraFrom}
                          onChange={(e) => setPatchForm((f) => ({ ...f, eraFrom: e.target.value }))}
                          placeholder="起"
                        />
                        <Input
                          className="h-7 rounded-[9px] border-line bg-white font-mono text-[12px]"
                          value={patchForm.eraTo}
                          onChange={(e) => setPatchForm((f) => ({ ...f, eraTo: e.target.value }))}
                          placeholder="止"
                        />
                      </div>
                    </div>
                  </>
                ) : null}
              </section>

              {/* 户型图库（FR-20 v2.0：抽屉内唯一图片管理界面） */}
              <CommunityImagesSection communityId={detail.id} />

              {/* 合并信息区块（FR-14 v2.0；文案对齐设计稿 v1.7：去术语化） */}
              {detail.merged_into_id ? (
                <section className="rounded-2xl border border-rust/30 bg-apricot-wash/40 p-4">
                  <h3 className="text-[15px] font-medium text-ink">合并信息</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-graphite">
                    本小区已并入主档。解除后恢复为独立小区，数据无损拆回。
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={async () => {
                      const { error } = await client.POST("/api/v1/admin/communities/unmerge", {
                        body: { merged_id: detail.id, primary_id: detail.merged_into_id as string },
                      });
                      if (error) {
                        toast.error("解除合并失败");
                        return;
                      }
                      toast.success("已解除合并，小区恢复独立");
                      void loadDetail();
                      onUpdated?.();
                    }}
                  >
                    解除合并
                  </Button>
                </section>
              ) : null}
              {mergedChildren.length > 0 ? (
                <section className="rounded-2xl border border-dove/40 p-4">
                  <h3 className="text-[15px] font-medium text-ink">
                    合并信息 <span className="text-[13px] font-normal text-graphite">已并入 {mergedChildren.length} 个小区 · 支持解除</span>
                  </h3>
                  <div className="mt-2 flex flex-col gap-2">
                    {mergedChildren.map((m) => (
                      <div key={m.id} className="flex items-center gap-3 rounded-xl border border-dove/40 px-3 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-ink">{m.name}</span>
                          <span className="block truncate text-[11px] text-graphite">
                            {[m.address, m.district].filter(Boolean).join(" · ") || "—"} · 楼栋 {m.building_count} · 户室{" "}
                            {m.room_count.toLocaleString()} · 已绑 {m.linked_project_count}
                          </span>
                        </span>
                        <Button variant="outline" size="sm" onClick={() => void handleUnmergeChild(m.id, m.name)}>
                          解除合并
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* 楼栋列表（设计稿 sec-t：左标题 / 右 mono 计数 + rust 添加入口） */}
              <section>
                <div className="mb-2.5 flex items-baseline justify-between">
                  <h3 className="text-[14px] font-semibold text-ink">楼栋列表</h3>
                  <p className="font-mono text-[11px] text-graphite">
                    {buildingTotal} 栋{" "}
                    {!addingBld ? (
                      <button
                        type="button"
                        className="font-mono text-[10px] text-rust hover:underline"
                        onClick={() => {
                          setAddingBld(true);
                          setAddingRoomFor(null);
                        }}
                      >
                        · + 添加楼栋
                      </button>
                    ) : null}
                  </p>
                </div>
                <div className="relative mb-2.5">
                  <Search className="absolute left-3.5 top-2 size-3.5 text-dove" />
                  <Input
                    value={buildingKeyword}
                    onChange={(e) => setBuildingKeyword(e.target.value)}
                    placeholder="搜楼栋号，如 201乙"
                    className="h-8 rounded-full border-transparent bg-fog pl-9 text-[12px] focus-visible:border-ink"
                  />
                </div>
                {addingBld ? (
                  <BuildingAddForm
                    communityId={detail.id}
                    onDone={() => {
                      setAddingBld(false);
                      void loadDetail();
                      void loadBuildings();
                      onUpdated?.();
                    }}
                    onCancel={() => setAddingBld(false)}
                  />
                ) : null}
                <div className="flex flex-col gap-1.5">
                  {buildings.map((b) => (
                    <div
                      key={b.pending ? `p-${b.pending_id}` : `b-${b.id}`}
                      className={cn(
                        "rounded-[14px] border border-dove/40",
                        b.pending ? "border-dashed" : "hover:border-dove",
                        expandedBuilding === b.id && !b.pending && "border-rust bg-[#fffaf6]",
                      )}
                    >
                      <button
                        type="button"
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px]"
                        onClick={() => setExpandedBuilding(expandedBuilding === b.id ? null : b.id)}
                      >
                        <span className="min-w-16 font-mono font-semibold text-ink">{b.building_no}</span>
                        <span className="text-[11px] text-graphite tabular-nums">
                          {b.floor_count} 层 · {b.room_count} 户
                        </span>
                        <span className="ml-auto flex items-center gap-1.5">
                          {b.linked_project_count > 0 ? (
                            <span className="rounded-full bg-apricot-wash px-2 py-0.5 text-[10px] text-rust">
                              已绑 {b.linked_project_count}
                            </span>
                          ) : null}
                          {b.lng != null && b.lat != null ? (
                            <span className="rounded-full bg-fog px-2 py-0.5 text-[10px] text-graphite">有坐标</span>
                          ) : (
                            <span className="rounded-full bg-fog px-2 py-0.5 text-[10px] text-dove">无坐标</span>
                          )}
                          {b.pending ? <Badge variant="outline" className="h-5 px-1.5 text-[10px]">未审核</Badge> : null}
                        </span>
                      </button>
                      {expandedBuilding === b.id && !b.pending ? (
                        <div className="px-3.5 pb-3">
                          {canGovern ? (
                            <div className="flex items-center justify-end gap-3 pb-1.5">
                              {renamingBuilding?.id === b.id ? null : (
                                <button
                                  type="button"
                                  className="text-[10.5px] text-graphite hover:text-rust hover:underline"
                                  onClick={() => {
                                    setRenamingBuilding({ id: b.id, value: b.building_no });
                                    setAddingRoomFor(null);
                                  }}
                                >
                                  改名
                                </button>
                              )}
                              <button
                                type="button"
                                className="text-[10.5px] text-rust hover:underline"
                                onClick={() => void handleDeleteBuilding(b)}
                              >
                                删除楼栋
                              </button>
                            </div>
                          ) : null}
                          {/* BR-29：审核通过后纠错 —— 楼栋号内联改名（尾部「号」自动归一） */}
                          {renamingBuilding?.id === b.id ? (
                            <div className="mb-1.5 flex flex-wrap items-center gap-2 rounded-xl border border-rust/30 bg-apricot-wash/50 px-3 py-2 text-[12px] text-graphite">
                              <span>楼栋号</span>
                              <Input
                                autoFocus
                                value={renamingBuilding.value}
                                onChange={(e) =>
                                  setRenamingBuilding({ id: b.id, value: e.target.value })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void handleRenameBuilding(b);
                                  if (e.key === "Escape") setRenamingBuilding(null);
                                }}
                                className="h-7 w-36 font-mono text-[12px]"
                                placeholder="如 21"
                              />
                              <button
                                type="button"
                                className="rounded-full bg-ink px-3 py-1 text-[11px] text-white disabled:opacity-50"
                                disabled={renamingBuildingBusy}
                                onClick={() => void handleRenameBuilding(b)}
                              >
                                {renamingBuildingBusy ? (
                                  <Loader2 className="inline size-3 animate-spin" />
                                ) : null}{" "}
                                保存
                              </button>
                              <button
                                type="button"
                                className="rounded-full border border-dove/60 px-3 py-1 text-[11px] text-graphite"
                                onClick={() => setRenamingBuilding(null)}
                              >
                                取消
                              </button>
                              <span className="text-[10px]">尾部「号」自动去除，展示仍为「号」</span>
                            </div>
                          ) : null}
                          <FloorRoomPanel
                            buildingId={b.id}
                            refreshSignal={roomRefreshTick}
                            onPick={(room) =>
                              setPicked({
                                buildingNo: b.building_no,
                                roomNo: room.roomNo,
                                plate: room.plate,
                                lng: b.lng ?? null,
                                lat: b.lat ?? null,
                              })
                            }
                            onDeleteRoom={
                              canGovern ? (roomId, roomNo) => void handleDeleteRoom(b.id, roomId, roomNo) : undefined
                            }
                            onRenameRoom={
                              canGovern ? (roomId, roomNo) => void handleRenameRoom(b.id, roomId, roomNo) : undefined
                            }
                            onDeleteFloor={
                              canGovern
                                ? (floor, floorLabel) => void handleDeleteFloor(b.id, floor, floorLabel)
                                : undefined
                            }
                            onAddRoom={
                              addingRoomFor === b.id
                                ? undefined
                                : () => {
                                    setAddingRoomFor(b.id);
                                  }
                            }
                            addRoomSlot={
                              addingRoomFor === b.id ? (
                                <RoomAddForm
                                  buildingId={b.id}
                                  onDone={() => {
                                    setAddingRoomFor(null);
                                    void loadDetail();
                                    void loadBuildings();
                                    setExpandedBuilding(b.id);
                                    // 触发展开面板重载，新楼层/户室即时可见
                                    setRoomRefreshTick((t) => t + 1);
                                    onUpdated?.();
                                  }}
                                  onCancel={() => setAddingRoomFor(null)}
                                />
                              ) : undefined
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {buildings.length === 0 ? (
                    <p className="px-4 py-6 text-center text-[13px] text-graphite">
                      {buildingSearch ? "没找到该楼栋" : "暂无楼栋"}
                    </p>
                  ) : null}
                  {buildingTotal > buildings.length ? (
                    <div className="flex items-center justify-between pt-1 text-[12px] text-graphite">
                      <span>
                        第 {buildingPage} / {Math.max(1, Math.ceil(buildingTotal / 20))} 页
                      </span>
                      <span className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={buildingPage <= 1}
                          onClick={() => setBuildingPage((p) => Math.max(1, p - 1))}
                        >
                          上一页
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={buildingPage >= Math.ceil(buildingTotal / 20)}
                          onClick={() => setBuildingPage((p) => p + 1)}
                        >
                          下一页
                        </Button>
                      </span>
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {/* 底部操作条（设计稿 dw-foot：选中回显 + 编辑资料 + 绑定项目） */}
        <SheetFooter className="border-t border-dove/40 px-6 py-3.5">
          <div className="flex w-full items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-graphite">
              {picked ? (
                <>
                  已选 <b className="font-medium text-rust">{formatBuildingLabel(picked.buildingNo)} {picked.roomNo}</b>
                  {picked.lng != null && picked.lat != null ? (
                    <span className="ml-1 font-mono">
                      · 位置坐标 {picked.lng.toFixed(6)}, {picked.lat.toFixed(6)}
                    </span>
                  ) : null}
                </>
              ) : (
                <>点楼栋展开，再选楼层和户室；0401 自动算 401</>
              )}
            </p>
            <div className="flex shrink-0 gap-2">
              {editing ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => {
                      setEditing(false);
                      setPatchForm({
                        ring: detail?.ring ?? "",
                        eraFrom: String(detail?.era_from ?? ""),
                        eraTo: String(detail?.era_to ?? ""),
                        address: detail?.address ?? "",
                        lng: detail?.lng != null ? String(detail.lng) : "",
                        lat: detail?.lat != null ? String(detail.lat) : "",
                        propertyMgmt: detail?.property_mgmt ?? "",
                        developer: detail?.developer ?? "",
                      });
                    }}
                  >
                    取消
                  </Button>
                  <Button size="sm" className="rounded-full bg-ink text-white" onClick={handlePatch}>
                    保存
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => {
                      setEditing(true);
                      toast("画像进入编辑态：地址 / 坐标 / 物业 / 开发商 / 环线 / 年代 人工修正");
                    }}
                  >
                    编辑资料
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-full bg-ink text-white"
                    disabled={!picked}
                    onClick={() => {
                      toast(`已选 ${formatBuildingLabel(picked?.buildingNo)} ${picked?.plate}，请在项目表单中确认绑定`);
                    }}
                  >
                    绑定项目
                  </Button>
                </>
              )}
            </div>
          </div>
        </SheetFooter>
      </SheetContent>

      {detail ? (
        <MergeDialog
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          primaryId={detail.id}
          primaryName={detail.name}
          onMerged={() => {
            onOpenChange(false);
            onUpdated?.();
          }}
        />
      ) : null}
    </Sheet>
  );
}
