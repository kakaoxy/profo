"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import { Badge } from "@/components/ui/badge";
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
import type { AMapInfoWindow, AMapMap, AMapMarker } from "../_components/amap";
import { merchantApi, queryString } from "../_components/merchant-api";

type MapResponse = components["schemas"]["MerchantMapResponse"];
type MapPoint = components["schemas"]["MerchantMapPoint"];
type AmapConfig = components["schemas"]["AmapConfigResponse"];

const STATUS_COLORS: Record<string, string> = {
  not_cooperated: "#8b8c8d",
  negotiating: "#c98a4b",
  cooperated: "#2f7d5c",
  paused: "#5d6b8a",
  terminated: "#a3473a",
};

export default function MerchantMapPage() {
  const [data, setData] = useState<MapResponse | null>(null);
  const [district, setDistrict] = useState("");
  const [cooperation, setCooperation] = useState("all");
  const [review, setReview] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [mapError, setMapError] = useState("");
  const [loading, setLoading] = useState(true);
  // 高德 Key 由后台「系统设置 → 高德地图」配置，按需读取（null=加载中）
  const [amapKey, setAmapKey] = useState<string | null>(null);
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
      .then((config) => setAmapKey(config.js_key || ""))
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
              content: `<div style="background:#17191c;color:#fff;border-radius:999px;padding:4px 10px;font-size:12px">${key} ${points.length}</div>`,
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
                content: `<div style="width:12px;height:12px;border-radius:50%;background:${STATUS_COLORS[point.cooperation_status] || "#17191c"};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`,
              });
              marker.on("click", () => {
                setSelectedId(point.id);
                infoRef.current?.setContent(
                  `<div style="font-size:13px;line-height:1.6"><b>${point.store_name}</b><br/>${point.company_name}<br/>${point.district} · ${point.business_circle}<br/>经纪人 ${point.broker_count} · ${point.cooperation_status_label}</div>`,
                );
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
  }, [data, amapKey]);

  const focusPoint = (point: MapPoint) => {
    setSelectedId(point.id);
    if (point.has_coordinate && mapRef.current) {
      mapRef.current.setCenter([point.lng || 0, point.lat || 0], true);
      infoRef.current?.setContent(
        `<div style="font-size:13px;line-height:1.6"><b>${point.store_name}</b><br/>${point.company_name}<br/>${point.district} · ${point.business_circle}<br/>经纪人 ${point.broker_count}</div>`,
      );
      infoRef.current?.open(mapRef.current, [point.lng || 0, point.lat || 0]);
    }
  };

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader title="门店地图" description="区域门店分布、合作状态与经纪人数量" />

        {amapKey === "" ? (
          <Card className="p-4 text-sm text-graphite">
            未配置高德地图 Key，地图区域不可用；门店列表与统计仍可正常使用。
            请前往
            <Link className="mx-1 text-rust hover:underline" href="/admin/settings/amap">
              系统设置 · 高德地图
            </Link>
            配置后刷新本页。
          </Card>
        ) : null}
        {mapError ? <Card className="p-4 text-sm text-error">{mapError}</Card> : null}

        <Card className="flex flex-wrap gap-3 p-4">
          <Input className="w-44" placeholder="区县" value={district} onChange={(event) => setDistrict(event.target.value)} />
          <Select value={cooperation} onValueChange={setCooperation}>
            <SelectTrigger className="w-36">
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
            <SelectTrigger className="w-36">
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
        </Card>

        {data ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <div className="text-xs text-graphite">门店总数</div>
              <div className="text-2xl font-semibold">{data.stats.store_count}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-graphite">合作中门店</div>
              <div className="text-2xl font-semibold">{data.stats.cooperated_count}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-graphite">经纪人总数</div>
              <div className="text-2xl font-semibold">{data.stats.broker_count}</div>
            </Card>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <Card className="max-h-[560px] overflow-auto p-3">
            {loading ? <div className="p-4 text-sm text-muted-foreground">加载中...</div> : null}
            {data?.points.map((point) => (
              <button
                key={point.id}
                type="button"
                className={`mb-2 w-full rounded-lg p-3 text-left text-sm hover:bg-mist ${selectedId === point.id ? "bg-mist" : ""}`}
                onClick={() => focusPoint(point)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{point.store_name}</span>
                  <Badge variant={point.has_coordinate ? "secondary" : "destructive"}>
                    {point.has_coordinate ? point.cooperation_status_label : "坐标缺失"}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-graphite">
                  {point.district} · {point.business_circle} · 经纪人 {point.broker_count}
                </div>
              </button>
            ))}
            {data && data.points.length === 0 ? <div className="p-4 text-sm text-graphite">没有符合条件的门店</div> : null}
          </Card>
          <Card className="relative min-h-[420px] overflow-hidden p-0">
            {amapKey ? <div ref={mapContainer} className="h-[520px] w-full" /> : null}
            {amapKey === "" ? (
              <div className="flex h-[420px] items-center justify-center text-sm text-graphite">地图未配置</div>
            ) : null}
            {amapKey === null ? (
              <div className="flex h-[420px] items-center justify-center text-sm text-graphite">地图配置加载中…</div>
            ) : null}
          </Card>
        </div>
      </PageContainer>
    </div>
  );
}
