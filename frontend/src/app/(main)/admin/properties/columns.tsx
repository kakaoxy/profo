"use client";

import { memo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import Image from "next/image";
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
import { isValidUrl } from "@/lib/validators";
import { DEFAULT_SORT_BY, DEFAULT_SORT_ORDER } from "./search-params";

export type Property = components["schemas"]["PropertyResponse"];

// --- 1. 户型图取数逻辑 ---
// 优化点：单次循环缓存 toLowerCase 结果，避免重复调用；合并两次 find 为一次遍历
// 规则: js-cache-property-access / js-combine-iterations
// 导出以便单元测试验证等价性（不改变业务逻辑）
export const getFloorPlan = (
  dataSource: string | null | undefined,
  links: string[] | null | undefined,
): string | null => {
  // 过滤脏数据（如 "q_80"），只保留合法 URL
  const validLinks = links?.filter(isValidUrl);
  if (!validLinks || validLinks.length === 0) {
    return null;
  }

  const source = dataSource || "";
  let hdicFrameImage: string | undefined;
  let floorPlanImage: string | undefined;

  // 单次循环：同时匹配 hdic-frame 与 floorplan/layout，缓存 toLowerCase 结果
  for (const link of validLinks) {
    const lower = link.toLowerCase();
    if (!hdicFrameImage && lower.includes("hdic-frame")) {
      hdicFrameImage = link;
    }
    if (
      !floorPlanImage &&
      (lower.includes("floorplan") || lower.includes("layout"))
    ) {
      floorPlanImage = link;
    }
    if (hdicFrameImage && floorPlanImage) break;
  }

  let imageUrl: string | undefined;

  // 根据数据源选择户型图
  if (source === "贝壳") {
    // 优先级：hdic-frame -> 第3张 -> 第1张
    // 注意：JS数组越界访问返回 undefined，不会报错，逻辑是安全的
    imageUrl = hdicFrameImage || validLinks[2] || validLinks[0];

    // 添加 CDN 裁剪参数
    if (imageUrl && !imageUrl.includes("!m_fill")) {
      imageUrl += "!m_fill,w_1000,h_750,l_bk,f_jpg,ls_50";
    }
  } else if (source === "我爱我家") {
    // 优先级：匹配到的 -> 最后一张
    imageUrl = floorPlanImage || validLinks[validLinks.length - 1];
  } else {
    // 其他来源：默认显示第一张图
    imageUrl = validLinks[0];
  }

  return imageUrl || null;
};

// --- 2. 通用排序表头组件 ---
// 注意：内部订阅 useQueryState，排序变化时必然重渲染，memo 无效，故不加
const SortableHeader = ({ title, value }: { title: string; value: string }) => {
  const [sortBy, setSortBy] = useQueryState("sort_by", {
    shallow: false,
    defaultValue: DEFAULT_SORT_BY,
  });
  const [sortOrder, setSortOrder] = useQueryState("sort_order", {
    shallow: false,
    defaultValue: DEFAULT_SORT_ORDER,
  });

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
        isAsc ? (
          <ArrowUp className="ml-2 h-3.5 w-3.5" />
        ) : (
          <ArrowDown className="ml-2 h-3.5 w-3.5" />
        )
      ) : (
        <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground/70" />
      )}
    </Button>
  );
};

