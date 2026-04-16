/**
 * 项目导入 Hook
 * 处理从L3项目导入数据到表单
 */
"use client";

import * as React from "react";
import { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { fetchImportData } from "../project-selector/api";
import { importDataToFormValues, type FormValues } from "../form-schema";
import type { ImportPreviewData, L3ProjectBrief } from "../project-selector/types";

interface UseProjectImportProps {
  form: UseFormReturn<FormValues>;
}

interface UseProjectImportReturn {
  // 状态
  isImporting: boolean;
  showSelector: boolean;
  showPreview: boolean;
  selectedProject: L3ProjectBrief | null;
  importData: ImportPreviewData | null;

  // 操作
  openSelector: () => void;
  closeSelector: () => void;
  handleSelectProject: (project: L3ProjectBrief) => void;
  handleConfirmImport: () => void;
  handleCancelImport: () => void;
  clearImport: () => void;
}

/**
 * 项目导入 Hook
 */
export function useProjectImport({
  form,
}: UseProjectImportProps): UseProjectImportReturn {
  const [isImporting, setIsImporting] = React.useState(false);
  const [showSelector, setShowSelector] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(false);
  const [selectedProject, setSelectedProject] = React.useState<L3ProjectBrief | null>(null);
  const [importData, setImportData] = React.useState<ImportPreviewData | null>(null);

  // 打开选择器
  const openSelector = React.useCallback(() => {
    setShowSelector(true);
  }, []);

  // 关闭选择器
  const closeSelector = React.useCallback(() => {
    setShowSelector(false);
  }, []);

  // 选择项目
  const handleSelectProject = React.useCallback(
    async (project: L3ProjectBrief) => {
      setSelectedProject(project);
      setShowSelector(false);
      setIsImporting(true);

      try {
        const data = await fetchImportData(project.id);
        setImportData(data);
        setShowPreview(true);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "导入数据失败");
        setSelectedProject(null);
      } finally {
        setIsImporting(false);
      }
    },
    []
  );

  // 确认导入
  const handleConfirmImport = React.useCallback(() => {
    if (!importData) return;

    // 转换数据并填充表单
    const formValues = importDataToFormValues(importData as unknown as Record<string, unknown>);

    // 批量设置表单值
    Object.entries(formValues).forEach(([key, value]) => {
      if (value !== undefined) {
        form.setValue(key as keyof FormValues, value as FormValues[keyof FormValues], {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: false,
        });
      }
    });

    // 清除所有验证错误
    form.clearErrors();

    toast.success("数据导入成功，请检查并完善信息");
    setShowPreview(false);
  }, [importData, form]);

  // 取消导入
  const handleCancelImport = React.useCallback(() => {
    setShowPreview(false);
    setImportData(null);
    setSelectedProject(null);
  }, []);

  // 清除导入
  const clearImport = React.useCallback(() => {
    setSelectedProject(null);
    setImportData(null);
    form.setValue("project_id", undefined);
  }, [form]);

  return {
    // 状态
    isImporting,
    showSelector,
    showPreview,
    selectedProject,
    importData,

    // 操作
    openSelector,
    closeSelector,
    handleSelectProject,
    handleConfirmImport,
    handleCancelImport,
    clearImport,
  };
}
