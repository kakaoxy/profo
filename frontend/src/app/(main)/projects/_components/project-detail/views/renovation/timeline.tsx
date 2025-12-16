"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Accordion } from "@/components/ui/accordion";
import { Project, RenovationPhoto } from "../../../../types";
import { RENOVATION_STAGES } from "../../constants";
import { getRenovationPhotosAction } from "../../../../actions";
import { TimelineItem } from "./components/timeline-item";

interface RenovationTimelineProps {
  project: Project;
  onRefresh?: () => void;
}

export function RenovationTimeline({ project }: RenovationTimelineProps) {
  const [photos, setPhotos] = useState<RenovationPhoto[]>([]);

  // 1. 计算当前阶段索引
  // 优先匹配 value (中文 "拆除"), 其次 key ("demolition")
  const rawIndex = RENOVATION_STAGES.findIndex(
    (s) =>
      s.value === project.renovation_stage || s.key === project.renovation_stage
  );
  const currentIndex = rawIndex === -1 ? 0 : rawIndex;
  const currentStageKey = RENOVATION_STAGES[currentIndex].key;

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
      // 这里的 p.stage 是中文 "拆除"，我们要找到它对应的英文 key 用来做 Map 的 key
      const stageConfig = RENOVATION_STAGES.find(
        (s) => s.value === p.stage || s.key === p.stage
      );
      if (stageConfig) {
        map[stageConfig.key].push(p);
      }
    });
    return map;
  }, [photos]);

  return (
    <div className="relative pl-4 space-y-6 pb-12">
      {/* 灰色垂直贯穿线 */}
      <div className="absolute left-[27px] top-4 bottom-10 w-0.5 bg-slate-200" />

      <Accordion
        type="single"
        collapsible
        defaultValue={currentStageKey}
        // 关键：当 project 更新导致 currentStageKey 变化时，这里最好能受控，
        // 但 shadcn accordion defaultValue 只在初次渲染生效。
        // 如果要完全受控，可以用 value={currentStageKey} 并配合 onValueChange，
        // 不过对于时间轴，默认展开当前项通常够用了。
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
            onPhotoUploaded={fetchPhotos} // 子组件上传成功后调用
          />
        ))}
      </Accordion>
    </div>
  );
}
