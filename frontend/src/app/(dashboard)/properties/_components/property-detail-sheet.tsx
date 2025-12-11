"use client";

import { useEffect, useState } from "react";
import { useQueryState } from "nuqs";
import { components } from "@/lib/api-types";
import { getPropertyDetailAction } from "../actions";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Home, Calendar, Tag, Layers, LucideIcon } from "lucide-react";

// 获取详情接口的返回类型
type PropertyDetail = components["schemas"]["PropertyDetailResponse"];

// 定义 Field 组件的 Props 类型，解决 'any' 报错
interface FieldProps {
  label: string;
  value: string | number | null | undefined;
  icon?: LucideIcon;
  full?: boolean;
}

export function PropertyDetailSheet() {
  // 1. 监听 URL 中的 propertyId
  const [propertyId, setPropertyId] = useQueryState("propertyId", { shallow: true });
  
  const [data, setData] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isOpen = !!propertyId;

  // 2. 当 ID 变化时，请求接口
  useEffect(() => {
    if (!propertyId) {
      setData(null);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      setError("");
      try {
        // ❌ 删除原来的 fetchClient 调用
        // const client = await fetchClient();
        // const { data: detail, error: apiError } = await client.GET(...)
        
        // ✅ 改为调用 Server Action
        const detail = await getPropertyDetailAction(parseInt(propertyId));

        setData(detail);
      } catch (err) {
        console.error(err);
        setError("无法加载房源数据，请稍后重试。");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [propertyId]);

  // 关闭抽屉时，清空 URL 参数
  const handleClose = (open: boolean) => {
    if (!open) {
      setPropertyId(null);
    }
  };

  // 辅助渲染函数：显示字段
  const Field = ({ label, value, icon: Icon, full = false }: FieldProps) => (
    <div className={`flex flex-col gap-1 ${full ? "col-span-2" : ""}`}>
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </span>
      <span className="text-sm font-medium break-words">
        {value === null || value === undefined || value === "" ? "-" : value}
      </span>
    </div>
  );

  // 价格显示逻辑：如果有成交价显示成交价，否则显示挂牌价
  const displayPrice = data?.sold_price_wan || data?.listed_price_wan || 0;

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent className="w-[400px] sm:w-[600px] p-0 flex flex-col gap-0 bg-background">
        
        {/* 头部：标题与状态 */}
        <SheetHeader className="p-6 bg-white border-b shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline">{data?.data_source || "数据源"}</Badge>
            {data?.status && (
              <Badge variant={data.status === "在售" ? "default" : "secondary"}>
                {data.status}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">ID: {propertyId}</span>
          </div>
          <SheetTitle className="text-xl leading-snug">
            {loading ? "加载中..." : data?.community_name || "房源详情"}
          </SheetTitle>
          <SheetDescription>
            {/* 修复：删除了不存在的 address 字段 */}
            {data?.district} {data?.business_circle ? `· ${data.business_circle}` : ""} 
          </SheetDescription>
        </SheetHeader>

        {/* 内容区域：可滚动 */}
        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-8">
            
            {loading && (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 text-red-600 rounded-md text-sm">
                {error}
              </div>
            )}

            {data && !loading && (
              <>
                {/* 1. 核心价格与面积 */}
                <div className="grid grid-cols-3 gap-4 bg-white p-4 rounded-lg border shadow-sm">
                  <div className="text-center border-r">
                    <div className="text-xs text-muted-foreground mb-1">
                        {data.status === "成交" ? "成交总价" : "挂牌总价"}
                    </div>
                    {/* 修复：使用 listed_price_wan 或 sold_price_wan */}
                    <div className="text-xl font-bold text-red-600">
                      {displayPrice} <span className="text-xs font-normal text-muted-foreground">万</span>
                    </div>
                  </div>
                  <div className="text-center border-r">
                    <div className="text-xs text-muted-foreground mb-1">单价</div>
                    <div className="text-lg font-semibold">{data.unit_price} <span className="text-xs font-normal text-muted-foreground"></span></div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground mb-1">建筑面积</div>
                    <div className="text-lg font-semibold">{data.build_area} <span className="text-xs font-normal text-muted-foreground">㎡</span></div>
                  </div>
                </div>

                 {/* 4. 图片预览 (如果有链接) */}
                 {data.picture_links && data.picture_links.length > 0 && (
                   <div>
                      <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-slate-800">
                        <Layers className="w-4 h-4" /> 图片预览
                      </h3>
                      <div className="grid grid-cols-3 gap-2">
                        {data.picture_links.slice(0, 6).map((link, idx) => (
                           // eslint-disable-next-line @next/next/no-img-element
                           <img 
                              key={idx} 
                              src={link} 
                              alt={`图${idx}`} 
                              className="w-full aspect-[4/3] object-cover rounded border bg-slate-200" 
                              loading="lazy"
                              referrerPolicy="no-referrer"
                           />
                        ))}
                      </div>
                   </div>
                 )}

                {/* 2. 基础信息 */}
                <div>
                  <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-slate-800">
                    <Home className="w-4 h-4" /> 基础属性
                  </h3>
                  <div className="grid grid-cols-2 gap-y-4 gap-x-8 bg-white p-4 rounded-lg border">
                    <Field label="户型结构" value={data.layout_display} />
                    <Field label="所在楼层" value={data.floor_display} />
                    <Field label="房屋朝向" value={data.orientation} />
                    <Field label="建筑年代" value={data.build_year ? `${data.build_year}年` : ""} />
                    <Field label="装修情况" value={data.decoration} />
                    <Field label="配备电梯" value={data.elevator ? "有" : "无"} />
                    <Field label="房屋用途" value={data.property_type} />
                    <Field label="建筑结构" value={data.building_structure} />
                  </div>
                </div>

                {/* 3. 交易属性 */}
                <div>
                  <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-slate-800">
                    <Tag className="w-4 h-4" /> 交易属性
                  </h3>
                  <div className="grid grid-cols-2 gap-y-4 gap-x-8 bg-white p-4 rounded-lg border">
                    <Field label="挂牌时间" value={data.listed_date?.split("T")[0]} icon={Calendar} />
                    <Field label="上次交易" value={data.last_transaction?.split("T")[0]} />
                    <Field label="持有年限" value={data.ownership_years ? `满${data.ownership_years}年` : ""} />
                    <Field label="交易权属" value={data.ownership_type} />
                    <Field label="挂牌备注" value={data.listing_remarks} full />
                  </div>
                </div>

                

              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}