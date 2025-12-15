"use client";

import { useState } from "react";
import {
  CheckCircle2,
  CircleDot,
  Circle,
  UploadCloud,
  Calendar as CalendarIcon,
  Trash2,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { Project } from "../../types";
import { RENOVATION_STAGES } from "./constants";

interface RenovationTimelineProps {
  project: Project;
}

export function RenovationTimeline({ project }: RenovationTimelineProps) {
  // 模拟当前阶段 (实际应从 project.renovation_stage 获取)
  const currentStageKey = project.renovation_stage || "hydro"; // 默认为水电
  const currentIndex = RENOVATION_STAGES.findIndex(
    (s) => s.key === currentStageKey
  );

  // 日期选择状态
  const [date, setDate] = useState<Date | undefined>(new Date());

  // 模拟提交动作
  const handleCompleteStage = (stageName: string) => {
    toast.success(`已完成 ${stageName}，进入下一阶段`);
    // 这里调用 Server Action 更新状态
  };

  return (
    <div className="relative pl-4 space-y-6">
      {/* 灰色垂直贯穿线 */}
      <div className="absolute left-[27px] top-4 bottom-10 w-0.5 bg-slate-200" />

      <Accordion
        type="single"
        collapsible
        defaultValue={currentStageKey}
        className="w-full space-y-6"
      >
        {RENOVATION_STAGES.map((stage, index) => {
          // 判断状态
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isFuture = index > currentIndex;

          return (
            <AccordionItem
              key={stage.key}
              value={stage.key}
              className="border-none relative"
              disabled={isFuture} // 未开始阶段禁止展开
            >
              {/* --- 1. 图标区域 (绝对定位在左侧) --- */}
              <div className="absolute left-0 top-1 z-10 bg-white p-1">
                {isCompleted && (
                  <CheckCircle2 className="h-6 w-6 text-green-500 fill-green-50" />
                )}
                {isCurrent && (
                  <CircleDot className="h-6 w-6 text-orange-500 animate-pulse" />
                )}
                {isFuture && <Circle className="h-6 w-6 text-slate-300" />}
              </div>

              {/* --- 2. 标题触发器 --- */}
              <AccordionTrigger
                className={cn(
                  "pl-12 py-1 hover:no-underline data-[state=open]:py-1",
                  isFuture ? "cursor-not-allowed opacity-60" : ""
                )}
              >
                <div className="flex items-center gap-3 w-full">
                  <span
                    className={cn(
                      "text-lg",
                      isCurrent
                        ? "font-bold text-slate-900"
                        : "font-medium text-slate-600"
                    )}
                  >
                    {stage.label}
                  </span>

                  {isCurrent && (
                    <Badge
                      variant="secondary"
                      className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-none"
                    >
                      进行中
                    </Badge>
                  )}

                  {isCompleted && (
                    <span className="text-xs text-muted-foreground font-normal ml-auto mr-4">
                      完成于 2025/11/05
                    </span>
                  )}

                  {isFuture && (
                    <span className="text-xs text-muted-foreground font-normal ml-2">
                      待开始
                    </span>
                  )}
                </div>
              </AccordionTrigger>

              {/* --- 3. 展开内容 --- */}
              <AccordionContent className="pl-12 pt-4 pb-2">
                <div className="bg-slate-50/50 rounded-lg border border-slate-100 p-4 space-y-4">
                  {/* 图片上传区 */}
                  <div className="grid grid-cols-4 gap-3">
                    {/* 模拟已上传图片 */}
                    {[1, 2].map((i) => (
                      <div
                        key={i}
                        className="aspect-square relative group rounded-md overflow-hidden bg-gray-200"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`https://placehold.co/200x200?text=IMG_${i}`}
                          alt="现场"
                          className="object-cover w-full h-full"
                        />
                        {isCurrent && (
                          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="bg-white/90 p-1 rounded-full text-red-500 hover:bg-white shadow-sm">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* 上传按钮 (仅当前或已完成阶段显示) */}
                    <div className="aspect-square rounded-md border-2 border-dashed border-slate-200 bg-white hover:bg-slate-50 hover:border-primary/50 cursor-pointer flex flex-col items-center justify-center transition-colors text-muted-foreground hover:text-primary gap-1">
                      {isCurrent ? (
                        <UploadCloud className="h-6 w-6" />
                      ) : (
                        <Plus className="h-6 w-6" />
                      )}
                      <span className="text-xs">
                        {isCurrent ? "上传照片" : "补传"}
                      </span>
                    </div>
                  </div>

                  {/* 底部行动栏 (仅当前阶段显示完整版，已完成显示简化版) */}
                  {isCurrent ? (
                    <div className="flex items-center justify-between bg-slate-100/50 p-3 rounded-md mt-4 border border-slate-100">
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded text-[10px] font-bold">
                          提示
                        </span>
                        请确保上传关键节点验收照片
                      </div>

                      <div className="flex items-center gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-[130px] justify-start text-left font-normal bg-white"
                            >
                              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                              {date ? (
                                format(date, "yyyy/MM/dd")
                              ) : (
                                <span>选择日期</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                              mode="single"
                              selected={date}
                              onSelect={setDate}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>

                        <Button
                          size="sm"
                          className="h-8 bg-slate-900 hover:bg-slate-800 text-white"
                          onClick={() => handleCompleteStage(stage.label)}
                        >
                          完成阶段
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // 已完成阶段的操作栏
                    <div className="flex justify-end pt-2 border-t border-slate-100 mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-primary"
                      >
                        更新节点信息
                      </Button>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
