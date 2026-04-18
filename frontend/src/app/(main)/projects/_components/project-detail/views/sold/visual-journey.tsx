"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageIcon } from "lucide-react";
import { Project } from "../../../../types";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { RENOVATION_STAGES } from "../../constants";
import { format, parseISO } from "date-fns";
import { StagePhotoItem } from "./components/stage-photo-item";
import { SummaryReport } from "./components/summary-report";

export { SummaryReport };

export function VisualJourney({ project }: { project: Project }) {
  const photos = project.renovation_photos || [];
  const stageDates = project.renovationStageDates || {};

  const groupedPhotos = RENOVATION_STAGES.map((stage) => {
    const stagePhotos = photos.filter(
      (p) => p.stage === stage.value || p.stage === stage.key
    );
    const date = stageDates[stage.value];
    return {
      ...stage,
      photos: stagePhotos,
      date: date || null,
    };
  }).filter((s) => s.photos.length > 0);

  const totalPhotos = photos.length;

  return (
    <Card className="border-slate-200 shadow-sm flex flex-col overflow-hidden">
      <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-slate-500" />
          项目蜕变影像 (Visual Journey)
        </CardTitle>
        <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
          📸 全生命周期影像记录 (共 {totalPhotos} 张)
        </span>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex p-6 gap-6">
            {groupedPhotos.length > 0 ? (
              groupedPhotos.map((stage, idx) => (
                <div key={stage.key}>
                  <StagePhotoItem
                    photo={stage.photos[0]}
                    stageLabel={stage.label}
                    photoCount={stage.photos.length}
                    allPhotos={stage.photos}
                  />

                  <div className="mt-4 space-y-1 pl-1">
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-900" />
                      <span className="text-sm font-bold text-slate-700">
                        {idx + 1}. {stage.value}{stage.label.includes("阶段") ? "" : "阶段"}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-slate-400 pl-3">
                      ({stage.date ? format(parseISO(stage.date), "MM/dd") : "--/--"})
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="w-full py-12 flex flex-col items-center justify-center text-slate-400">
                <ImageIcon className="h-8 w-8 mb-2 opacity-30" />
                <span className="text-xs">暂无影像记录</span>
              </div>
            )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
