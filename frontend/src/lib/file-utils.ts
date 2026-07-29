// src/lib/file-utils.ts

import { toast } from "sonner";

/**
 * 通用单文件下载：通过临时 <a> 触发浏览器下载。
 * filename 为空时由浏览器从 URL 自动推断文件名。
 * silent=true 时不弹 toast，供批量下载复用避免通知刷屏。
 */
export function downloadFile(
  url: string,
  filename?: string | null,
  silent: boolean = false,
): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? "";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (!silent) {
    toast.success("开始下载", filename ? { description: filename } : undefined);
  }
}

/**
 * 批量下载：依次触发每个文件下载，相邻两次间隔 300ms
 * 以规避浏览器"多文件下载拦截"弹窗。
 * 单个文件下载静默处理，仅在末尾弹出一次汇总提示。
 */
export function downloadFilesInBatch(
  items: Array<{ url: string; filename?: string | null }>,
): void {
  if (items.length === 0) {
    toast.info("暂无可下载的照片");
    return;
  }
  items.forEach((item, idx) => {
    setTimeout(() => downloadFile(item.url, item.filename, true), idx * 300);
  });
  setTimeout(() => {
    toast.success(`已开始下载 ${items.length} 张照片`);
  }, items.length * 300);
}

export function downloadCsvTemplate() {
  const headers = [
    '数据源','房源ID','状态','小区名','室','厅','卫','朝向','楼层','面积','套内面积',
    '挂牌价','上架时间','成交价','成交时间','物业类型','建筑年代','建筑结构','装修情况','电梯',
    '产权性质','产权年限','上次交易','供暖方式','房源描述','城市ID','行政区','商圈'
  ];
  
  const requirementRow = [
    '必填','必填','必填','必填','必填','可选','可选','必填','必填','必填','可选',
    '在售必填','在售必填','成交必填','成交必填','可选','可选','可选','可选','可选',
    '可选','可选','可选','可选','可选','可选','可选','可选'
  ];
  
  const sampleForSale = [
    '链家','LJ0001','在售','阳光花园','3','2','1','南','高楼层/18','98.5','',
    '520','2024-01-15','', '', '普通住宅','2008','钢混','精装','true',
    '商品房','70','2022-06','集中供暖','满五唯一，采光好','310000','浦东新区','陆家嘴'
  ];
  
  const sampleSold = [
    '贝壳','BK1002','成交','城市经典','2','2','1','南北','中楼层/12','86.2','',
    '','', '480','2024-03-02','普通住宅','2012','钢混','简装','false',
    '商品房','70','2021-12','集中供暖','学区房','310000','静安区','南京西路'
  ];

  const rows = [headers, requirementRow, sampleForSale, sampleSold];
  
  // CSV 转义处理
  const csvContent = rows.map(r => r.map(v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') 
      ? '"' + s.replace(/"/g,'""') + '"' 
      : s;
  }).join(',')).join('\n');

  // 添加 BOM (0xEF, 0xBB, 0xBF) 防止 Excel 中文乱码
  const blob = new Blob([new Uint8Array([0xEF,0xBB,0xBF]), csvContent], { type: 'text/csv;charset=utf-8' });
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `房源导入示例模板_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}