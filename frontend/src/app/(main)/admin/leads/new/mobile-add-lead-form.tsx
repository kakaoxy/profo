"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Ruler } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LeadStatus } from "../types";
import { createLeadAction } from "../actions/lead-actions";
import { CommunitySelect } from "@/components/common/community-select";
import { LayoutInputs } from "@/components/common/layout-inputs";
import { FloorInput } from "@/components/common";
import { ImageUpload } from "../_components/add-lead-parts/image-upload";

const ORIENTATION_OPTIONS = ["南", "北", "东", "西", "南北", "东西"];

interface FieldLabelProps {
  children: React.ReactNode;
  required?: boolean;
}

function FieldLabel({ children, required }: FieldLabelProps) {
  return (
    <span className="text-xs font-medium text-muted-foreground">
      {children}
      {required && <span className="text-primary ml-0.5">*</span>}
    </span>
  );
}

export function MobileAddLeadForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    communityId: "",
    communityName: "",
    layout: "2室1厅1卫",
    orientation: "南",
    floorInfo: "",
    area: "",
    totalPrice: "",
    district: "",
    businessArea: "",
    remarks: "",
  });
  const [images, setImages] = useState<string[]>([]);

  const calculatedUnitPrice = useMemo(() => {
    const a = parseFloat(formData.area);
    const t = parseFloat(formData.totalPrice);
    return a > 0 && t > 0 ? (t / a).toFixed(2) : "0.00";
  }, [formData.area, formData.totalPrice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!formData.communityName || !formData.area || !formData.totalPrice) {
      toast.error("请填写必填项：房源名称、面积、用户报价");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await createLeadAction({
        communityId: formData.communityId || undefined,
        communityName: formData.communityName,
        layout: formData.layout,
        orientation: formData.orientation,
        floorInfo: formData.floorInfo,
        area: Number(formData.area),
        totalPrice: Number(formData.totalPrice),
        unitPrice: Number(calculatedUnitPrice),
        district: formData.district,
        businessArea: formData.businessArea,
        remarks: formData.remarks,
        status: LeadStatus.PENDING_ASSESSMENT,
        images: images.length > 0 ? images : [],
        creatorName: "运营",
      });
      if (res.success) {
        toast.success("线索已录入");
        router.push("/admin/leads");
      } else {
        toast.error(res.error || "提交失败");
      }
    } catch {
      toast.error("提交失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] mx-auto max-w-md pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 md:h-auto md:min-h-[calc(100vh-3.5rem)]">
      {/* Header (shrink-0，自然贴顶) */}
      <header className="shrink-0 z-40 h-14 bg-card/80 backdrop-blur-xl border-b border-border flex items-center gap-2 px-4">
        <Link
          href="/admin"
          aria-label="返回工作台"
          className="rounded-full p-1 hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-bold">录入新线索</h1>
      </header>

      {/* Form wraps body + footer so submit button works natively */}
      <form
        onSubmit={handleSubmit}
        className="flex-1 flex flex-col overflow-hidden"
      >
        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 no-scrollbar">
        {/* 1. 房源名称（CommunitySelect 自带 label） */}
        <div data-testid="field-community-name">
          <CommunitySelect
            value={formData.communityName}
            label="房源名称"
            onChange={(community) =>
              setFormData((prev) => ({
                ...prev,
                communityId: community.id,
                communityName: community.name,
                district: community.district || prev.district,
                businessArea: community.businessCircle || prev.businessArea,
              }))
            }
          />
        </div>

        {/* 2. 所在区域 */}
        <div className="flex flex-col gap-1.5">
          <FieldLabel>所在区域</FieldLabel>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="例如: 静安区"
              className="h-12 pl-10 text-base"
              value={formData.district}
              onChange={(e) =>
                setFormData({ ...formData, district: e.target.value })
              }
            />
          </div>
        </div>

        {/* 3. 核心商圈 */}
        <div className="flex flex-col gap-1.5">
          <FieldLabel>核心商圈</FieldLabel>
          <Input
            placeholder="例如: 彭浦"
            className="h-12 text-base"
            value={formData.businessArea}
            onChange={(e) =>
              setFormData({ ...formData, businessArea: e.target.value })
            }
          />
        </div>

        {/* 4. 物理指标与价格（分组卡片） */}
        <div className="bg-muted/50 rounded-2xl border border-border p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Ruler className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">
              物理指标与价格
            </span>
          </div>

          {/* 房源户型 */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel>房源户型</FieldLabel>
            <LayoutInputs
              value={formData.layout}
              onChange={(l) =>
                setFormData((prev) => ({ ...prev, layout: l }))
              }
            />
          </div>

          {/* 面积 */}
          <div className="flex flex-col gap-1.5" data-testid="field-area">
            <FieldLabel required>面积 (㎡)</FieldLabel>
            <Input
              type="number"
              step="0.1"
              inputMode="decimal"
              placeholder="例如: 89.5"
              className="h-12 text-base font-bold"
              value={formData.area}
              onChange={(e) =>
                setFormData({ ...formData, area: e.target.value })
              }
            />
          </div>

          {/* 朝向 */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel>朝向</FieldLabel>
            <select
              className="h-12 w-full px-4 rounded-xl bg-background border border-input text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
              value={formData.orientation}
              onChange={(e) =>
                setFormData({ ...formData, orientation: e.target.value })
              }
            >
              {ORIENTATION_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          {/* 楼层/总高 */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel>楼层/总高</FieldLabel>
            <FloorInput
              value={formData.floorInfo}
              onChange={(floorInfo) =>
                setFormData({ ...formData, floorInfo })
              }
            />
          </div>

          {/* 用户报价 */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required>用户报价 (万)</FieldLabel>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="例如: 600"
              className="h-12 text-base font-black text-primary border-primary/20"
              value={formData.totalPrice}
              onChange={(e) =>
                setFormData({ ...formData, totalPrice: e.target.value })
              }
            />
          </div>

          {/* 计算单价（只读） */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel>计算单价</FieldLabel>
            <div className="h-12 flex items-center px-4 bg-background rounded-xl text-sm font-bold text-muted-foreground">
              {calculatedUnitPrice} 万/㎡
            </div>
          </div>
        </div>

        {/* 5. 房源实拍（ImageUpload 自带 label） */}
        <ImageUpload images={images} onChange={setImages} />

        {/* 6. 补充信息 */}
        <div className="flex flex-col gap-1.5">
          <FieldLabel>补充信息</FieldLabel>
          <Textarea
            rows={4}
            placeholder="输入房源核心优势、业主动机等..."
            className="min-h-24 text-base focus-visible:ring-primary/20"
            value={formData.remarks}
            onChange={(e) =>
              setFormData({ ...formData, remarks: e.target.value })
            }
          />
        </div>
        </div>

        {/* Footer (shrink-0，自然贴底，浮动在 Tab Bar 上方) */}
        <footer className="shrink-0 bg-card/95 backdrop-blur-xl border-t border-border p-4">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-12 w-full bg-primary text-primary-foreground text-base font-bold rounded-xl hover:bg-primary/90"
          >
            {isSubmitting ? "提交中..." : "确认录入线索"}
          </Button>
        </footer>
      </form>
    </div>
  );
}
