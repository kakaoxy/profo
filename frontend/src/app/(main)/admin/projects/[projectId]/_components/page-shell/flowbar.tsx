"use client";

import { AlertTriangle, ArrowRight, Clock } from "lucide-react";

interface FlowbarProps {
  /** 左侧流转提示（clock=常规流转 / warn=不可逆警示） */
  hint: { kind: "clock" | "warn"; text: string };
  /** 唯一实心主 CTA（单屏唯一实心按钮收口于此） */
  cta: { label: string; onClick: () => void };
  /** 在售态「结束项目」rust 链接（打开实际结束日期确认弹窗） */
  endProject?: { onClick: () => void };
}

/**
 * 底部阶段操作条（V4 · 原型 .flowbar）：白卡 + shadow-steep，
 * 左 hint（15px 图标 graphite + 14px 文案 ash），右操作区
 * （可选「结束项目」rust textlink + Ink 实心胶囊 CTA）。
 */
export function Flowbar({ hint, cta, endProject }: FlowbarProps) {
  const HintIcon = hint.kind === "clock" ? Clock : AlertTriangle;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-cards bg-pure-white px-6 py-4 shadow-steep">
      <span className="flex min-w-0 items-center gap-2 text-sm font-[430] text-ash">
        <HintIcon className="h-[15px] w-[15px] shrink-0 text-graphite" />
        {hint.text}
      </span>
      <span className="flex shrink-0 items-center gap-3.5">
        {endProject && (
          <button
            type="button"
            onClick={endProject.onClick}
            className="bg-none text-[15px] font-[450] text-rust hover:underline hover:underline-offset-4"
          >
            结束项目
          </button>
        )}
        <button
          type="button"
          onClick={cta.onClick}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-[22px] py-[11px] text-[15px] font-[450] text-pure-white shadow-[0_8px_16px_-8px_rgba(23,25,28,0.5)] transition-all hover:-translate-y-px hover:shadow-[0_12px_22px_-10px_rgba(23,25,28,0.55)]"
        >
          {cta.label}
          <ArrowRight className="h-4 w-4" />
        </button>
      </span>
    </div>
  );
}
