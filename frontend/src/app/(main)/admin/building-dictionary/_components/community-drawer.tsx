"use client";

/**
 * 小区详情抽屉（FR-02~07/14/20，对齐设计稿 v2.0 ARTBOARD 02，560px）.
 *
 * 画像区（地址/锚点 BD-09/物业/开发商/计数 + 修正画像编辑态 PATCH）；
 * 户型图库区块（FR-20，复用现有 images 端点，上传/改描述/调排序/软删）；
 * 合并信息区块（v2.0 修订二）：
 *   - 被并视角：merged_into_id → 主档信息 + 解除合并；
 *   - 主档视角：merged_children 逐条呈现（地址/楼栋/户室/已绑）+ 单条解除合并；
 * 楼栋列表（搜索/20 分页/pending 虚线叠加/已绑项目徽标）→ 展开楼层分组 → 户室网格
 * （单选 + BD-09 坐标回显 + 门牌映射）+ admin 区间补录楼栋/户室（FR-06）；
 * 底部操作条：编辑资料（画像编辑态）+ 绑定项目（选中户室后可点）。
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Pencil, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { client } from "@/lib/api-client";
import { cn } from "@/lib/utils";

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
  onMerged?: () => void;
  /** 总览首图列点击直达：打开后滚动/聚焦到户型图库区块 */
  focusImages?: boolean;
}

