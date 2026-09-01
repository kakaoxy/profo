import { PHASE_1_LABEL, PHASE_2_LABEL } from "../types";

/**
 * 获客中心分期标记（对齐设计稿 .phase-tag）：
 * 一期=浅底实心描边药丸，二期=白底虚线描边药丸。
 * 无 'use client'，可在 Server / Client Component 中共用。
 */

/** 一期标记 */
export function PhaseTag1() {
  return (
    <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-fog text-graphite ring-1 ring-inset ring-[#ececee] whitespace-nowrap align-middle">
      {PHASE_1_LABEL}
    </span>
  );
}

/** 二期标记 */
export function PhaseTag2() {
  return (
    <span className="inline-flex items-center text-[11px] font-medium px-[7px] py-px rounded-full bg-white border border-dashed border-[#c9ccd4] text-graphite whitespace-nowrap align-middle">
      {PHASE_2_LABEL}
    </span>
  );
}
