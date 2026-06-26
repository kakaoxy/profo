"use client";

import { useActionState, useState, useMemo } from "react";
import { Smartphone, Ruler } from "lucide-react";
import { CommunitySelect } from "@/components/common/community-select";
import { LayoutInputs } from "@/components/common/layout-inputs";
import { createLeadAction, searchCCommunitiesAction } from "@/app/(c)/valuation/actions";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

const ORIENTATION_OPTIONS = ["南", "北", "东", "西", "南北", "东西"];

const FormItem = ({ label, children, required, className }: { label: string; children?: React.ReactNode; required?: boolean; className?: string }) => (
  <div className={cn("space-y-1.5", className)}>
    <label className="text-[10px] sm:text-xs font-medium text-graphite uppercase tracking-widest ml-1">
      {label} {required && <span className="text-error">*</span>}
    </label>
    {children}
  </div>
);

export function ValuationForm() {
  const [state, formAction, isPending] = useActionState(
    createLeadAction,
    { success: false, error: "" } as ActionResult<{ id: string }>
  );

  const [formData, setFormData] = useState({
    communityId: "",
    communityName: "",
    district: "",
    businessArea: "",
    layout: "2室1厅1卫",
    orientation: "南",
    currentFloor: "",
    totalFloor: "",
    area: "",
    remarks: "",
  });

  const floorInfo = useMemo(() => {
    if (formData.currentFloor && formData.totalFloor) {
      return `${formData.currentFloor}/${formData.totalFloor}层`;
    }
    if (formData.currentFloor) {
      return `${formData.currentFloor}层`;
    }
    return "";
  }, [formData.currentFloor, formData.totalFloor]);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <form action={formAction} className="space-y-4 sm:space-y-6">
      <div className="rounded-cards bg-white p-5 sm:p-8 shadow-steep border border-dove/30 space-y-4 sm:space-y-5">
        {state && !state.success && state.error && (
          <div
            role="alert"
            className="p-3 bg-error-container border border-(--error)/30 rounded-inputs text-error text-sm"
          >
            {state.error}
          </div>
        )}

        <CommunitySelect
          value={formData.communityName}
          label="小区名称"
          onChange={(community) =>
            setFormData((prev) => ({
              ...prev,
              communityId: community.id,
              communityName: community.name,
              district: community.district || prev.district,
              businessArea: community.businessCircle || prev.businessArea,
            }))
          }
          onSearch={searchCCommunitiesAction}
          allowCreate={false}
        />
        <input type="hidden" name="community_id" value={formData.communityId} />
        <input type="hidden" name="community_name" value={formData.communityName} />
        <input type="hidden" name="district" value={formData.district} />
        <input type="hidden" name="business_area" value={formData.businessArea} />

        <LayoutInputs
          value={formData.layout}
          onChange={(l) => updateField("layout", l)}
          label="房源户型"
        />
        <input type="hidden" name="layout" value={formData.layout} />

        <div className="bg-fog p-4 sm:p-6 rounded-cards space-y-4 sm:space-y-6 border border-dove/30">
          <div className="flex items-center gap-2">
            <Ruler className="h-4 w-4 text-graphite" />
            <span className="text-[10px] sm:text-xs font-medium text-graphite uppercase tracking-widest">物理指标</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <FormItem label="面积 (㎡)" required>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                name="area"
                className="w-full h-12 px-4 rounded-inputs border border-dove/30 bg-white text-base font-medium text-ink placeholder:text-graphite outline-none focus:border-rust transition-colors"
                value={formData.area}
                onChange={(e) => updateField("area", e.target.value)}
                placeholder="请输入面积"
              />
            </FormItem>

            <FormItem label="朝向">
              <select
                name="orientation"
                className="w-full h-12 rounded-inputs border border-dove/30 bg-white text-base font-medium text-ink text-center appearance-none pl-4 pr-10 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23a3a6af%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-size-[16px] bg-position-[right_12px_center] bg-no-repeat focus:border-rust transition-colors"
                value={formData.orientation}
                onChange={(e) => updateField("orientation", e.target.value)}
              >
                {ORIENTATION_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </FormItem>

            <FormItem label="楼层/总高" className="col-span-2 sm:col-span-1">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    inputMode="numeric"
                    placeholder="1"
                    className="w-full h-12 px-3 rounded-inputs border border-dove/30 bg-white text-base font-medium text-ink text-center outline-none focus:border-rust transition-colors"
                    value={formData.currentFloor}
                    onChange={(e) => updateField("currentFloor", e.target.value)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-graphite pointer-events-none">层</span>
                </div>
                <span className="text-graphite/50 text-sm">/</span>
                <div className="relative flex-1">
                  <input
                    inputMode="numeric"
                    placeholder="6"
                    className="w-full h-12 px-3 rounded-inputs border border-dove/30 bg-white text-base font-medium text-ink text-center outline-none focus:border-rust transition-colors"
                    value={formData.totalFloor}
                    onChange={(e) => updateField("totalFloor", e.target.value)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-graphite pointer-events-none">总</span>
                </div>
              </div>
            </FormItem>
          </div>
        </div>
        <input type="hidden" name="floor_info" value={floorInfo} />

        <div className="space-y-1.5">
          <label className="text-[10px] sm:text-xs font-medium text-graphite uppercase tracking-widest ml-1">补充信息</label>
          <textarea
            name="remarks"
            rows={3}
            placeholder="补充说明，如装修情况、学区等"
            className="w-full p-3 sm:p-4 rounded-inputs border border-dove/30 bg-white text-base text-ink placeholder:text-graphite outline-none focus:border-rust transition-colors"
            value={formData.remarks}
            onChange={(e) => updateField("remarks", e.target.value)}
          />
        </div>
      </div>

      <div className="bg-apricot-wash p-3 sm:p-4 rounded-inputs flex items-center gap-3">
        <Smartphone className="h-5 w-5 text-rust shrink-0" />
        <span className="text-sm text-ink">完善手机号，获取更精准的估价结果</span>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-ink text-white h-12 rounded-full font-medium text-base active:opacity-80 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "提交中..." : "免费获取估价"}
      </button>
    </form>
  );
}
