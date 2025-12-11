"use client";

import { ColumnDef } from "@tanstack/react-table";
import { components } from "@/lib/api-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, ImageIcon, ArrowUp, ArrowDown } from "lucide-react";
import { useQueryState } from "nuqs";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type Property = components["schemas"]["PropertyResponse"];

// --- 1. 移植过来的户型图取数逻辑 ---
const getFloorPlan = (dataSource: string | null | undefined, links: string[] | null | undefined): string | null => {
  // 如果没有图片链接，返回 null (渲染时会显示占位图)
  if (!links || links.length === 0) {
    return null;
  }

  const source = dataSource || "";
  let imageUrl: string | undefined;

  // 根据数据源选择户型图
  if (source === '贝壳') {
    // 贝壳：优先取包含 'hdic-frame' 的图片链接
    const hdicFrameImage = links.find(link =>
      link.toLowerCase().includes('hdic-frame')
    );
    // 优先级：hdic-frame -> 第3张 -> 第1张
    // 注意：JS数组越界访问返回 undefined，不会报错，逻辑是安全的
    imageUrl = hdicFrameImage || links[2] || links[0];
    
    // 添加 CDN 裁剪参数
    if (imageUrl && !imageUrl.includes('!m_fill')) {
      imageUrl += '!m_fill,w_1000,h_750,l_bk,f_jpg,ls_50';
    }
  } else if (source === '我爱我家') {
    // 我爱我家：优先取包含 'floorPlan' 或 'layout' 的图片链接
    const floorPlanImage = links.find(link =>
      link.toLowerCase().includes('floorplan') || link.toLowerCase().includes('layout')
    );
    // 优先级：匹配到的 -> 最后一张
    imageUrl = floorPlanImage || links[links.length - 1];
  } else {
    // 其他来源：默认显示第一张图
    imageUrl = links[0];
  }

  return imageUrl || null;
};

