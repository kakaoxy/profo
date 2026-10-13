"use client";

/**
 * 字典总览客户端视图（FR-01 / 设计稿 ARTBOARD 01）.
 *
 * KPI hero（Apricot 暖卡唯一）+ 筛选栏（区域/环线/类型下拉 + 关键词搜索）
 * + 小区表格（首图缩略列点击直达抽屉图片区块，无图占位兜底）+ 分页 20/页；
 * 行点击开详情抽屉（community-drawer）；页头动作：＋新增小区 / 审核池徽标 / 导入数据。
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, FileUp, Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/common/pagination";

import { CommunityDrawer } from "./community-drawer";
import { CreateCommunityDialog } from "./create-community-dialog";
import type { BdCommunityListItem, BdKpiResponse } from "./types";

interface BdOverviewClientProps {
  kpi: BdKpiResponse;
  list: { total: number; items: BdCommunityListItem[] };
  keyword: string;
  district: string;
  ring: string;
  propertyType: string;
  eraFrom: number | undefined;
  eraTo: number | undefined;
  hasProjectLink: boolean | undefined;
  page: number;
}

const RING_OPTIONS = ["内环内", "内环至中环", "中环至外环", "外环外"] as const;
const DISTRICT_OPTIONS = [
  "黄浦", "徐汇", "长宁", "静安", "普陀", "虹口", "杨浦", "闵行",
  "宝山", "嘉定", "浦东", "金山", "松江", "青浦", "奉贤", "崇明",
] as const;
const TYPE_OPTIONS = ["住宅-公寓", "住宅-新里", "住宅-别墅", "住宅-洋房", "住宅-老公寓", "商业类", "写字楼"] as const;

/** 建成年代筛选档位 → URL 参数（2000年前=era_to=1999；2020年后=era_from=2020） */
const ERA_FILTER_PARAMS: Record<string, { era_from?: number; era_to?: number }> = {
  "before2000": { era_to: 1999 },
  "2000-2010": { era_from: 2000, era_to: 2010 },
  "2010-2020": { era_from: 2010, era_to: 2020 },
  after2020: { era_from: 2020 },
};

/** 依据 URL 的 era_from/era_to 反推当前年代档位（用于 Select 回显） */
function eraValueOf(eraFrom: number | undefined, eraTo: number | undefined): string {
  if (eraFrom === undefined && eraTo === 1999) return "before2000";
  if (eraFrom === 2000 && eraTo === 2010) return "2000-2010";
  if (eraFrom === 2010 && eraTo === 2020) return "2010-2020";
  if (eraFrom === 2020 && eraTo === undefined) return "after2020";
  return "all";
}

