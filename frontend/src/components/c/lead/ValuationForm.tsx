"use client";

import { useActionState, useState, useMemo } from "react";
import { Smartphone, Ruler } from "lucide-react";
import { CommunitySelect } from "@/components/common/community-select";
import { LayoutInputs } from "@/components/common/layout-inputs";
import { createLeadAction, searchCCommunitiesAction } from "@/app/(c)/c/valuation/actions";
import type { ActionResult } from "@/lib/action-result";

const ORIENTATION_OPTIONS = ["南", "北", "东", "西", "南北", "东西"];

const FormItem = ({ label, children, required }: { label: string; children?: React.ReactNode; required?: boolean }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
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
    <form action={formAction} className="space-y-6">
      <div className="rounded-xl bg-white p-6 shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-c-border-subtle space-y-5">
        {state && !state.success && state.error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-c-error text-sm">
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

        <div className="bg-muted p-6 rounded-2xl space-y-6 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Ruler className="h-4 w-4 text-muted-foreground" />
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">物理指标</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormItem label="面积 (㎡)" required>
              <input
                type="number"
                step="0.1"
                name="area"
                className="w-full h-11 px-4 border rounded-lg outline-none text-sm font-bold bg-background"
                value={formData.area}
                onChange={(e) => updateField("area", e.target.value)}
                placeholder="请输入面积"
              />
            </FormItem>

            <FormItem label="朝向">
              <select
                name="orientation"
                className="w-full h-11 border rounded-lg bg-background text-sm font-medium"
                value={formData.orientation}
                onChange={(e) => updateField("orientation", e.target.value)}
              >
                {ORIENTATION_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </FormItem>

            <FormItem label="楼层/总高">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    placeholder="1"
                    className="w-full h-11 px-3 border rounded-lg outline-none text-sm font-medium text-center bg-background"
                    value={formData.currentFloor}
                    onChange={(e) => updateField("currentFloor", e.target.value)}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-background">层</span>
                </div>
                <span className="text-muted-foreground/50">/</span>
                <div className="relative flex-1">
                  <input
                    placeholder="6"
                    className="w-full h-11 px-3 border rounded-lg outline-none text-sm font-medium text-center"
                    value={formData.totalFloor}
                    onChange={(e) => updateField("totalFloor", e.target.value)}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-background">总</span>
                </div>
              </div>
            </FormItem>
          </div>
        </div>
        <input type="hidden" name="floor_info" value={floorInfo} />

        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">补充信息</label>
          <textarea
            name="remarks"
            rows={3}
            placeholder="补充说明，如装修情况、学区等"
            className="w-full p-4 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm transition-all"
            value={formData.remarks}
            onChange={(e) => updateField("remarks", e.target.value)}
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