const ActionCell = ({ id }: { id: number }) => {
  // 使用 nuqs 的 hook
  // 注意：内部订阅 useQueryState(propertyId)，propertyId 变化时必然重渲染，memo 无效
  const [, setPropertyId] = useQueryState("propertyId", { shallow: true });

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

// FloorPlanPreview 包含 Image + HoverCard，且不订阅 URL state。
// 当表格因 propertyId/sort 变化重渲染时，memo 可避免 50 行图片组件重渲染。
// 规则: rerender-memo（仅对 expensive 组件加 memo）
const FloorPlanPreviewImpl = ({
  cover,
  dataSource,
}: {
  cover: string;
  dataSource: string | null | undefined;
}) => {
  const [open, setOpen] = useState(false);

  // 防御性校验：无效 URL 时显示占位图，避免 next/image 崩溃
  if (!isValidUrl(cover)) {
    return (
      <div className="w-10 h-8 sm:w-12 sm:h-9 bg-muted rounded border flex items-center justify-center text-muted-foreground">
        <ImageIcon className="h-3 w-3 sm:h-4 sm:w-4" />
      </div>
    );
  }

  return (
    <HoverCard
      openDelay={200}
      closeDelay={100}
      open={open}
      onOpenChange={setOpen}
    >
      <HoverCardTrigger asChild>
        <div className="relative w-10 h-8 sm:w-12 sm:h-9 rounded overflow-hidden border bg-muted cursor-zoom-in group">
          <Image
            src={cover}
            alt="户型图缩略"
            fill
            sizes="48px"
            className="object-cover transition-opacity group-hover:opacity-80"
            referrerPolicy="no-referrer"
            unoptimized
          />
        </div>
      </HoverCardTrigger>

      {open && (
        <HoverCardContent
          className="w-100 p-2 bg-card z-50 shadow-lg"
          side="bottom"
          align="start"
          sideOffset={10}
        >
          <div className="rounded overflow-hidden bg-muted border aspect-4/3 flex items-center justify-center relative">
            <Image
              src={cover}
              alt="户型图大图预览"
              fill
              sizes="400px"
              className="object-contain"
              referrerPolicy="no-referrer"
              unoptimized
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            数据来源: {dataSource || "未知"}
          </p>
        </HoverCardContent>
      )}
    </HoverCard>
  );
};
const FloorPlanPreview = memo(FloorPlanPreviewImpl);

export const columns: ColumnDef<Property>[] = [
  // 1. 房源ID
  {
    accessorKey: "id",
    header: () => <span className="inline md:table-cell">ID</span>,
    cell: ({ row }) => (
      <span className="inline text-xs text-muted-foreground md:table-cell">
        #{row.getValue("id")}
      </span>
    ),
    size: 60,
  },
  // 2. 户型图 (应用新逻辑)
  {
    id: "image",
    header: () => (
      <span className="text-xs">
        <span className="hidden sm:inline">户型图</span>
        <span className="sm:hidden">图</span>
      </span>
    ),
    cell: ({ row }) => {
      // 调用辅助函数获取图片URL
      const cover = getFloorPlan(
        row.original.data_source,
        row.original.picture_links,
      );

      // 如果没图，显示占位符 (保持不变)
      if (!cover) {
        return (
          <div className="w-10 h-8 sm:w-12 sm:h-9 bg-muted rounded border flex items-center justify-center text-muted-foreground">
            <ImageIcon className="h-3 w-3 sm:h-4 sm:w-4" />
          </div>
        );
      }

      // 有图，使用 HoverCard 包裹
      return (
        <FloorPlanPreview cover={cover} dataSource={row.original.data_source} />
      );
    },
    size: 50,
  },
  // 3. 小区 - 移动端堆叠显示小区+户型+楼层，可点击打开详情
  {
    accessorKey: "community_name",
    header: () => <span className="text-xs">小区</span>,
    cell: function CommunityCell({ row }) {
      const name = row.getValue("community_name") as string;
      const { rooms, baths } = row.original;
      const floor = row.original.floor_display;
      const [, setPropertyId] = useQueryState("propertyId", { shallow: true });

      return (
        <div className="min-w-0">
          {/* 桌面端只显示小区名 */}
          <div className="hidden sm:block">
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <div className="font-medium truncate max-w-[7em] cursor-help">
                    {name}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{name}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {/* 移动端堆叠显示，可点击 */}
          <div
            className="sm:hidden flex flex-col gap-0.5 cursor-pointer active:opacity-70"
            onClick={() => setPropertyId(String(row.original.id))}
          >
            <span className="font-medium text-xs truncate max-w-[6em] text-primary underline-offset-2 hover:underline">
              {name}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {rooms}室{baths}卫 · {floor}
            </span>
          </div>
        </div>
      );
    },
  },
  // 4. 状态
  {
    accessorKey: "status",
    header: () => <span className="inline">状态</span>,
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <div className="block">
          <Badge
            variant={
              status === "在售"
                ? "default"
                : status === "成交"
                  ? "secondary"
                  : status === "过期"
                    ? "destructive"
                    : "outline"
            }
          >
            {status}
          </Badge>
        </div>
      );
    },
  },
  // 5. 商圈
  {
    accessorKey: "business_circle",
    header: () => <span className="inline md:table-cell">商圈</span>,
    cell: ({ row }) => {
      const val = row.getValue("business_circle") as string;
      return (
        <span className="inline text-sm text-muted-foreground md:table-cell">
          {val || "-"}
        </span>
      );
    },
  },
  // 6. 户型
  {
    id: "layout_custom",
    header: () => <span className="inline text-xs md:table-cell">户型</span>,
    cell: ({ row }) => {
      const { rooms, baths } = row.original;
      return (
        <span className="inline whitespace-nowrap text-xs md:table-cell">
          {rooms}室{baths}卫
        </span>
      );
    },
  },
  // 7. 楼层/朝向（原楼层列合并朝向）
  {
    accessorKey: "floor_display",
    header: () => (
      <div className="block md:table-cell">
        <SortableHeader title="楼层/朝向" value="floor_number" />
      </div>
    ),
    cell: ({ row }) => {
      const floor = row.getValue("floor_display") as string;
      const orientation = row.original.orientation;
      return (
        <div className="flex flex-col gap-1 py-2 whitespace-nowrap md:table-cell">
          <span className="text-xs leading-tight">{floor}</span>
          <span className="text-[10px] text-muted-foreground leading-tight">
            {orientation}
          </span>
        </div>
      );
    },
  },
  // 9. 面积
  {
    accessorKey: "build_area",
    header: () => (
      <div className="block md:table-cell">
        <SortableHeader title="面积" value="build_area" />
      </div>
    ),
    cell: ({ row }) => (
      <div className="block text-xs md:table-cell">
        {row.getValue("build_area")}㎡
      </div>
    ),
  },
  // 10. 价格（原总价列合并单价）
  {
    accessorKey: "total_price",
    header: () => (
      <div className="block">
        <SortableHeader title="价格" value="unit_price" />
      </div>
    ),
    cell: ({ row }) => {
      const price = row.getValue("total_price") as number;
      const unitPrice = row.original.unit_price;
      return (
        <div className="flex flex-col gap-1 py-2 min-w-0">
          <span className="text-error font-bold text-sm leading-tight">
            {price}万
          </span>
          <span className="text-[10px] text-muted-foreground leading-tight">
            {unitPrice} 元/㎡
          </span>
        </div>
      );
    },
  },
  // 12. 时间
  {
    id: "time_display",
    accessorKey: "listed_date",
    header: () => <SortableHeader title="时间" value="timeline" />,
    cell: ({ row }) => {
      const status = row.original.status;
      let dateStr: string | null | undefined;

      if (status === "成交") {
        dateStr = row.original.sold_date;
      } else {
        dateStr = row.original.listed_date;
      }

      if (!dateStr) return <span className="text-muted-foreground">-</span>;

      const date = new Date(dateStr);
      // 移动端显示 MM/DD，桌面端显示完整日期
      return (
        <span className="text-xs whitespace-nowrap">
          <span className="hidden sm:inline">{date.toLocaleDateString('zh-CN')}</span>
          <span className="sm:hidden">
            {date.getMonth() + 1}/{date.getDate()}
          </span>
        </span>
      );
    },
  },
  // 备注（与详情页"挂牌备注"同源 listing_remarks）
  {
    id: "listing_remarks",
    header: () => <span className="inline text-xs md:table-cell">备注</span>,
    cell: ({ row }) => {
      const remarks = row.original.listing_remarks;
      if (!remarks || remarks.trim() === "") {
        return <span className="text-xs text-muted-foreground">-</span>;
      }
      return (
        <div className="hidden md:table-cell">
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <div className="max-w-50 truncate text-xs text-muted-foreground cursor-help">
                  {remarks}
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-100">
                <p className="whitespace-pre-wrap wrap-break-word text-xs">{remarks}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      );
    },
    size: 200,
  },
  // 13. 数据源
  {
    accessorKey: "data_source",
    header: () => <span className="inline text-xs md:table-cell">来源</span>,
    cell: ({ row }) => (
      <Badge variant="outline" className="inline-flex text-[10px] md:table-cell">
        {row.getValue("data_source")}
      </Badge>
    ),
  },
  // 14. 操作
  {
    id: "actions",
    header: () => <span className="inline">操作</span>,
    cell: ({ row }) => (
      <div className="block">
        <ActionCell id={row.original.id} />
      </div>
    ),
  },
];
