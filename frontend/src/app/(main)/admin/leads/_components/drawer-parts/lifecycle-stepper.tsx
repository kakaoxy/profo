import React, { useMemo } from "react";
import { Lead, LeadStatus } from "../../types";
import { LEAD_STATUS_META } from "../../_lib/lead-status-meta";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Props {
  lead: Lead;
}

const LIFECYCLE_PILL_STEPS = [
  { status: LeadStatus.PENDING_ASSESSMENT, label: "初筛评估", step: 0 },
  { status: LeadStatus.PENDING_VISIT, label: "上门实勘", step: 1 },
  { status: LeadStatus.VISITED, label: "商务谈判", step: 2 },
  { status: LeadStatus.SIGNED, label: "签约收房", step: 3 },
] as const;

export const LifecycleStepper: React.FC<Props> = ({ lead }) => {
  const isTerminalClosed =
    lead.status === LeadStatus.REJECTED || lead.status === LeadStatus.LOST_TO_COMPETITOR;

  const currentStep = useMemo(() => {
    if (!lead) return 0;
    if (lead.status === LeadStatus.REJECTED || lead.status === LeadStatus.LOST_TO_COMPETITOR) {
      return -1;
    }
    const stepConfig = LIFECYCLE_PILL_STEPS.find((s) => s.status === lead.status);
    return stepConfig?.step ?? 0;
  }, [lead]);

  return (
    <div
      className={cn(
        "px-4 py-3 bg-pure-white border-b border-dove overflow-x-auto no-scrollbar relative",
        isTerminalClosed && "opacity-70 saturate-50",
      )}
    >
      {isTerminalClosed && (
        <span
          className={cn(
            "absolute right-6 top-2.5 text-[10px] font-bold px-2 py-0.5",
            LEAD_STATUS_META[lead.status].badgeClass,
          )}
        >
          {LEAD_STATUS_META[lead.status].label}
        </span>
      )}
      <div className="flex items-center gap-1 min-w-[500px]">
        {LIFECYCLE_PILL_STEPS.map((step, idx) => {
          const isActive = currentStep === idx;
          const isCompleted = currentStep > idx || currentStep === 3; // 3 implies completed/signed

          return (
            <React.Fragment key={step.status}>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-2 pr-3 text-xs transition-colors",
                  isCompleted
                    ? "bg-ink text-white"
                    : isActive
                      ? "bg-apricot-wash text-rust font-medium"
                      : "bg-fog text-graphite",
                )}
              >
                {isCompleted ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span className="text-[10px] font-bold">{idx + 1}</span>
                )}
                {step.label}
              </span>
              {idx < LIFECYCLE_PILL_STEPS.length - 1 && (
                <span className="h-px w-8 shrink-0 bg-dove" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
