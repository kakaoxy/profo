import React, { useMemo } from "react";
import { Lead, LeadStatus } from "../../types";
import { LEAD_STATUS_META } from "../../_lib/lead-status-meta";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Props {
  lead: Lead;
}

const LIFECYCLE_STEPS = [
  { status: LeadStatus.PENDING_ASSESSMENT, label: "初筛评估", step: 0 },
  { status: LeadStatus.PENDING_VISIT, label: "上门实勘", step: 1 },
  { status: LeadStatus.VISITED, label: "商务谈判", step: 2 },
  { status: LeadStatus.SIGNED, label: "签约收房", step: 3 },
] as const;

/** 详情抽屉生命周期：细线节点，已完成 Ink、当前 Apricot、未到达 Fog。 */
export const LifecycleStepper: React.FC<Props> = ({ lead }) => {
  const isTerminalClosed =
    lead.status === LeadStatus.REJECTED || lead.status === LeadStatus.LOST_TO_COMPETITOR;

  const currentStep = useMemo(() => {
    if (lead.status === LeadStatus.REJECTED || lead.status === LeadStatus.LOST_TO_COMPETITOR) {
      return -1;
    }
    return LIFECYCLE_STEPS.find((item) => item.status === lead.status)?.step ?? 0;
  }, [lead.status]);

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center px-6 pt-5 sm:px-7",
        isTerminalClosed && "opacity-65 saturate-50",
      )}
      aria-label="线索阶段"
    >
      {isTerminalClosed && (
        <span
          className={cn(
            "absolute right-6 top-1 text-[9px] font-medium",
            LEAD_STATUS_META[lead.status].badgeClass,
          )}
        >
          {LEAD_STATUS_META[lead.status].label}
        </span>
      )}
      {LIFECYCLE_STEPS.map((step, index) => {
        const isActive = currentStep === index;
        const isDone = currentStep > index || currentStep === 3;
        return (
          <React.Fragment key={step.status}>
            <div className="flex min-w-0 items-center gap-[7px]">
              <span
                className={cn(
                  "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[9px]",
                  isDone
                    ? "bg-ink text-white"
                    : isActive
                      ? "bg-apricot-wash text-rust"
                      : "bg-fog text-dove",
                )}
              >
                {isDone ? <Check className="h-2.5 w-2.5" strokeWidth={2.2} /> : index + 1}
              </span>
              <span
                className={cn(
                  "whitespace-nowrap text-[10px]",
                  isDone ? "text-graphite" : isActive ? "font-medium text-rust" : "text-dove",
                )}
              >
                {step.label}
              </span>
            </div>
            {index < LIFECYCLE_STEPS.length - 1 && (
              <span
                className={cn(
                  "mx-[7px] h-px min-w-3 flex-1",
                  isDone ? "bg-ink/20" : "bg-dove/30",
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
