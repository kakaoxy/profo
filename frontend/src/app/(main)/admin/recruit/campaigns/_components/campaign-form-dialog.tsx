"use client";

import * as React from "react";
import Image from "next/image";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type {
  RecruitCampaign,
  RecruitCampaignStatus,
} from "../../types";
import { uploadCampaignImageAction } from "../../_lib/recruit-actions";

/** 表单提交数据（不含 id / created_at / updated_at，由父组件在本地状态中补全） */
export interface CampaignFormData {
  name: string;
  title: string;
  image_url: string | null;
  status: RecruitCampaignStatus;
}

interface CampaignFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 编辑模式传入待编辑活动，新建模式为 null */
  campaign: RecruitCampaign | null;
  /** 提交中状态（由父组件控制，禁用按钮防止重复提交） */
  submitting?: boolean;
  onSubmit: (data: CampaignFormData) => void;
}

/** 微信分享配图规范比例 5:4（建议 500×400），允许 ±0.02 容差 */
const ASPECT_RATIO = 5 / 4;
const ASPECT_TOLERANCE = 0.02;

/**
 * 活动新建 / 编辑共用表单弹窗，视觉对齐设计稿：
 * 头部标题 + 关闭，2 列表单（名称/标题/配图），底部「发布后立即启用」
 * 开关条与「保存并发布」按钮。
 * 配图前端校验 5:4 比例后上传至后端 /files/upload，返回 CDN URL。
 */
