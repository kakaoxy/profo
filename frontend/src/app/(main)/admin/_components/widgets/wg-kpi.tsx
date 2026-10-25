import type { ReactNode } from "react";

interface WgKpiProps {
  /** 指标名（.k：12.5px Graphite） */
  label: string;
  /** 数值（.v：26px/480 Ink，tabular-nums；lg 为 32px） */
  value: ReactNode;
  /** 数值单位后缀（.unit：12px/430 Graphite） */
  unit?: string;
  /** 数值下方补充说明（.d：11.5px Graphite） */
  detail?: ReactNode;
  /** 数值放大（设计稿 .v.lg，span-6 卡的主指标） */
  large?: boolean;
  /** 数值配色覆盖（如 P0 Rust、金额 pos/neg） */
  valueClassName?: string;
}

/**
 * 工作台卡片 KPI 单元（设计稿 .kpi，hifi:284-287）。
 *
 * 字号/字重/间距严格取自 hifi CSS：k 12.5px Graphite、v 26px（lg 32px）/480
 * Ink mt-5px、unit 12px/430 ml-3px、d 11.5px Graphite mt-7px。
 */
export function WgKpi({ label, value, unit, detail, large, valueClassName }: WgKpiProps) {
  return (
    <div className="min-w-0">
      <div className="text-[12.5px] text-graphite">{label}</div>
      <div
        className={`mt-[5px] leading-none tabular-nums text-ink ${
          large ? "text-[32px]" : "text-[26px]"
        } font-[480] ${valueClassName ?? ""}`}
      >
        {value}
        {unit ? (
          <span className="ml-[3px] text-xs font-[430] tracking-normal text-graphite">{unit}</span>
        ) : null}
      </div>
      {detail ? <div className="mt-[7px] text-[11.5px] text-graphite">{detail}</div> : null}
    </div>
  );
}
