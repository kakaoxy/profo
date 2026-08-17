"use client";

import { ArrowRight } from "lucide-react";

import type { StageCtaAction } from "./config";

interface MobileActionBarProps {
  /** 阶段流转主 CTA（已售/已下架为 null，此时整个操作条不渲染） */
  cta: StageCtaAction | null;
}

/**
 * 移动端（<768px）底部吸顶操作条（原型 .m-cta）：
 * 仅承载阶段流转主 CTA；编辑/删除已收口至顶部工具行「···」菜单；
 * ≥768px 隐藏（操作回到顶部工具行 / 底部阶段操作条）。
 */
export function MobileActionBar({ cta }: MobileActionBarProps) {
  if (!cta) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div className="flex items-center gap-2.5 border-t border-[#efeff1] bg-pure-white/95 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
        <button
          type="button"
          onClick={cta.onClick}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 py-3 text-[14.5px] font-[450] text-pure-white shadow-[0_8px_16px_-8px_rgba(23,25,28,0.5)]"
        >
          {cta.label}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