// --- 2. 通用排序表头组件 ---
const SortableHeader = ({ title, value }: { title: string; value: string }) => {
  const [sortBy, setSortBy] = useQueryState("sort_by", { shallow: false });
  const [sortOrder, setSortOrder] = useQueryState("sort_order", { shallow: false });

  const isSorted = sortBy === value;
  const isAsc = sortOrder === "asc";

  const toggleSort = () => {
    if (isSorted) {
      setSortOrder(isAsc ? "desc" : "asc");
    } else {
      setSortBy(value);
      setSortOrder("desc");
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 data-[state=open]:bg-accent"
      onClick={toggleSort}
    >
      <span>{title}</span>
      {isSorted ? (
        isAsc ? <ArrowUp className="ml-2 h-3.5 w-3.5" /> : <ArrowDown className="ml-2 h-3.5 w-3.5" />
      ) : (
        <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground/70" />
      )}
    </Button>
  );
};

const ActionCell = ({ id }: { id: number }) => {
  // 使用 nuqs 的 hook
  const [, setPropertyId] = useQueryState("propertyId", { shallow: false });

  return (
    <Button
      variant="link"
      size="sm"
      className="text-primary p-0 h-auto"
      onClick={(e) => {
        e.stopPropagation();
        // 设置 ID，这会触发 Sheet 打开
        setPropertyId(String(id));
      }}
    >
      查看
    </Button>
  );
};

export const columns: ColumnDef<Property>[] = [
  // 1. 房源ID
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">#{row.getValue("id")}</span>,
    size: 60,
  },
  // 2. 户型图 (应用新逻辑)
  {
    id: "image",
    header: "户型图",
    cell: ({ row }) => {
      // 调用辅助函数获取图片URL
      const cover = getFloorPlan(row.original.data_source, row.original.picture_links);

      // 如果没图，显示占位符 (保持不变)
      if (!cover) {
        return (
          <div className="w-12 h-9 bg-slate-100 rounded border flex items-center justify-center text-slate-400">
            <ImageIcon className="h-4 w-4" />
          </div>
        );
      }

      // 有图，使用 HoverCard 包裹
      return (
        // openDelay: 鼠标放上去多少毫秒后显示，避免快速划过时闪烁
        <HoverCard openDelay={200} closeDelay={100}>
          {/* 触发区：原来的小图 */}
          <HoverCardTrigger asChild>
            <div className="relative w-12 h-9 rounded overflow-hidden border bg-slate-100 cursor-zoom-in group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cover}
                alt="户型图缩略"
                className="w-full h-full object-cover transition-opacity group-hover:opacity-80"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
            </div>
          </HoverCardTrigger>

          {/* 弹出区：大图预览卡片 */}
          <HoverCardContent
            // w-[400px]: 设置大图卡片的宽度
            // z-50: 确保浮在表格上方
            className="w-[400px] p-2 bg-white z-50 shadow-lg"
            // side="bottom" align="start": 优先显示在触发元素的下方左侧
            side="bottom"
            align="start"
            // sideOffset: 与触发元素保持一点距离
            sideOffset={10}
            // Radix UI 会自动处理碰撞：如果下方空间不足，它会自动翻转显示到上方
          >
            <div className="rounded overflow-hidden bg-slate-50 border aspect-[4/3] flex items-center justify-center relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cover}
                alt="户型图大图预览"
                // object-contain: 保证图片完整显示，不被裁切
                className="object-contain w-full h-full"
                referrerPolicy="no-referrer"
              />
            </div>
            {/* 底部附加信息 */}
            <p className="text-xs text-muted-foreground mt-2 text-center">
              数据来源: {row.original.data_source || "未知"}
            </p>
          </HoverCardContent>
        </HoverCard>
      );
    },
    size: 70,
  },
  // 3. 小区
  {
    accessorKey: "community_name",
    header: "小区",
    cell: ({ row }) => {
      const name = row.getValue("community_name") as string;
      return (
        <TooltipProvider>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              {/* max-w-[5em]: 限制最大宽度大约为5个字符宽
                 truncate: 超出部分显示省略号 (...)
                 cursor-help: 鼠标放上去显示问号/帮助手势
              */}
              <div className="font-medium truncate max-w-[7em] cursor-help">
                {name}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{name}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
  },
  // 4. 状态
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <Badge variant={status === "在售" ? "default" : status === "成交" ? "secondary" : "outline"}>
          {status}
        </Badge>
      );
    },
  },
  // 5. 商圈
  {
    accessorKey: "business_circle",
    header: "商圈",
    cell: ({ row }) => {
      const val = row.getValue("business_circle") as string;
      return <span className="text-sm text-muted-foreground">{val || "-"}</span>;
    },
  },
  // 6. 户型
  {
    id: "layout_custom",
    header: "户型",
    cell: ({ row }) => {
      const { rooms, baths } = row.original;
      return <span className="whitespace-nowrap">{rooms}室{baths}卫</span>;
    },
  },
  // 7. 朝向
  {
    accessorKey: "orientation",
    header: "朝向",
  },
  // 8. 楼层
  {
    accessorKey: "floor_display",
    header: "楼层",
    cell: ({ row }) => <span className="whitespace-nowrap">{row.getValue("floor_display")}</span>,
  },
  // 9. 面积
  {
    accessorKey: "build_area",
    header: () => <SortableHeader title="面积(㎡)" value="build_area" />,
    cell: ({ row }) => <div>{row.getValue("build_area")}</div>,
  },
  // 10. 总价
  {
    accessorKey: "total_price",
    header: () => <SortableHeader title="总价(万)" value="total_price" />,
    cell: ({ row }) => <div className="text-red-600 font-bold">{row.getValue("total_price")}</div>,
  },
  // 11. 单价
  {
    accessorKey: "unit_price",
    header: () => <SortableHeader title="单价(元/㎡)" value="unit_price" />,
    cell: ({ row }) => <div className="text-xs text-muted-foreground">{row.getValue("unit_price")}</div>,
  },
  // 12. 时间
  {
    id: "time_display",
    accessorKey: "listed_date",
    header: () => <SortableHeader title="挂牌/成交时间" value="listed_date" />,
    cell: ({ row }) => {
      const status = row.original.status;
      let dateStr: string | null | undefined;
      let label = "";

      if (status === "成交") {
        dateStr = row.original.sold_date;
        label = "成交";
      } else {
        dateStr = row.original.listed_date;
        label = "挂牌";
      }

      if (!dateStr) return <span className="text-muted-foreground">-</span>;
      
      return (
        <div className="flex flex-col">
          <span className="text-xs font-medium">{new Date(dateStr).toLocaleDateString()}</span>
          <span className="text-[10px] text-muted-foreground scale-90 origin-left">({label})</span>
        </div>
      );
    },
  },
  // 13. 数据源
  {
    accessorKey: "data_source",
    header: () => <SortableHeader title="数据源" value="data_source" />,
    cell: ({ row }) => <Badge variant="outline" className="text-[10px]">{row.getValue("data_source")}</Badge>,
  },
  // 14. 操作
  // 14. 操作
  {
    id: "actions",
    header: "操作",
    cell: ({ row }) => <ActionCell id={row.original.id} />,
  },
];