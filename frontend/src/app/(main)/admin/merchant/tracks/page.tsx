"use client";

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

type TrackResponse = components["schemas"]["MerchantTrackResponse"];
type TrackItem = components["schemas"]["MerchantTrackItem"];
type UserSimple = components["schemas"]["UserSimpleResponse"];

const AMAP_KEY = process.env.NEXT_PUBLIC_AMAP_KEY;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function MerchantTracksPage() {
  const [users, setUsers] = useState<UserSimple[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [data, setData] = useState<TrackResponse | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const mapRef = useRef<AMapMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<Map<string, AMapMarker>>(new Map());
  const infoRef = useRef<AMapInfoWindow | null>(null);

  useEffect(() => {
    merchantApi<components["schemas"]["UserSimpleListResponse"]>("/users/simple?page=1&page_size=200")
      .then((result) => {
        setUsers(result.items);
        if (result.items.length) setEmployeeId(result.items[0].id);
      })
      .catch(() => setUsers([]));
  }, []);

  const load = async () => {
    if (!employeeId) {
      setError("请选择员工");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await merchantApi<TrackResponse>(
        `/admin/merchant/tracks${queryString({ employee_id: employeeId, start_date: startDate, end_date: endDate })}`,
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (users.length && !data) {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

  useEffect(() => {
    if (!data || !AMAP_KEY || !containerRef.current) return;
    let disposed = false;
    const render = () => {
      if (disposed || !containerRef.current || !window.AMap) return;
      const map = new window.AMap.Map(containerRef.current, {
        zoom: 13,
        center: [121.4737, 31.2304],
        resizeEnable: true,
      });
      mapRef.current = map;
      infoRef.current = new window.AMap.InfoWindow({ offset: [0, -16] });
      markersRef.current.clear();
      const path: [number, number][] = [];
      data.items.forEach((item) => {
        if (!item.has_coordinate) return;
        path.push([item.lng || 0, item.lat || 0]);
        const marker = new window.AMap!.Marker({
          position: [item.lng || 0, item.lat || 0],
          content: `<div style="background:#17191c;color:#fff;border-radius:999px;padding:3px 8px;font-size:12px">${path.length}</div>`,
        });
        marker.on("click", () => {
          setSelectedId(item.visit_id);
          infoRef.current?.setContent(
            `<div style="font-size:13px;line-height:1.6"><b>${item.store_name}</b><br/>${new Date(item.visited_at).toLocaleString("zh-CN")}<br/>联系人：${item.contact_name}</div>`,
          );
          infoRef.current?.open(map, [item.lng || 0, item.lat || 0]);
        });
        map.add(marker);
        markersRef.current.set(item.visit_id, marker);
      });
      if (path.length > 1) {
        map.add(
          new window.AMap!.Polyline({
            path,
            strokeColor: "#5d2a1a",
            strokeWeight: 4,
            strokeOpacity: 0.8,
          }),
        );
      }
      if (path.length) {
        map.setFitView([...markersRef.current.values()]);
      }
    };
    if (window.AMap) {
      render();
    } else {
      const script = document.createElement("script");
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}`;
      script.async = true;
      script.onload = render;
      script.onerror = () => setError("高德地图加载失败，时间线仍可使用");
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
  }, [data]);

  const focus = (item: TrackItem) => {
    setSelectedId(item.visit_id);
    if (item.has_coordinate && mapRef.current) {
      mapRef.current.setCenter([item.lng || 0, item.lat || 0], true);
    }
  };

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader title="拜访轨迹" description="按员工与日期查看到店打卡点顺序连线；不采集连续 GPS" />

        {!AMAP_KEY ? (
          <Card className="p-4 text-sm text-graphite">
            未配置 NEXT_PUBLIC_AMAP_KEY，地图轨迹不可用；时间线与统计仍可正常使用。
          </Card>
        ) : null}
        {error ? <Card className="p-4 text-sm text-error">{error}</Card> : null}

        <Card className="flex flex-wrap items-end gap-3 p-4">
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="选择员工" />
            </SelectTrigger>
            <SelectContent>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.nickname || user.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          <Button onClick={() => void load()} disabled={loading}>
            {loading ? "查询中..." : "查询轨迹"}
          </Button>
          {data ? (
            <span className="text-sm text-graphite">
              拜访 {data.stats.visit_count} 次 · 到访 {data.stats.store_count} 家
            </span>
          ) : null}
        </Card>

        <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
          <Card className="max-h-[560px] overflow-auto p-3">
            {data?.items.map((item, index) => (
              <button
                key={item.visit_id}
                type="button"
                className={`mb-2 w-full rounded-lg p-3 text-left text-sm hover:bg-mist ${selectedId === item.visit_id ? "bg-mist" : ""}`}
                onClick={() => focus(item)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {index + 1}. {item.store_name}
                  </span>
                  <span className="text-xs text-graphite">{new Date(item.visited_at).toLocaleTimeString("zh-CN")}</span>
                </div>
                <div className="mt-1 text-xs text-graphite">
                  联系人：{item.contact_name}
                  {item.result ? ` · 结果：${item.result}` : ""}
                </div>
                {!item.has_coordinate ? <Badge variant="destructive">无坐标</Badge> : null}
              </button>
            ))}
            {data && data.items.length === 0 ? (
              <div className="p-4 text-sm text-graphite">该员工在所选日期内没有拜访记录</div>
            ) : null}
          </Card>
          <Card className="min-h-[420px] overflow-hidden p-0">
            {AMAP_KEY ? <div ref={containerRef} className="h-[520px] w-full" /> : null}
            {!AMAP_KEY ? (
              <div className="flex h-[420px] items-center justify-center text-sm text-graphite">地图未配置</div>
            ) : null}
          </Card>
        </div>
      </PageContainer>
    </div>
  );
}
