"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
// import { fetchClient } from "@/lib/api-client";
import { useSearchParams } from "next/navigation";

export function ExportButton() {
  const searchParams = useSearchParams();

  const handleExport = async () => {
    // 这里我们直接拼接当前页面的参数去请求导出接口
    // 注意：实际项目中通常是用 window.open 或者生成 Blob 下载
    const query = searchParams.toString();
    const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/properties/export?${query}`;
    
    // 打开新窗口触发下载
    window.open(url, '_blank');
  };

  return (
    <Button variant="outline" onClick={handleExport}>
      <Download className="mr-2 h-4 w-4" />
      导出数据
    </Button>
  );
}