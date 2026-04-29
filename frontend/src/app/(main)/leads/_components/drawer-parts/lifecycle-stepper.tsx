import React, { useMemo } from 'react';
import { Lead, LeadStatus } from '../../types';
import { LEAD_LIFECYCLE_STEPS } from '@/lib/status-colors';
import { cn } from '@/lib/utils';
import { CheckCircle2 } from 'lucide-react';

interface Props {
  lead: Lead;
}

export const LifecycleStepper: React.FC<Props> = ({ lead }) => {
  const currentStep = useMemo(() => {
    if (!lead) return 0;
    if (lead.status === LeadStatus.REJECTED) return -1;
    const stepConfig = LEAD_LIFECYCLE_STEPS.find(s => s.status === lead.status);
    return stepConfig?.step ?? 0;
  }, [lead]);

  return (
    <div className="px-6 py-4 bg-muted/80 border-b overflow-x-auto no-scrollbar">
      <div className="flex items-center min-w-[500px]">
        {LEAD_LIFECYCLE_STEPS.map((step, idx) => {
          const isActive = currentStep === idx;
          const isCompleted = currentStep > idx || currentStep === 3; // 3 implies completed/signed

          return (
            <React.Fragment key={step.status}>
              <div className="flex flex-col items-center flex-1 relative">
                <div className={cn(
                  "h-8 w-8 rounded-full border-2 flex items-center justify-center transition-all z-10",
                  isCompleted ? "bg-primary border-primary text-white shadow-lg shadow-primary/20" :
                  isActive ? "bg-card border-primary text-primary ring-4 ring-primary/10" :
                  "bg-card border-border text-muted-foreground"
                )}>
                  {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <span className="text-xs font-black">{idx + 1}</span>}
                </div>
                <span className={cn(
                  "text-[10px] font-black uppercase mt-2 tracking-tighter whitespace-nowrap",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {step.label}
                </span>
              </div>
              {idx < LEAD_LIFECYCLE_STEPS.length - 1 && (
                <div className={cn(
                  "h-[2px] w-full flex-1 -mt-4 transition-colors",
                  isCompleted ? "bg-primary" : "bg-border"
                )} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
