"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PageHeader } from "@/app/(main)/admin/_components/page-header";
import { StatusBadge } from "@/app/(main)/admin/merchant/_components/status-badge";
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
import { escapeHtml, tokenColor, type AMapInfoWindow, type AMapMap, type AMapMarker } from "../_components/amap";
import { merchantApi, queryString } from "../_components/merchant-api";

type TrackResponse = components["schemas"]["MerchantTrackResponse"];
type TrackItem = components["schemas"]["MerchantTrackItem"];
type UserSimple = components["schemas"]["UserSimpleResponse"];
type AmapConfig = components["schemas"]["AmapConfigResponse"];

/** 本地日期（不能用 toISOString：UTC 日界会让上海 00:00–08:00 取到前一天）。 */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function MerchantTracksPage() {
  const [users, setUsers] = useState<UserSimple[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [data, setData] = useState<TrackResponse | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  // 地图加载失败单独标记：错误横幅提示，地图区用占位层避免白屏
  const [mapError, setMapError] = useState(false);
  const [loading, setLoading] = useState(false);
  // 高德 Key 与安全密钥由后台「系统设置 → 高德地图」配置，按需读取（null=加载中）
  const [amapKey, setAmapKey] = useState<string | null>(null);
  const [amapSecurityCode, setAmapSecurityCode] = useState("");
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

  useEffect(() => {
    merchantApi<AmapConfig>("/admin/merchant/map/config")
      .then((config) => {
        setAmapKey(config.js_key || "");
        setAmapSecurityCode(config.security_js_code || "");
      })
      .catch(() => setAmapKey(""));
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
    if (!data || !amapKey || !containerRef.current) return;
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
      const points = data.items.filter((item) => item.has_coordinate);
      points.forEach((item, index) => {
        path.push([item.lng || 0, item.lat || 0]);
        // REQ-M10-002：起点用 Rust、终点用 Apricot Wash 标记，其余按序号
        const isFirst = index === 0;
        const isLast = index === points.length - 1 && points.length > 1;
        const background = isFirst
          ? "var(--color-rust)"
          : isLast
            ? "var(--color-apricot-edge)"
            : "var(--color-ink)";
        const color = isLast ? "var(--color-ink)" : "var(--color-pure-white)";
        const label = isFirst ? "起" : isLast ? "终" : String(index + 1);
        const marker = new window.AMap!.Marker({
          position: [item.lng || 0, item.lat || 0],
          content: `<div style="background:${background};color:${color};border-radius:999px;padding:3px 8px;font-size:12px">${label}</div>`,
        });
        marker.on("click", () => {
          setSelectedId(item.visit_id);
          infoRef.current?.setContent(
            `<div style="font-size:13px;line-height:1.6"><b>${escapeHtml(item.store_name)}</b><br/>${escapeHtml(new Date(item.visited_at).toLocaleString("zh-CN"))}<br/>联系人：${escapeHtml(item.contact_name)}</div>`,
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
            strokeColor: tokenColor("--color-rust", "#5d2a1a"),
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
      // 安全密钥必须在加载 JS API 脚本前设置，否则服务请求会返回 10008
      if (amapSecurityCode) {
        window._AMapSecurityConfig = { securityJsCode: amapSecurityCode };
      }
      const script = document.createElement("script");
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${amapKey}`;
      script.async = true;
      script.onload = () => {
        if (!window.AMap) {
          setError("高德地图加载失败（Key 无效或平台不是 Web 端 JS API），时间线仍可使用");
          setMapError(true);
          return;
        }
        render();
      };
      script.onerror = () => {
        setError("高德地图加载失败，时间线仍可使用");
        setMapError(true);
      };
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

        {amapKey === "" ? (
          <Card className="rounded-cards border-0 shadow-steep-sm p-5 text-sm text-graphite">
            未配置高德地图 Key，地图轨迹不可用；时间线与统计仍可正常使用。请前往
            <Link className="mx-1 text-rust hover:underline" href="/admin/settings/amap">
              系统设置 · 高德地图
            </Link>
            配置后刷新本页。
          </Card>
        ) : null}
        {error ? <Card className="rounded-cards border-0 shadow-steep-sm p-5 text-sm text-error">{error}</Card> : null}

        <Card className="rounded-cards border-0 shadow-steep-sm p-5">
          {/* Card 自带 flex-col：筛选控件必须放在内层横向容器，直接挂 flex-wrap 会纵向堆叠 */}
          <div className="flex flex-wrap items-end gap-3">
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="w-56" aria-label="选择员工">
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
            <label className="flex items-center gap-2 whitespace-nowrap text-[13px] text-graphite">
              开始日期
              <Input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 whitespace-nowrap text-[13px] text-graphite">
              结束日期
              <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            <Button onClick={() => void load()} disabled={loading}>
              {loading ? "查询中..." : "查询轨迹"}
            </Button>
          </div>
          {data ? (
            <div className="mt-3 text-sm text-graphite">
              拜访 {data.stats.visit_count} 次 · 到访 {data.stats.store_count} 家
            </div>
          ) : null}
          {/* REQ-M10-005：轨迹仅用于工作复盘，按最小必要展示；查看行为已写审计日志 */}
          <p className="mt-3 text-[13px] text-graphite">
            定位数据仅用于员工工作轨迹复盘，按最小必要展示；每次查看都会记录操作日志。
          </p>
        </Card>

        <div className="grid items-start gap-4 lg:grid-cols-[420px_1fr]">
          <Card className="rounded-cards border-0 shadow-steep-sm max-h-[560px] overflow-auto p-3">
            {data?.items.map((item, index) => (
              <div key={item.visit_id} className="mb-2">
                <button
                  type="button"
                  className={`w-full rounded-images p-3 text-left text-sm hover:bg-fog ${selectedId === item.visit_id ? "bg-fog" : ""}`}
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
                  {item.remark ? <div className="mt-1 line-clamp-2 text-xs text-graphite">{item.remark}</div> : null}
                  {(item.photos ?? []).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(item.photos ?? []).slice(0, 4).map((photo) => (
                        // 对象存储直链无固定尺寸，next/image 需远端白名单，故用原生 img
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={String(photo.file_url)}
                          src={String(photo.file_url)}
                          alt="拜访照片"
                          className="h-10 w-10 rounded-images border border-dove object-cover"
                        />
                      ))}
                    </div>
                  ) : null}
                  {!item.has_coordinate ? <StatusBadge tone="attention">无坐标</StatusBadge> : null}
                </button>
                <Link
                  href={`/admin/merchant/stores/${item.store_id}`}
                  className="mt-1 inline-block text-xs text-rust hover:underline"
                >
                  查看门店详情
                </Link>
              </div>
            ))}
            {data && data.items.length === 0 ? (
              <div className="p-4 text-sm text-graphite">该员工在所选日期内没有拜访记录</div>
            ) : null}
          </Card>
          <Card className="rounded-cards border-0 shadow-steep-sm relative min-h-[420px] overflow-hidden p-0">
            {amapKey ? <div ref={containerRef} className="h-[520px] w-full" /> : null}
            {amapKey === "" ? (
              <div className="flex h-[420px] items-center justify-center text-sm text-graphite">地图未配置</div>
            ) : null}
            {amapKey === null ? (
              <div className="flex h-[420px] items-center justify-center text-sm text-graphite">地图配置加载中…</div>
            ) : null}
            {amapKey && mapError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-fog text-sm text-graphite">
                <span>地图暂时无法显示</span>
                <span className="text-xs">左侧打卡点列表与上方统计不受影响</span>
              </div>
            ) : null}
          </Card>
        </div>
      </PageContainer>
    </div>
  );
}
