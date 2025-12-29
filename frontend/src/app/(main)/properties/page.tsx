import { fetchClient } from "@/lib/api-server";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "./columns";
import { PropertyFilters } from "./_components/property-filters";
import { PropertyFilterSheet } from "./_components/property-filter-sheet";
import { ExportButton } from "./_components/export-button";
import { searchParamsCache } from "./search-params";
import { PropertyPagination } from "./_components/property-pagination"; // 引入分页组件
import { PropertyDetailSheet } from "./_components/property-detail-sheet";

// 1. 修改类型定义：searchParams 是一个 Promise
type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function PropertiesPage(props: PageProps) {
  // 2. 关键修复：先 await 解析 searchParams
  const searchParams = await props.searchParams;
  
  // 3. 使用 nuqs 解析缓存
  const query = searchParamsCache.parse(searchParams);

  // 调试日志：你看一下服务端控制台打印出来的 query 是否包含参数
  // console.log("前端解析到的参数:", query);

  const client = await fetchClient();
  
  // 4. 发起请求
  const { data, error } = await client.GET("/api/v1/properties", {
    params: {
      query: {
        page: query.page,
        page_size: query.page_size,
        // 如果是空字符串，转为 undefined，这样 openapi-fetch 就不会发送这个参数
        community_name: query.q || undefined, 
        status: query.status || undefined,
        rooms: query.rooms || undefined,
        floor_levels: query.floor_levels || undefined,
        min_price: query.min_price || undefined,
        max_price: query.max_price || undefined,
        min_area: query.min_area || undefined,
        max_area: query.max_area || undefined,
        districts: query.districts || undefined,
        sort_by: query.sort_by,
        sort_order: query.sort_order as "asc" | "desc", // 类型断言
      }
    }
  });

  if (error) {
    console.error("连接后端失败:", error);
    return <div className="p-8 text-red-500">连接后端失败</div>;
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b bg-background gap-2">
        <h1 className="text-lg sm:text-xl font-bold tracking-tight">房源列表</h1>
        <div className="flex items-center gap-2">
           {/* 移动端筛选按钮 */}
           <div className="md:hidden">
             <PropertyFilterSheet />
           </div>
           <span className="text-xs sm:text-sm text-muted-foreground">共 {data?.total || 0} 条</span>
           <ExportButton />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧筛选面板 - 仅在 md 及以上显示 */}
        <div className="hidden md:flex w-64 border-r bg-slate-50/50 p-4 overflow-y-auto shrink-0">
          <PropertyFilters />
        </div>

        {/* 右侧表格区域 */}
        <div className="flex-1 overflow-hidden p-2 sm:p-4 flex flex-col min-w-0">
           <div className="flex-1 overflow-y-auto overflow-x-hidden sm:overflow-x-auto scrollbar-hide border rounded-md bg-white shadow-sm">
              <DataTable columns={columns} data={data?.items || []} />
           </div>
           <div className="mt-2 relative z-50 bg-white">
             <PropertyPagination total={data?.total || 0}  />
           </div>
        </div>
      </div>
      <PropertyDetailSheet />
    </div>
  );
}