export function CampaignFormDialog({
  open,
  onOpenChange,
  campaign,
  submitting = false,
  onSubmit,
}: CampaignFormDialogProps) {
  const [name, setName] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [status, setStatus] =
    React.useState<RecruitCampaignStatus>("enabled");
  const [checkingImage, setCheckingImage] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // 打开弹窗 / 切换编辑对象时重置表单
  React.useEffect(() => {
    if (open) {
      setName(campaign?.name ?? "");
      setTitle(campaign?.title ?? "");
      setImageUrl(campaign?.image_url || null);
      setStatus(campaign?.status ?? "enabled");
      setCheckingImage(false);
    }
  }, [open, campaign]);

  /**
   * 选择配图：用 Image 对象读取图片真实宽高校验 5:4 比例；
   * 校验通过后上传至后端，返回 CDN URL 存入表单 image_url。
   */
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 清空 input，允许重复选择同一文件
    e.target.value = "";
    if (!file) return;

    // 先用 objectURL 读取宽高做 5:4 校验
    const objectUrl = URL.createObjectURL(file);
    const img = document.createElement("img");
    img.onload = async () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      URL.revokeObjectURL(objectUrl);

      if (Math.abs(ratio - ASPECT_RATIO) > ASPECT_TOLERANCE) {
        toast.error("分享配图需为 5:4 比例");
        setCheckingImage(false);
        return;
      }

      // 校验通过，上传至后端
      setCheckingImage(true);
      try {
        const result = await uploadCampaignImageAction(file);
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        setImageUrl(result.data.url);
        toast.success("配图校验通过，已上传");
      } catch {
        toast.error("图片上传失败，请重新选择");
      } finally {
        setCheckingImage(false);
      }
    };
    img.onerror = () => {
      toast.error("图片读取失败，请重新选择");
      URL.revokeObjectURL(objectUrl);
      setCheckingImage(false);
    };
    setCheckingImage(true);
    img.src = objectUrl;
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("请填写活动名称");
      return;
    }
    if (!title.trim()) {
      toast.error("请填写分享标题");
      return;
    }
    if (!imageUrl || imageUrl.trim() === "") {
      toast.error("请上传分享配图");
      return;
    }
    onSubmit({
      name: name.trim(),
      title: title.trim(),
      image_url: imageUrl,
      status,
    });
  };

  // 移除配图
  const handleRemoveImage = () => {
    setImageUrl(null);
  };

  const hasImage = imageUrl !== null && imageUrl.trim() !== "";
  const busy = checkingImage || submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-150 rounded-cards p-0 gap-0 bg-white"
      >
        <DialogHeader className="flex flex-row items-center justify-between px-6 py-5 border-b border-fog text-left">
          <DialogTitle className="text-base font-medium text-ink">
            {campaign ? "编辑活动" : "新建活动"}
          </DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-8 w-8 rounded-full flex items-center justify-center text-slate text-[15px] hover:bg-fog hover:text-ink transition-colors"
            aria-label="关闭"
          >
            ✕
          </button>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5 max-h-[64vh] overflow-y-auto">
          {/* 活动名称 */}
          <div className="flex flex-col gap-2">
            <label className="text-[14px] font-medium text-ink">
              活动名称<span className="text-rust ml-0.5">*</span>
            </label>
            <Input
              placeholder="如：2026 区域伙伴招募计划"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              className="h-9.5 rounded-inputs border-dove bg-white text-[14px] focus-visible:ring-ink/30"
            />
          </div>

          {/* 分享标题 */}
          <div className="flex flex-col gap-2">
            <label className="text-[14px] font-medium text-ink">
              分享标题<span className="text-rust ml-0.5">*</span>
            </label>
            <Input
              placeholder="分享卡片标题，如：零现金焕新，全流程托管"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              className="h-9.5 rounded-inputs border-dove bg-white text-[14px] focus-visible:ring-ink/30"
            />
            <div className="text-[12.5px] text-slate">
              微信转发卡片标题，员工分享时统一使用，不可自定义
            </div>
          </div>

          {/* 分享配图（前端校验 5:4 + 后端上传） */}
          <div className="flex flex-col gap-2">
            <label className="text-[14px] font-medium text-ink">
              分享配图<span className="text-rust ml-0.5">*</span>
            </label>
            <div className="flex items-center gap-3.5">
              <div className="relative w-30 h-24 rounded-images bg-fog border border-fog overflow-hidden shrink-0 flex items-center justify-center text-slate text-xs text-center leading-relaxed">
                {hasImage ? (
                  <Image
                    src={imageUrl as string}
                    alt="分享配图预览"
                    fill
                    className="object-cover"
                    sizes="120px"
                    unoptimized
                  />
                ) : (
                  <span>
                    5:4
                    <br />
                    封面
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-1.5 h-7.5 px-4 rounded-full bg-ink text-white text-[14px] font-medium hover:bg-black transition-colors disabled:opacity-50 shrink-0 self-start"
                >
                  {checkingImage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4" />
                  )}
                  上传图片
                </button>
                {hasImage && (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    disabled={busy}
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-slate hover:text-rust transition-colors disabled:opacity-50 self-start"
                  >
                    <X className="h-3.5 w-3.5" />
                    移除图片
                  </button>
                )}
                <span className="text-[12.5px] text-slate">
                  微信官方规范：长宽比 5:4（建议 500×400），PNG/JPG
                </span>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
              disabled={busy}
            />
          </div>

          {/* 发布后立即启用 */}
          <div className="flex items-center gap-3 bg-fog rounded-inputs px-4 py-3.5">
            <Switch
              checked={status === "enabled"}
              onCheckedChange={(checked) =>
                setStatus(checked ? "enabled" : "disabled")
              }
              className="data-[state=checked]:bg-ink data-[state=unchecked]:bg-dove"
              aria-label="发布后立即启用"
            />
            <label className="text-[14px] font-medium text-ink">
              发布后立即启用
            </label>
            <span className="ml-auto text-[12.5px] text-slate">
              停用后分享链路立即失效
            </span>
          </div>

          {/* 只读提示：详情内容一期使用运营默认模板 */}
          <div className="rounded-images bg-fog px-4 py-3.5 text-[12.5px] text-slate leading-relaxed">
            <b className="text-graphite font-medium">详情页内容说明：</b>
            招募详情页正文（权益 / 要求 / 福利）一期使用运营默认模板，不在此表单配置；
            二期支持可视化编辑。微信分享卡片仅展示「标题 + 5:4 配图」。
          </div>
        </div>

        <DialogFooter className="flex flex-row items-center justify-end gap-3.5 px-6 py-4.5 border-t border-fog">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="text-[14px] font-medium text-ink px-0.5 hover:opacity-60 transition-opacity disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-5 rounded-full bg-ink text-white text-[15px] font-medium hover:bg-black transition-colors disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            保存并发布
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
