"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator"; // 补上这个引用
import { Building, TrendingUp, Users, AlertCircle, Home, LucideIcon } from "lucide-react";

// 定义线索数据的接口
interface Lead {
  id: number;
  community: string;
  layout: string;
  area: number;
  price: number;
  unit: number;
  floor: string;
  orientation: string;
  time: string;
  status: string;
}

// 模拟数据
const leadsData: Lead[] = [
  { id: 1, community: "中海紫御", layout: "3室2厅", area: 128, price: 850, unit: 6.64, floor: "高层", orientation: "南", time: "10分钟前", status: "待处理" },
  { id: 2, community: "华润城润府", layout: "2室1厅", area: 89, price: 1100, unit: 12.3, floor: "中层", orientation: "东南", time: "25分钟前", status: "待处理" },
  { id: 3, community: "阳光城", layout: "4室2厅", area: 145, price: 980, unit: 6.75, floor: "低层", orientation: "南北", time: "1小时前", status: "已跟进" },
];

export default function DashboardPage() {
  // 这里的 <Lead | null> 明确告诉 TS，选中的要么是 Lead 类型，要么是 null
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* 1. 顶部四个核心指标卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="房源总数" value="2,350" sub="+180 本月" icon={Building} />
        <StatCard title="新增线索" value="+12" sub="今日新增" icon={AlertCircle} highlight />
        <StatCard title="本月签约" value="48" sub="↑ 12% 环比" icon={TrendingUp} />
        <StatCard title="待处理事项" value="7" sub="需紧急关注" icon={Users} warning />
      </div>

      {/* 2. 中间功能区块 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">房源评估概览</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
               <div className="text-2xl font-bold">17 <span className="text-sm font-normal text-muted-foreground">待评估</span></div>
               <div className="text-2xl font-bold">22 <span className="text-sm font-normal text-muted-foreground">已完成</span></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">数据监控</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="flex items-end justify-between">
               <div className="text-2xl font-bold text-red-500">5 <span className="text-sm font-normal text-muted-foreground">价格异常</span></div>
               <div className="text-2xl font-bold">120 <span className="text-sm font-normal text-muted-foreground">正常监控</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. 底部线索表格 */}
      <Card className="flex-1">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>待处理线索</CardTitle>
          <Button size="sm">全部线索</Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>小区</TableHead>
                <TableHead>户型</TableHead>
                <TableHead>面积(㎡)</TableHead>
                <TableHead>朝向</TableHead>
                <TableHead>楼层</TableHead>
                <TableHead>总价(万)</TableHead>
                <TableHead>时间</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leadsData.map((item) => (
                <TableRow 
                  key={item.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedLead(item)}
                >
                  <TableCell className="font-medium">{item.community}</TableCell>
                  <TableCell>{item.layout}</TableCell>
                  <TableCell>{item.area}</TableCell>
                  <TableCell>{item.orientation}</TableCell>
                  <TableCell>{item.floor}</TableCell>
                  <TableCell className="text-red-600 font-bold">¥ {item.price}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{item.time}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={(e) => {
                        e.stopPropagation(); 
                        setSelectedLead(item);
                    }}>查看</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 4. 右侧详情抽屉 */}
      <Sheet open={!!selectedLead} onOpenChange={(open) => !open && setSelectedLead(null)}>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>房源线索详情</SheetTitle>
            <SheetDescription>
              ID: {selectedLead?.id} | 来源: 自动采集
            </SheetDescription>
          </SheetHeader>

          {selectedLead && (
            <div className="space-y-6">
              <div className="aspect-video w-full rounded-lg bg-slate-100 flex items-center justify-center border border-dashed">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Home className="w-5 h-5"/> 户型图预览
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="小区名称" value={selectedLead.community} />
                <InfoItem label="挂牌总价" value={`${selectedLead.price} 万`} active />
                <InfoItem label="户型结构" value={selectedLead.layout} />
                <InfoItem label="建筑面积" value={`${selectedLead.area} ㎡`} />
                <InfoItem label="单价" value={`${selectedLead.unit} 万/㎡`} />
                <InfoItem label="楼层" value={selectedLead.floor} />
                <InfoItem label="朝向" value={selectedLead.orientation} />
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium">处理建议</h4>
                <div className="grid grid-cols-2 gap-4">
                    <Button className="w-full" size="lg">🔍 立即评估</Button>
                    <Button variant="outline" className="w-full" size="lg">🗑️ 放弃线索</Button>
                </div>
              </div>
              
              <SheetFooter className="mt-10 sm:justify-start">
                 <div className="text-xs text-muted-foreground w-full text-center">
                    跟进人: 当前管理员 | 创建时间: {selectedLead.time}
                 </div>
              </SheetFooter>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// 定义 StatCard 组件属性类型
interface StatCardProps {
  title: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  highlight?: boolean;
  warning?: boolean;
}

function StatCard({ title, value, sub, icon: Icon, highlight, warning }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${highlight ? "text-blue-500" : warning ? "text-red-500" : "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

// 定义 InfoItem 组件属性类型
interface InfoItemProps {
  label: string;
  value: string | number;
  active?: boolean;
}

function InfoItem({ label, value, active }: InfoItemProps) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className={`text-sm font-medium ${active ? "text-red-600 text-lg" : ""}`}>{value}</span>
        </div>
    )
}