export function CommunityDrawer({
  communityId,
  communityName,
  open,
  onOpenChange,
  onMerged,
  focusImages,
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
  const [patchForm, setPatchForm] = useState({ ring: "", eraFrom: "", eraTo: "" });
  const [mergeOpen, setMergeOpen] = useState(false);
  const [expandedBuilding, setExpandedBuilding] = useState<number | null>(null);
  const [addingBld, setAddingBld] = useState(false);
  const [addingRoomFor, setAddingRoomFor] = useState<number | null>(null);
  const [picked, setPicked] = useState<{ buildingNo: string; roomNo: string; plate: string; lng: number | null; lat: number | null } | null>(null);

  const loadDetail = useCallback(async () => {
    if (!communityId) return;
    setLoading(true);
    try {
      const { data, error } = await client.GET("/api/v1/admin/building-dictionary/communities/{community_id}", {
        params: { path: { community_id: communityId } },
      });
      if (!error && data) {
        const d = data as unknown as BdCommunityDetail;
        setDetail(d);
        setPatchForm({
          ring: d.ring ?? "",
          eraFrom: String(d.era_from ?? ""),
          eraTo: String(d.era_to ?? ""),
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
        setBuildings(data.items as unknown as BdBuildingListItem[]);
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
  }, [communityId, detail, patchForm, loadDetail]);

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
      onMerged?.();
    },
    [communityId, loadDetail, onMerged],
  );

  const mergedChildren = detail?.merged_children ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[560px] flex-col gap-0 overflow-hidden sm:w-[560px]">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center justify-between pr-8">
            <span className="font-display text-[22px]">{detail?.name ?? communityName}</span>
            <span className="flex items-center gap-2">
              {canGovern ? (
                <Button variant="outline" size="sm" onClick={() => setMergeOpen(true)}>
                  合并
                </Button>
              ) : null}
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
              {/* 画像区（设计稿 info-grid：雾底双列 6 格） */}
              <section className="grid grid-cols-2 gap-2.5">
                <div className="rounded-[14px] bg-fog px-3.5 py-2.5">
                  <p className="text-[10.5px] text-graphite">地址</p>
                  <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-ink">{detail.address || "—"}</p>
                </div>
                <div className="rounded-[14px] bg-fog px-3.5 py-2.5">
                  <p className="text-[10.5px] text-graphite">位置坐标（BD-09）</p>
                  <p className="mt-0.5 font-mono text-[12px] font-medium leading-relaxed text-ink">
                    {detail.lng != null && detail.lat != null ? `${detail.lng.toFixed(6)}, ${detail.lat.toFixed(6)}` : "—"}
                  </p>
                </div>
                <div className="rounded-[14px] bg-fog px-3.5 py-2.5">
                  <p className="text-[10.5px] text-graphite">物业公司</p>
                  <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-ink">{detail.property_mgmt || "—"}</p>
                </div>
                <div className="rounded-[14px] bg-fog px-3.5 py-2.5">
                  <p className="text-[10.5px] text-graphite">开发商</p>
                  <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-ink">{detail.developer || "—"}</p>
                </div>
                <div className="rounded-[14px] bg-fog px-3.5 py-2.5">
                  <p className="text-[10.5px] text-graphite">环线</p>
                  {editing ? (
                    <Input
                      className="mt-1 h-7 rounded-[9px] border-line bg-white font-mono text-[12px]"
                      value={patchForm.ring}
                      onChange={(e) => setPatchForm((f) => ({ ...f, ring: e.target.value }))}
                      placeholder="如 外环外"
                    />
                  ) : (
                    <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-ink">{detail.ring || "—"}</p>
                  )}
                </div>
                <div className="rounded-[14px] bg-fog px-3.5 py-2.5">
                  <p className="text-[10.5px] text-graphite">建成年代</p>
                  {editing ? (
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
                  ) : (
                    <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-ink tabular-nums">
                      {detail.era_from ? `${detail.era_from}${detail.era_to ? `~${detail.era_to}` : ""}` : "—"}
                    </p>
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
              </section>

              {/* 户型图库（FR-20 v2.0：抽屉内唯一图片管理界面） */}
              <CommunityImagesSection communityId={detail.id} scrollTo={focusImages} />

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
                      onMerged?.();
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

              {/* 楼栋列表（设计稿：标题 + 「+ 添加楼栋」在同侧，通栏雾底搜索药丸） */}
              <section>
                <div className="mb-2.5 flex items-baseline justify-between">
                  <h3 className="text-[14px] font-semibold text-ink">
                    楼栋列表 <span className="font-mono text-[11px] font-normal text-graphite">{buildingTotal} 栋</span>
                    {!addingBld ? (
                      <button
                        type="button"
                        className="ml-2 font-mono text-[10px] font-normal text-rust hover:underline"
                        onClick={() => {
                          setAddingBld(true);
                          setAddingRoomFor(null);
                        }}
                      >
                        + 添加楼栋
                      </button>
                    ) : null}
                  </h3>
                </div>
                <div className="relative mb-2.5">
                  <Search className="absolute left-4 top-2 size-3.5 text-dove" />
                  <Input
                    value={buildingKeyword}
                    onChange={(e) => setBuildingKeyword(e.target.value)}
                    placeholder="搜楼栋号，如 201乙"
                    className="h-9 rounded-full border-transparent bg-fog pl-10 text-[12px] focus-visible:border-ink"
                  />
                </div>
                {addingBld ? (
                  <BuildingAddForm
                    communityId={detail.id}
                    onDone={() => {
                      setAddingBld(false);
                      void loadDetail();
                      void loadBuildings();
                    }}
                    onCancel={() => setAddingBld(false)}
                  />
                ) : null}
                <div className="flex flex-col gap-1.5">
                  {buildings.map((b) => (
                    <div
                      key={b.pending ? `p-${b.pending_id}` : `b-${b.id}`}
                      className={cn(
                        "rounded-2xl border border-dove/40",
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
                          <FloorRoomPanel
                            buildingId={b.id}
                            onPick={(room) =>
                              setPicked({
                                buildingNo: b.building_no,
                                roomNo: room.roomNo,
                                plate: room.plate,
                                lng: b.lng,
                                lat: b.lat,
                              })
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
                  已选 <b className="font-medium text-rust">{picked.buildingNo} 栋 {picked.roomNo}</b>
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
                      });
                    }}
                  >
                    <X className="mr-1 size-3.5" />
                    取消
                  </Button>
                  <Button size="sm" className="rounded-full bg-ink text-white" onClick={handlePatch}>
                    <Check className="mr-1 size-3.5" />
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
                      toast("画像进入编辑态：环线 / 类型 / 年代 人工修正");
                    }}
                  >
                    <Pencil className="mr-1 size-3.5" />
                    编辑资料
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-full bg-ink text-white"
                    disabled={!picked}
                    onClick={() => {
                      toast(`已选 ${picked?.buildingNo} 栋 ${picked?.plate}，请在项目表单中确认绑定`);
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
            onMerged?.();
          }}
        />
      ) : null}
    </Sheet>
  );
}
