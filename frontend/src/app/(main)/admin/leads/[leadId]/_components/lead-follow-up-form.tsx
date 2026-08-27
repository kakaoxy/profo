"use client";

import { useState } from "react";
import { History } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { handleError, handleSuccess } from "@/lib/error-handling";

import { FollowUp, FollowUpMethod } from "../../types";
import { addFollowUpAction, getLeadFollowUpsAction } from "../../actions/follow-up-actions";
import { ERROR_MESSAGES, FOLLOW_UP_METHODS, SUCCESS_MESSAGES } from "../../constants/ui-labels";

interface LeadFollowUpFormProps {
  leadId: string;
  onFollowUpsChange: (followUps: FollowUp[]) => void;
}

const METHOD_OPTIONS: FollowUpMethod[] = ["phone", "wechat", "face", "visit"];

export function LeadFollowUpForm({ leadId, onFollowUpsChange }: LeadFollowUpFormProps) {
  const { hasPermission } = usePermission();
  const canWrite = hasPermission(PERMISSION_CODES.LEAD_WRITE);

  const [method, setMethod] = useState<FollowUpMethod>("phone");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!canWrite) return null;

  const trimmed = content.trim();
  const canSubmit = trimmed.length > 0 && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const result = await addFollowUpAction(leadId, method, trimmed);
      if (!result.success) {
        handleError(result.error, "LeadFollowUpForm.submit", {
          fallbackMessage: ERROR_MESSAGES.FOLLOW_UP_FAILED,
        });
        return;
      }
      handleSuccess(SUCCESS_MESSAGES.FOLLOW_UP_ADDED);
      setContent("");
      const followUpsResult = await getLeadFollowUpsAction(leadId);
      if (followUpsResult.success) onFollowUpsChange(followUpsResult.data);
    } catch {
      handleError(null, "LeadFollowUpForm.submit", {
        fallbackMessage: ERROR_MESSAGES.FOLLOW_UP_FAILED,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-card border border-dove rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          登记最新动态
        </span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          className="h-11 px-3 rounded-xl border border-dove bg-fog text-xs font-bold outline-none focus:ring-2 focus:ring-ink/20 sm:w-32"
          value={method}
          onChange={(e) => setMethod(e.target.value as FollowUpMethod)}
          disabled={isSubmitting}
        >
          {METHOD_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {FOLLOW_UP_METHODS[m]}
            </option>
          ))}
        </select>
        <input
          className="flex-1 h-11 px-4 border border-dove rounded-xl text-xs outline-none focus:ring-2 focus:ring-ink/20 bg-fog"
          placeholder="输入跟进摘要..."
          maxLength={500}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={isSubmitting}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <Button
          type="button"
          className="h-11 rounded-xl bg-ink hover:bg-ink/90 font-bold w-full sm:w-auto sm:px-6"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {isSubmitting ? "提交中..." : "记录"}
        </Button>
      </div>
    </div>
  );
}
