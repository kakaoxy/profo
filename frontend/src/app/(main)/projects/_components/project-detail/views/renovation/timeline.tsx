"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Accordion } from "@/components/ui/accordion";
import { Project, RenovationPhoto } from "../../../../types";
import { RENOVATION_STAGES } from "../../constants";
import { getRenovationPhotosAction } from "../../../../actions/renovation";
import { TimelineItem } from "./components/timeline-item";

interface RenovationTimelineProps {
  project: Project;
  onRefresh?: () => void;
}

export function RenovationTimeline({
  project,
  onRefresh,
}: RenovationTimelineProps) {
  const [photos, setPhotos] = useState<RenovationPhoto[]>([]);

  // 2. 获取照片数据的方法
  const fetchPhotos = useCallback(async () => {
    const res = await getRenovationPhotosAction(project.id);
    if (res.success && Array.isArray(res.data)) {
      setPhotos(res.data as RenovationPhoto[]);
    }
  }, [project.id]);

  // 初始加载
  useEffect(() => {
    const init = async () => {
      await fetchPhotos();
    };
    init();
  }, [fetchPhotos]);

  // 3. 数据聚合
  const groupedPhotos = useMemo(() => {
    const map: Record<string, RenovationPhoto[]> = {};
    // 初始化
    RENOVATION_STAGES.forEach((s) => (map[s.key] = []));

    // 填充
    photos.forEach((p) => {
      const stageConfig = RENOVATION_STAGES.find(
        (s) => s.value === p.stage || s.key === p.stage
      );
      if (stageConfig) {
        map[stageConfig.key].push(p);
      }
    });
    return map;
  }, [photos]);

  // 计算索引用于传参
  const currentIndex = useMemo(() => {
    if (project.renovation_stage === "已完成" || ["selling", "sold"].includes(project.status)) {
      return RENOVATION_STAGES.length;
    }
    const idx = RENOVATION_STAGES.findIndex(
      (s) => s.value === project.renovation_stage || s.key === project.renovation_stage
    );
    return idx === -1 ? 0 : idx;
  }, [project.renovation_stage, project.status]);

  const currentStageKey = currentIndex < RENOVATION_STAGES.length 
    ? RENOVATION_STAGES[currentIndex].key 
    : "";

  return (
    <div className="relative pl-4 space-y-6 pb-12">
      {/* 灰色垂直贯穿线 */}
      <div className="absolute left-[27px] top-4 bottom-10 w-0.5 bg-slate-200" />

      {/* [关键修复] 
         1. 移除了 useState 和 useEffect 对 activeItem 的控制。
         2. 添加 key={currentStageKey}：
            当 project 更新导致 currentStageKey 变化时，React 会认为这是一个"新"的 Accordion。
            这会触发组件重置，从而自动应用新的 defaultValue，实现自动展开新阶段的效果。
      */}
      <Accordion
        type="single"
        collapsible
        key={currentStageKey}
        defaultValue={currentStageKey}
        className="w-full space-y-6"
      >
        {RENOVATION_STAGES.map((stage, index) => (
          <TimelineItem
            key={stage.key}
            stage={stage}
            index={index}
            currentIndex={currentIndex}
            project={project}
            photos={groupedPhotos[stage.key] || []}
            onPhotoUploaded={fetchPhotos}
            onRefresh={onRefresh}
          />
        ))}
      </Accordion>
    </div>
  );
}
