"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import { StatusBadge } from "@/app/(main)/admin/_components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { components } from "@/lib/api-types";
import { escapeHtml, type AMapInfoWindow, type AMapMap, type AMapMarker } from "../_components/amap";
import { merchantApi, queryString } from "../_components/merchant-api";

type MapResponse = components["schemas"]["MerchantMapResponse"];
type MapPoint = components["schemas"]["MerchantMapPoint"];
type AmapConfig = components["schemas"]["AmapConfigResponse"];

/**
 * 合作状态标记色：一律取 DESIGN 令牌（globals.css 的 @theme inline 会输出同名 CSS 变量），
 * 禁止硬编码 hex——DESIGN「Don't」不允许引入饱和蓝/绿/红做 UI chrome。
 */
const STATUS_COLORS: Record<string, string> = {
  not_cooperated: "var(--color-slate)",
  negotiating: "var(--color-apricot-edge)",
  cooperated: "var(--color-rust)",
  paused: "var(--color-dove)",
  terminated: "var(--color-ink)",
};

const STATUS_LEGEND: Array<{ code: string; label: string }> = [
  { code: "not_cooperated", label: "未合作" },
  { code: "negotiating", label: "洽谈中" },
  { code: "cooperated", label: "已合作" },
  { code: "paused", label: "暂停" },
  { code: "terminated", label: "终止" },
];

const REVIEW_LABELS: Record<string, string> = {
  pending: "待审核",
  approved: "已转正",
  rejected: "已驳回",
};

function infoWindowHtml(point: MapPoint): string {
  const coordinateHint = point.has_coordinate
    ? ""
    : `<br/><a href="/admin/merchant/stores/${encodeURIComponent(point.id)}" style="color:var(--color-rust)">坐标缺失，去补全</a>`;
  const lastVisit = point.last_visit_at
    ? new Date(point.last_visit_at).toLocaleDateString("zh-CN")
    : "暂无";
  return [
    `<div style="font-size:13px;line-height:1.6">`,
    `<b>${escapeHtml(point.store_name)}</b><br/>`,
    `${escapeHtml(point.company_name)}<br/>`,
    `${escapeHtml(point.address)}<br/>`,
    `${escapeHtml(point.district)} · ${escapeHtml(point.business_circle)}<br/>`,
    `经纪人 ${escapeHtml(point.broker_count)} · ${escapeHtml(point.cooperation_status_label)} · 审核 ${escapeHtml(REVIEW_LABELS[point.review_status] ?? point.review_status)}<br/>`,
    `最近拜访 ${escapeHtml(lastVisit)}`,
    coordinateHint,
    `</div>`,
  ].join("");
}

