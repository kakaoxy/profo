"use client";

import { useActionState, useState } from "react";
import { Smartphone } from "lucide-react";
import { CommunitySearchInput } from "./CommunitySearchInput";
import { createLeadAction } from "@/app/(c)/c/valuation/actions";
import type { ActionResult } from "@/lib/action-result";

const LAYOUT_OPTIONS = ["一室一厅", "两室一厅", "三室两厅", "四室两厅", "其他"];

const ORIENTATION_OPTIONS = ["东", "南", "西", "北", "东南", "东北", "西南", "西北"];

export function ValuationForm() {
  const [state, formAction, isPending] = useActionState(
    createLeadAction,
    { success: false, error: "" } as ActionResult<{ id: string }>
  );

  const [communityName, setCommunityName] = useState("");

  return (
    <form action={formAction} className="space-y-6">
      <div className="rounded-xl bg-white p-6 shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-c-border-subtle space-y-5">
        {state && !state.success && state.error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-c-error text-sm">
            {state.error}
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-c-text-secondary uppercase mb-2">
            小区名称 <span className="text-c-error">*</span>
          </label>
          <CommunitySearchInput
            value={communityName}
            onChange={setCommunityName}
            onSelect={() => {}}
          />
          <input type="hidden" name="community_name" value={communityName} required />
        </div>

        <div>
          <label className="block text-xs font-bold text-c-text-secondary uppercase mb-2">
            户型
          </label>
          <select
            name="layout"
            className="w-full h-12 px-4 rounded-lg border border-c-border-subtle bg-white text-sm text-c-text-primary focus:outline-none focus:ring-2 focus:ring-c-trust-blue/10 focus:border-c-trust-blue/30 transition-all"
          >
            <option value="">请选择户型</option>
            {LAYOUT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-c-text-secondary uppercase mb-2">
            楼层
          </label>
          <input
            name="floor_info"
            type="text"
            placeholder="如：中楼层/共18层"
            className="w-full h-12 px-4 rounded-lg border border-c-border-subtle bg-c-surface text-sm text-c-text-primary placeholder:text-c-text-secondary focus:outline-none focus:ring-2 focus:ring-c-trust-blue/10 focus:border-c-trust-blue/30 transition-all"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-c-text-secondary uppercase mb-2">
            面积（㎡） <span className="text-c-error">*</span>
          </label>
          <input
            name="area"
            type="number"
            step="0.01"
            placeholder="请输入面积"
            className="w-full h-12 px-4 rounded-lg border border-c-border-subtle bg-c-surface text-sm text-c-text-primary placeholder:text-c-text-secondary focus:outline-none focus:ring-2 focus:ring-c-trust-blue/10 focus:border-c-trust-blue/30 transition-all"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-c-text-secondary uppercase mb-2">
            朝向
          </label>
          <select
            name="orientation"
            className="w-full h-12 px-4 rounded-lg border border-c-border-subtle bg-white text-sm text-c-text-primary focus:outline-none focus:ring-2 focus:ring-c-trust-blue/10 focus:border-c-trust-blue/30 transition-all"
          >
            <option value="">请选择朝向</option>
            {ORIENTATION_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-c-text-secondary uppercase mb-2">
            备注
          </label>
          <textarea
            name="remarks"
            rows={3}
            placeholder="补充说明，如装修情况、学区等"
            className="w-full px-4 py-3 rounded-lg border border-c-border-subtle bg-c-surface text-sm text-c-text-primary placeholder:text-c-text-secondary focus:outline-none focus:ring-2 focus:ring-c-trust-blue/10 focus:border-c-trust-blue/30 transition-all resize-none"
          />
        </div>
      </div>

      <div className="bg-c-surface p-4 rounded-lg border-l-4 border-c-action-gold flex items-center gap-3">
        <Smartphone className="h-5 w-5 text-c-action-gold shrink-0" />
        <span className="text-sm text-c-text-primary">完善手机号，获取更精准的估价结果</span>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-c-trust-blue text-white h-12 rounded-lg font-bold active:opacity-80 active:scale-95 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "提交中..." : "免费获取估价"}
      </button>
    </form>
  );
}
