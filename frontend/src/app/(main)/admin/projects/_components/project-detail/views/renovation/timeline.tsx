"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Project, RenovationPhoto } from "../../../../types";
import { RENOVATION_STAGES } from "../../constants";
import { getRenovationPhotosAction } from "../../../../actions/renovation";
import { TimelineItem } from "./components/timeline-item";

interface RenovationTimelineProps {
  project: Project;
  onRefresh?: () => void;
}

export function RenovationTimeline({ project, onRefresh }: RenovationTimelineProps) {
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
      const stageConfig = RENOVATION_STAGES.find((s) => s.value === p.stage || s.key === p.stage);
      if (stageConfig) {
        map[stageConfig.key].push(p);
      }
    });
    return map;
  }, [photos]);

  // 计算当前阶段索引（仅用于 UI 视觉区分，不再用于禁用操作）
  const currentIndex = useMemo(() => {
    if (project.renovation_stage === "已完成" || ["selling", "sold"].includes(project.status)) {
      return RENOVATION_STAGES.length;
    }
    const idx = RENOVATION_STAGES.findIndex(
      (s) => s.value === project.renovation_stage || s.key === project.renovation_stage,
    );
    return idx === -1 ? 0 : idx;
  }, [project.renovation_stage, project.status]);

  return (
    // V4.4：六阶段全展开纵向时间线（左轨道圆点+连线由 TimelineItem 自渲染）
    // 白卡容器（rounded-cards/p-6/shadow-steep）+ 卡头标题与副标题（设计稿 .card / .card-head）
    <div className="rounded-cards bg-pure-white p-6 shadow-steep">
      <div className="mb-4">
        <div className="text-[16px] font-[500] text-ink">装修进度时间线</div>
        <div className="mt-0.5 text-[13px] font-[430] text-graphite">
          {RENOVATION_STAGES.map((s) => s.value).join(" → ")} · 标记完成需上传阶段照片
        </div>
      </div>
      <div className="pb-4">
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
      </div>
    </div>
  );
}