export default function MerchantMapPage() {
  const [data, setData] = useState<MapResponse | null>(null);
  const [district, setDistrict] = useState("");
  const [businessCircle, setBusinessCircle] = useState("");
  const [cooperation, setCooperation] = useState("all");
  const [review, setReview] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [mapError, setMapError] = useState("");
  const [loading, setLoading] = useState(true);
  // 高德 Key 与安全密钥由后台「系统设置 → 高德地图」配置，按需读取（null=加载中）
  const [amapKey, setAmapKey] = useState<string | null>(null);
  const [amapSecurityCode, setAmapSecurityCode] = useState("");
  const mapRef = useRef<AMapMap | null>(null);
  const markersRef = useRef<Map<string, AMapMarker>>(new Map());
  const infoRef = useRef<AMapInfoWindow | null>(null);
  const mapContainer = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = await merchantApi<MapResponse>(
        `/admin/merchant/map/stores${queryString({
          district: district.trim() || undefined,
          business_circle: businessCircle.trim() || undefined,
          cooperation_status: cooperation === "all" ? undefined : cooperation,
          review_status: review === "all" ? undefined : review,
        })}`,
      );
      setData(result);
    } catch (err) {
      setMapError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    merchantApi<AmapConfig>("/admin/merchant/map/config")
      .then((config) => {
        setAmapKey(config.js_key || "");
        setAmapSecurityCode(config.security_js_code || "");
      })
      .catch(() => setAmapKey(""));
  }, []);

  useEffect(() => {
    if (!data || !amapKey || !mapContainer.current) return;
    let disposed = false;
    const init = () => {
      if (disposed || !mapContainer.current || !window.AMap) return;
      const map = new window.AMap.Map(mapContainer.current, {
        zoom: 12,
        center: [121.4737, 31.2304],
        resizeEnable: true,
      });
      mapRef.current = map;
      infoRef.current = new window.AMap.InfoWindow({ offset: [0, -20] });
      const render = () => {
        if (!data || !window.AMap || !mapRef.current) return;
        markersRef.current.forEach((marker) => mapRef.current?.remove(marker));
        markersRef.current.clear();
        const zoom = mapRef.current.getZoom();
        if (zoom < 15) {
          const groups = new Map<string, MapPoint[]>();
          data.points
            .filter((point) => point.has_coordinate)
            .forEach((point) => {
              const key = point.district || "未分区";
              groups.set(key, [...(groups.get(key) || []), point]);
            });
          groups.forEach((points, key) => {
            const lng = points.reduce((sum, point) => sum + (point.lng || 0), 0) / points.length;
            const lat = points.reduce((sum, point) => sum + (point.lat || 0), 0) / points.length;
            const marker = new window.AMap!.Marker({
              position: [lng, lat],
              content: `<div style="background:var(--color-ink);color:var(--color-pure-white);border-radius:999px;padding:4px 10px;font-size:12px">${escapeHtml(key)} ${points.length}</div>`,
            });
            marker.on("click", () => {
              mapRef.current?.setCenter([lng, lat]);
            });
            mapRef.current?.add(marker);
          });
        } else {
          data.points
            .filter((point) => point.has_coordinate)
            .forEach((point) => {
              const marker = new window.AMap!.Marker({
                position: [point.lng || 0, point.lat || 0],
                content: `<div style="width:12px;height:12px;border-radius:50%;background:${STATUS_COLORS[point.cooperation_status] || "var(--color-ink)"};border:2px solid var(--color-pure-white);box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`,
              });
              marker.on("click", () => {
                setSelectedId(point.id);
                infoRef.current?.setContent(infoWindowHtml(point));
                if (mapRef.current) {
                  infoRef.current?.open(mapRef.current, [point.lng || 0, point.lat || 0]);
                }
              });
              mapRef.current?.add(marker);
              markersRef.current.set(point.id, marker);
            });
        }
      };
      render();
      map.on("zoomend", render);
    };
    if (window.AMap) {
      init();
    } else {
      // 安全密钥必须在加载 JS API 脚本前设置，否则服务请求会返回 10008
      if (amapSecurityCode) {
        window._AMapSecurityConfig = { securityJsCode: amapSecurityCode };
      }
      const script = document.createElement("script");
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${amapKey}`;
      script.async = true;
      script.onload = () => {
        if (!window.AMap) {
          setMapError("高德地图加载失败（Key 无效或平台不是 Web 端 JS API），列表仍可使用");
          return;
        }
        init();
      };
      script.onerror = () => setMapError("高德地图加载失败，列表仍可使用");
      document.body.appendChild(script);
    }
    const markers = markersRef.current;
    const createdMap = mapRef.current;
    return () => {
      disposed = true;
      markers.clear();
      createdMap?.destroy();
      if (mapRef.current === createdMap) mapRef.current = null;
    };
  }, [data, amapKey, amapSecurityCode]);

  useEffect(() => {
    // 地图 marker 点击会更新 selectedId，这里把对应列表项滚进可视区（M09-003）
    if (!selectedId) return;
    const item = document.querySelector(`[data-point-id="${selectedId}"]`);
    item?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const focusPoint = (point: MapPoint) => {
    setSelectedId(point.id);
    if (point.has_coordinate && mapRef.current) {
      mapRef.current.setCenter([point.lng || 0, point.lat || 0], true);
      infoRef.current?.setContent(infoWindowHtml(point));
      infoRef.current?.open(mapRef.current, [point.lng || 0, point.lat || 0]);
    }
  };

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader title="门店地图" description="区域门店分布、合作状态与经纪人数量" />

        {amapKey === "" ? (
          <Card className="rounded-cards border-0 shadow-steep-sm p-5 text-sm text-graphite">
            未配置高德地图 Key，地图区域不可用；门店列表与统计仍可正常使用。
            请前往
            <Link className="mx-1 text-rust hover:underline" href="/admin/settings/amap">
              系统设置 · 高德地图
            </Link>
            配置后刷新本页。
          </Card>
        ) : null}
        {mapError ? <Card className="rounded-cards border-0 shadow-steep-sm p-5 text-sm text-error">{mapError}</Card> : null}

        <Card className="rounded-cards border-0 shadow-steep-sm gap-3 p-5">
          {/* Card 自带 flex-col：筛选控件必须放在内层横向容器，直接挂 flex-wrap 会纵向堆叠 */}
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="w-44"
              placeholder="区县"
              aria-label="按区县筛选"
              value={district}
              onChange={(event) => setDistrict(event.target.value)}
            />
            <Input
              className="w-44"
              placeholder="商圈"
              aria-label="按商圈筛选"
              value={businessCircle}
              onChange={(event) => setBusinessCircle(event.target.value)}
            />
            <Select value={cooperation} onValueChange={setCooperation}>
              <SelectTrigger className="w-36" aria-label="按合作状态筛选">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部合作状态</SelectItem>
                <SelectItem value="not_cooperated">未合作</SelectItem>
                <SelectItem value="negotiating">洽谈中</SelectItem>
                <SelectItem value="cooperated">已合作</SelectItem>
                <SelectItem value="paused">暂停</SelectItem>
                <SelectItem value="terminated">终止</SelectItem>
              </SelectContent>
            </Select>
            <Select value={review} onValueChange={setReview}>
              <SelectTrigger className="w-36" aria-label="按审核状态筛选">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部审核</SelectItem>
                <SelectItem value="pending">待审核</SelectItem>
                <SelectItem value="approved">已转正</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              刷新
            </Button>
          </div>
          {/* 颜色本身无法自解释，必须配图例（V08 GAP：REQ-M09-002） */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-dove pt-3 text-[13px] text-graphite">
            <span className="text-ink">图例</span>
            {STATUS_LEGEND.map((item) => (
              <span key={item.code} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-3 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[item.code] }}
                />
                {item.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-3 rounded-full border border-dashed border-dove" />
              坐标缺失
            </span>
          </div>
        </Card>

        {data ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="rounded-cards border-0 shadow-steep-sm p-5">
              <div className="text-xs text-graphite">门店总数</div>
              <div className="mt-1 text-[22px] leading-tight font-[480]">{data.stats.store_count}</div>
            </Card>
            <Card className="rounded-cards border-0 shadow-steep-sm p-5">
              <div className="text-xs text-graphite">合作中门店</div>
              <div className="mt-1 text-[22px] leading-tight font-[480]">
                {data.stats.cooperated_count}
              </div>
            </Card>
            <Card className="rounded-cards border-0 shadow-steep-sm p-5">
              <div className="text-xs text-graphite">经纪人总数</div>
              <div className="mt-1 text-[22px] leading-tight font-[480]">{data.stats.broker_count}</div>
            </Card>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <Card className="rounded-cards border-0 shadow-steep-sm max-h-[560px] overflow-auto p-3">
            {loading ? <div className="p-4 text-sm text-muted-foreground">加载中...</div> : null}
            {data?.points.map((point) => (
              <button
                key={point.id}
                type="button"
                data-point-id={point.id}
                className={`mb-2 w-full rounded-images p-3 text-left text-sm hover:bg-fog ${selectedId === point.id ? "bg-fog" : ""}`}
                onClick={() => focusPoint(point)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{point.store_name}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {/* 经纪人自建门店待审核，地图上必须可辨识（REQ-M09-002） */}
                    {point.review_status === "pending" ? <StatusBadge tone="attention">待审核</StatusBadge> : null}
                    {point.has_coordinate ? (
                      <StatusBadge tone={point.cooperation_status === "cooperated" ? "positive" : "neutral"}>
                        {point.cooperation_status_label}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="attention">坐标缺失</StatusBadge>
                    )}
                  </span>
                </div>
                <div className="mt-1 text-xs text-graphite">
                  {point.district} · {point.business_circle} · 经纪人 {point.broker_count}
                </div>
              </button>
            ))}
            {data && data.points.length === 0 ? <div className="p-4 text-sm text-graphite">没有符合条件的门店</div> : null}
          </Card>
          <Card className="rounded-cards border-0 shadow-steep-sm relative min-h-[420px] overflow-hidden p-0">
            {amapKey ? <div ref={mapContainer} className="h-[520px] w-full" /> : null}
            {amapKey === "" ? (
              <div className="flex h-[420px] items-center justify-center text-sm text-graphite">地图未配置</div>
            ) : null}
            {amapKey === null ? (
              <div className="flex h-[420px] items-center justify-center text-sm text-graphite">地图配置加载中…</div>
            ) : null}
            {amapKey && mapError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-fog text-sm text-graphite">
                <span>地图暂时无法显示</span>
                <span className="text-xs">左侧门店列表与上方统计不受影响</span>
              </div>
            ) : null}
          </Card>
        </div>
      </PageContainer>
    </div>
  );
}
