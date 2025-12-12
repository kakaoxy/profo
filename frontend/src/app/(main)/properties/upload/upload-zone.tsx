"use client";

import { useState, useRef } from "react";
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress"; // 现在这个应该能找到了
import { Card, CardContent } from "@/components/ui/card";
// 1. 修改引入：不再使用 useToast，而是直接引入 toast 函数
import { toast } from "sonner"; 
import { downloadCsvTemplate } from "@/lib/file-utils";
import { uploadCSV, type UploadResult } from "@/lib/api-upload";
import { cn } from "@/lib/utils";

interface UploadZoneProps {
  accessToken: string;
}

export function UploadZone({ accessToken }: UploadZoneProps) {
  // 2. 删除 const { toast } = useToast(); 这一行，不需要了

  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);

  // --- 业务逻辑 ---

  const startUpload = async (file: File) => {
    setIsUploading(true);
    setProgress(0);
    setResult(null);

    try {
      const res = await uploadCSV(file, accessToken, (p) => setProgress(p));
      setResult(res);
      
      if (res.failed === 0) {
        // 3. Sonner 写法：toast.success(标题, { description: 描述 })
        toast.success("上传成功", { 
          description: `成功导入 ${res.success} 条数据` 
        });
      } else {
        // Sonner 写法：toast.warning 或 toast(标题, ...)
        toast.warning("上传完成但有错误", { 
          description: `成功 ${res.success} 条，失败 ${res.failed} 条` 
        });
      }
    } catch (error) {
      console.error(error);
      // Sonner 写法：toast.error
      toast.error("上传失败", {
        description: error instanceof Error ? error.message : "未知错误",
      });
      setCurrentFile(null); 
    } finally {
      setIsUploading(false);
    }
  };

  const validateAndUpload = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("文件格式错误", {
        description: "请上传 .csv 格式的文件",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("文件过大", {
        description: "文件大小不能超过 10MB",
      });
      return;
    }

    setCurrentFile(file);
    startUpload(file);
  };

  // --- 事件处理 ---

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isUploading) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isUploading) return;

    const files = e.dataTransfer.files;
    if (files?.length) validateAndUpload(files[0]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      validateAndUpload(e.target.files[0]);
    }
    e.target.value = "";
  };

  return (
    <div className="space-y-6">
      {/* 拖拽上传区域 */}
      <div
        className={cn(
          "relative border-2 border-dashed rounded-xl p-10 transition-all duration-200 ease-in-out flex flex-col items-center justify-center gap-4 cursor-pointer min-h-[300px]",
          isDragging 
            ? "border-primary bg-primary/5 scale-[1.01]" 
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-slate-50",
          isUploading && "pointer-events-none opacity-60"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileSelect}
        />

        {isUploading ? (
          <div className="w-full max-w-xs space-y-4 text-center animate-in fade-in">
            <div className="mx-auto w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">正在上传 {currentFile?.name}...</p>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground">{progress}%</p>
            </div>
          </div>
        ) : (
          <>
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
              <UploadCloud className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-semibold">点击或拖拽上传 CSV 文件</h3>
              <p className="text-sm text-muted-foreground">
                支持批量导入房源数据，单次最大 10MB
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={(e) => {
              e.stopPropagation(); 
              downloadCsvTemplate();
            }}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              下载数据模板
            </Button>
          </>
        )}
      </div>

      {/* 结果反馈区域 */}
      {result && (
        <Card className="animate-in slide-in-from-bottom-4 fade-in">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              {result.failed === 0 ? (
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                  <AlertCircle className="h-6 w-6 text-orange-600" />
                </div>
              )}
              
              <div className="flex-1 space-y-1">
                <h4 className="font-semibold text-base">
                  {result.failed === 0 ? "全部导入成功" : "导入完成，存在部分失败"}
                </h4>
                <div className="text-sm text-muted-foreground flex gap-4">
                  <span>总记录: {result.total}</span>
                  <span className="text-green-600">成功: {result.success}</span>
                  <span className="text-red-600">失败: {result.failed}</span>
                </div>
                
                {result.failed > 0 && result.failed_file_url && (
                  <div className="pt-2">
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      onClick={() => window.open(result.failed_file_url!, '_blank')}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      下载失败记录 (CSV)
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      请下载失败记录，修改错误后重新上传该文件。
                    </p>
                  </div>
                )}
              </div>

              <Button variant="ghost" size="icon" onClick={() => setResult(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}