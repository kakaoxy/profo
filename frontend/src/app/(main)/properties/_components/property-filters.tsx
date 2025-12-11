"use client";

import { useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { X, Search, RotateCcw } from "lucide-react";

export function PropertyFilters() {
  // 核心修复：添加 shallow: false，强制触发服务端组件重新渲染(发起请求)
  const [status, setStatus] = useQueryState("status", { defaultValue: "", shallow: false });
  const [q, setQ] = useQueryState("q", { defaultValue: "", throttleMs: 500, shallow: false });
  const [rooms, setRooms] = useQueryState("rooms", { defaultValue: "", shallow: false });
  const [floors, setFloors] = useQueryState("floor_levels", { defaultValue: "", shallow: false });
  
  // 价格和面积范围也需要触发请求
  const [minPrice, setMinPrice] = useQueryState("min_price", { shallow: false });
  const [maxPrice, setMaxPrice] = useQueryState("max_price", { shallow: false });
  const [minArea, setMinArea] = useQueryState("min_area", { shallow: false });
  const [maxArea, setMaxArea] = useQueryState("max_area", { shallow: false });

  const [districts, setDistricts] = useQueryState("districts", { defaultValue: "", shallow: false });

  // 辅助函数：通用的多选切换逻辑 (逗号分隔字符串)
  const toggleSelection = (currentValue: string | null, valueToToggle: string, setter: (val: string | null) => void) => {
    const current = currentValue ? currentValue.split(",") : [];
    if (current.includes(valueToToggle)) {
      // 如果已存在，则移除
      const newValue = current.filter((r) => r !== valueToToggle).join(",");
      setter(newValue || null);
    } else {
      // 如果不存在，则添加
      setter([...current, valueToToggle].join(","));
    }
  };

  const handleReset = () => {
    setStatus(null);
    setQ(null);
    setRooms(null);
    setFloors(null);
    setMinPrice(null);
    setMaxPrice(null);
    setMinArea(null);
    setMaxArea(null);
    setDistricts(null);
  };

  return (
    <Card className="h-full border-none shadow-none bg-transparent p-0">
      <CardHeader className="px-0 pt-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold">筛选条件</CardTitle>
          <Button variant="ghost" size="sm" onClick={handleReset} className="h-8 px-2 text-muted-foreground hover:text-primary">
            <RotateCcw className="mr-1 h-3 w-3" />
            重置
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0 space-y-6">
        
        {/* 1. 状态 */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">房源状态</Label>
          <div className="flex gap-2">
            {["", "在售", "成交"].map((s) => (
              <Button
                key={s}
                variant={status === s ? "default" : "outline"}
                size="sm"
                className="flex-1 h-8 text-xs"
                onClick={() => setStatus(s || null)}
              >
                {s || "全部"}
              </Button>
            ))}
          </div>
        </div>

        {/* 2. 小区搜索 */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">小区名称</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="搜索小区..." 
              className="pl-8 h-8 text-sm" 
              value={q || ""} 
              onChange={(e) => setQ(e.target.value || null)} 
            />
          </div>
        </div>

        {/* 3. 户型 (多选) */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">户型 (室)</Label>
          <div className="flex flex-wrap gap-1.5">
            {["1", "2", "3", "4", "5", "5+"].map((r) => (
              <Button
                key={r}
                variant={rooms?.split(",").includes(r) ? "default" : "outline"}
                size="sm"
                className="w-9 h-8 p-0 text-xs"
                onClick={() => toggleSelection(rooms, r, setRooms)}
              >
                {r}
              </Button>
            ))}
          </div>
        </div>

        {/* 4. 楼层 (修复为多选) */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">楼层</Label>
          <div className="flex flex-wrap gap-1.5">
            {["低楼层", "中楼层", "高楼层"].map((f) => (
              <Button
                key={f}
                // 这里修复了判断逻辑，支持多选样式高亮
                variant={floors?.split(",").includes(f) ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs px-2"
                onClick={() => toggleSelection(floors, f, setFloors)}
              >
                {f}
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        {/* 5. 价格范围 */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">价格范围 (万)</Label>
          <div className="flex items-center gap-2">
            <Input 
              type="number" 
              placeholder="最低" 
              className="h-8 text-xs"
              value={minPrice || ""} 
              onChange={e => setMinPrice(e.target.value || null)}
            />
            <span className="text-muted-foreground">-</span>
            <Input 
              type="number" 
              placeholder="最高" 
              className="h-8 text-xs"
              value={maxPrice || ""} 
              onChange={e => setMaxPrice(e.target.value || null)}
            />
          </div>
        </div>

        {/* 6. 面积范围 */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">面积范围 (㎡)</Label>
          <div className="flex items-center gap-2">
            <Input 
              type="number" 
              placeholder="最小" 
              className="h-8 text-xs"
              value={minArea || ""} 
              onChange={e => setMinArea(e.target.value || null)}
            />
            <span className="text-muted-foreground">-</span>
            <Input 
              type="number" 
              placeholder="最大" 
              className="h-8 text-xs"
              value={maxArea || ""} 
              onChange={e => setMaxArea(e.target.value || null)}
            />
          </div>
        </div>
        
        {/* 7. 区域展示 */}
        {districts && (
            <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">已选区域</Label>
                <div className="flex flex-wrap gap-1">
                    {districts.split(",").map(d => (
                        <Badge key={d} variant="secondary" className="cursor-pointer hover:bg-destructive hover:text-white" onClick={() => {
                            toggleSelection(districts, d, setDistricts);
                        }}>
                            {d} <X className="ml-1 h-3 w-3"/>
                        </Badge>
                    ))}
                </div>
            </div>
        )}

      </CardContent>
    </Card>
  );
}