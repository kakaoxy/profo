"use client";

import * as React from "react";
import { Upload, X, Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { L3ProjectBrief } from "../project-selector/types";

interface ProjectImportButtonProps {
  /** 已选项目 */
  selectedProject: L3ProjectBrief | null;
  /** 是否正在导入 */
  isImporting: boolean;
  /** 导入回调 */
  onImport: () => void;
  /** 清除回调 */
  onClear: () => void;
}

/**
 * 项目导入按钮组件
 * 显示导入按钮或已选项目信息
 */
export function ProjectImportButton({
  selectedProject,
  isImporting,
  onImport,
  onClear,
}: ProjectImportButtonProps) {
  // 未选择项目时显示导入按钮
  if (!selectedProject) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Upload className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h4 className="font-medium text-slate-900">从项目导入</h4>
              <p className="text-sm text-slate-500">从L3项目快速导入房源数据</p>
            </div>
          </div>
          <Button
            onClick={onImport}
            disabled={isImporting}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isImporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                导入中...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                选择项目
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // 已选择项目时显示项目信息
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-slate-900">{selectedProject.name}</h4>
              <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                已选择
              </span>
            </div>
            <p className="text-sm text-slate-500">
              {selectedProject.community_name} · {selectedProject.layout || "未设置户型"} · {" "}
              {selectedProject.area ? `${selectedProject.area}m²` : "未设置面积"}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClear}
          className="text-slate-400 hover:text-red-600 hover:bg-red-50"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