export function BdOverviewClient({
  kpi,
  list,
  keyword,
  district,
  ring,
  propertyType,
  eraFrom,
  eraTo,
  hasProjectLink,
  page,
}: BdOverviewClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState(keyword);
  const [selected, setSelected] = useState<BdCommunityListItem | null>(null);
  const [focusImages, setFocusImages] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  /** 筛选跳转（重置回第 1 页） */
  const applyFilter = useCallback(
    (next: {
      keyword?: string;
      district?: string;
      ring?: string;
      type?: string;
      era?: string;
      projectLink?: string;
    }) => {
      const params = new URLSearchParams();
      const kw = next.keyword !== undefined ? next.keyword : keyword;
      const dist = next.district !== undefined ? next.district : district;
      const rg = next.ring !== undefined ? next.ring : ring;
      const tp = next.type !== undefined ? next.type : propertyType;
      const eraVal = next.era !== undefined ? next.era : eraValueOf(eraFrom, eraTo);
      const currentLink = hasProjectLink === undefined ? "all" : hasProjectLink ? "true" : "false";
      const linkVal = next.projectLink !== undefined ? next.projectLink : currentLink;
      if (kw) params.set("keyword", kw);
      if (dist) params.set("district", dist);
      if (rg) params.set("ring", rg);
      if (tp) params.set("type", tp);
      if (eraVal !== "all") {
        const eraParams = ERA_FILTER_PARAMS[eraVal];
        if (eraParams) {
          if (eraParams.era_from !== undefined) params.set("era_from", String(eraParams.era_from));
          if (eraParams.era_to !== undefined) params.set("era_to", String(eraParams.era_to));
        }
      }
      if (linkVal !== "all") params.set("has_project_link", linkVal);
      router.push(`/admin/building-dictionary${params.size ? `?${params.toString()}` : ""}`);
    },
    [keyword, district, ring, propertyType, eraFrom, eraTo, hasProjectLink, router],
  );

  const gotoPage = useCallback(
    (p: number) => {
      const params = new URLSearchParams();
      if (keyword) params.set("keyword", keyword);
      if (district) params.set("district", district);
      if (ring) params.set("ring", ring);
      if (propertyType) params.set("type", propertyType);
      if (eraFrom !== undefined) params.set("era_from", String(eraFrom));
      if (eraTo !== undefined) params.set("era_to", String(eraTo));
      if (hasProjectLink !== undefined) params.set("has_project_link", hasProjectLink ? "true" : "false");
      if (p > 1) params.set("page", String(p));
      router.push(`/admin/building-dictionary${params.size ? `?${params.toString()}` : ""}`);
    },
    [keyword, district, ring, propertyType, eraFrom, eraTo, hasProjectLink, router],
  );

  /** 行点击：普通区域打开抽屉；首图缩略点击：打开并直达图片区块（FR-20） */
  const openRow = useCallback((c: BdCommunityListItem, toImages: boolean) => {
    setFocusImages(toImages);
    setSelected(c);
  }, []);

  const kpis = [
    { label: "小区", value: kpi.community_count, sub: "全量 19,655 · 覆盖 16 区" },
    { label: "楼栋", value: kpi.building_count, sub: "结构化楼栋 · 约 97% 带坐标" },
    { label: "户室", value: kpi.room_count, sub: "全量 733 万 · 前两位解析楼层" },
    { label: "已绑项目", value: kpi.linked_project_count, sub: "已选到具体户室的项目" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* KPI hero（Apricot 暖卡唯一，DESIGN.md） */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-3xl bg-apricot-wash/60 px-5 py-4">
            <p className="text-[13px] text-rust">{k.label}</p>
            <p className="mt-1 font-display text-[28px] leading-none text-ink tabular-nums">
              {k.value.toLocaleString()}
            </p>
            <p className="mt-1 text-[10.5px] text-rust/70">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* 页头动作 + 筛选栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={district} onValueChange={(v) => applyFilter({ district: v === "all" ? "" : v })}>
            <SelectTrigger className="h-8 w-[130px] rounded-full text-[12.5px]">
              <SelectValue placeholder="区域：全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">区域：全部</SelectItem>
              {DISTRICT_OPTIONS.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ring} onValueChange={(v) => applyFilter({ ring: v === "all" ? "" : v })}>
            <SelectTrigger className="h-8 w-[130px] rounded-full text-[12.5px]">
              <SelectValue placeholder="环线：全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">环线：全部</SelectItem>
              {RING_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={propertyType} onValueChange={(v) => applyFilter({ type: v === "all" ? "" : v })}>
            <SelectTrigger className="h-8 w-[130px] rounded-full text-[12.5px]">
              <SelectValue placeholder="类型：全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">类型：全部</SelectItem>
              {TYPE_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={eraValueOf(eraFrom, eraTo)} onValueChange={(v) => applyFilter({ era: v })}>
            <SelectTrigger className="h-8 w-[130px] rounded-full text-[12.5px]">
              <SelectValue placeholder="建成年代：全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">建成年代：全部</SelectItem>
              <SelectItem value="before2000">2000年前</SelectItem>
              <SelectItem value="2000-2010">2000-2010</SelectItem>
              <SelectItem value="2010-2020">2010-2020</SelectItem>
              <SelectItem value="after2020">2020年后</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={hasProjectLink === undefined ? "all" : hasProjectLink ? "true" : "false"}
            onValueChange={(v) => applyFilter({ projectLink: v })}
          >
            <SelectTrigger className="h-8 w-[130px] rounded-full text-[12.5px]">
              <SelectValue placeholder="项目关联：全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">项目关联：全部</SelectItem>
              <SelectItem value="true">有关联</SelectItem>
              <SelectItem value="false">无关联</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 size-3.5 text-dove" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilter({ keyword: search });
              }}
              placeholder="搜小区名或地址"
              className="h-8 w-56 rounded-full pl-8 text-[12.5px]"
            />
          </div>
          {keyword || district || ring || propertyType || eraFrom !== undefined || eraTo !== undefined || hasProjectLink !== undefined ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-[12px] text-graphite"
              onClick={() => {
                setSearch("");
                router.push("/admin/building-dictionary");
              }}
            >
              清除筛选
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/admin/building-dictionary/review")}>
            待审核
            {kpi.pending_count > 0 ? (
              <Badge className="ml-1 h-5 bg-rust px-1.5 text-white">{kpi.pending_count}</Badge>
            ) : null}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 size-4" />
            新增小区
          </Button>
          <Button size="sm" className="bg-ink text-white" onClick={() => router.push("/admin/building-dictionary/import")}>
            <FileUp className="mr-1 size-4" />
            导入数据
          </Button>
        </div>
      </div>

      {/* 小区表格 */}
      <div className="overflow-hidden rounded-2xl border border-dove/40">
        <Table>
          <TableHeader>
            <TableRow className="bg-fog">
              <TableHead className="w-16">首图</TableHead>
              <TableHead>小区</TableHead>
              <TableHead>区域/板块</TableHead>
              <TableHead>环线</TableHead>
              <TableHead>物业类型</TableHead>
              <TableHead>建成年代</TableHead>
              <TableHead className="text-right">楼栋</TableHead>
              <TableHead className="text-right">户室</TableHead>
              <TableHead className="text-right">已绑项目</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.items.map((c) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => openRow(c, false)}>
                <TableCell>
                  <button
                    type="button"
                    aria-label="查看图片"
                    className="block"
                    onClick={(e) => {
                      e.stopPropagation();
                      openRow(c, true);
                    }}
                  >
                    {c.first_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.first_image_url}
                        alt={c.name}
                        className="size-10 rounded-lg object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.visibility = "hidden";
                        }}
                      />
                    ) : (
                      <span className="flex size-10 items-center justify-center rounded-lg border border-dashed border-dove text-dove">
                        <Database className="size-4" />
                      </span>
                    )}
                  </button>
                </TableCell>
                <TableCell>
                  <p className="font-medium text-ink">{c.name}</p>
                  {c.address ? <p className="text-[12px] text-graphite">{c.address}</p> : null}
                </TableCell>
                <TableCell className="text-[13px] text-graphite">
                  {[c.district, c.business_circle].filter(Boolean).join(" · ") || "—"}
                </TableCell>
                <TableCell>
                  {c.ring ? (
                    <span className="rounded-full bg-apricot-wash px-2.5 py-0.5 text-[10.5px] text-rust">{c.ring}</span>
                  ) : (
                    <span className="text-dove">—</span>
                  )}
                </TableCell>
                <TableCell className="text-[13px] text-graphite">
                  {c.property_types.length ? c.property_types.join("、") : "—"}
                </TableCell>
                <TableCell className="text-[13px] tabular-nums">
                  {c.era_from ? `${c.era_from}${c.era_to ? `~${c.era_to}` : ""}` : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.building_count}</TableCell>
                <TableCell className="text-right tabular-nums">{c.room_count.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{c.linked_project_count}</TableCell>
                <TableCell className="text-dove">›</TableCell>
              </TableRow>
            ))}
            {list.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-12 text-center text-graphite">
                  没找到相关小区
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Pagination
        mode="controlled"
        totalItems={list.total}
        currentPage={page}
        totalPages={Math.max(1, Math.ceil(list.total / 20))}
        pageSize={20}
        onPageChange={gotoPage}
      />

      {/* 详情抽屉（FR-02） */}
      <CommunityDrawer
        communityId={selected?.id ?? null}
        communityName={selected?.name ?? ""}
        open={!!selected}
        focusImages={focusImages}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setFocusImages(false);
          }
        }}
        onMerged={() => router.refresh()}
      />

      <CreateCommunityDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
