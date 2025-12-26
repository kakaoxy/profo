import React, { useMemo } from 'react';
import { Lead, LeadStatus } from '../../types';
import { STATUS_CONFIG, LIFECYCLE_STEPS } from '../../constants';
import { cn } from '@/lib/utils';
import { CheckCircle2 } from 'lucide-react';

interface Props {
  lead: Lead;
}

export const LifecycleStepper: React.FC<Props> = ({ lead }) => {
  const currentStep = useMemo(() => {
    if (!lead) return 0;
    if (lead.status === LeadStatus.REJECTED) return -1;
    return STATUS_CONFIG[lead.status]?.step || 0;
  }, [lead]);

  return (
    <div className="px-6 py-4 bg-slate-50/80 border-b overflow-x-auto no-scrollbar">
      <div className="flex items-center min-w-[500px]">
        {LIFECYCLE_STEPS.map((step, idx) => {
          const isActive = currentStep === idx;
          const isCompleted = currentStep > idx || currentStep === 3; // 3 implies completed/signed

          return (
            <React.Fragment key={step.status}>
              <div className="flex flex-col items-center flex-1 relative">
                <div className={cn(
                  "h-8 w-8 rounded-full border-2 flex items-center justify-center transition-all z-10",
                  isCompleted ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100" :
                  isActive ? "bg-white border-indigo-600 text-indigo-600 ring-4 ring-indigo-50" :
                  "bg-white border-slate-200 text-slate-400"
                )}>
                  {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <span className="text-xs font-black">{idx + 1}</span>}
                </div>
                <span className={cn(
                  "text-[10px] font-black uppercase mt-2 tracking-tighter whitespace-nowrap",
                  isActive ? "text-indigo-600" : "text-slate-400"
                )}>
                  {step.label}
                </span>
              </div>
              {idx < LIFECYCLE_STEPS.length - 1 && (
                <div className={cn(
                  "h-[2px] w-full flex-1 -mt-4 transition-colors",
                  isCompleted ? "bg-indigo-600" : "bg-slate-200"
                )} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
