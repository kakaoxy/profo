"use client";

import { Copy, Phone } from "lucide-react";
import { toast } from "sonner";

interface ConsultantBarProps {
  wechatNumber: string;
  phone: string;
}

export function ConsultantBar({ wechatNumber, phone }: ConsultantBarProps) {
  const handleCopyWechat = async () => {
    try {
      await navigator.clipboard.writeText(wechatNumber);
      toast.success("微信号已复制到剪贴板");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 border-t border-dove/30 bg-white/80 backdrop-blur overscroll-behavior-contain" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-3 px-4">
        {/* Secondary action: text-link style per DESIGN.md (one filled button per screen max) */}
        <button
          onClick={handleCopyWechat}
          aria-label={`复制微信号：${wechatNumber}`}
          className="flex flex-1 items-center justify-center gap-2 h-11 rounded-full text-ink text-sm font-medium hover:bg-fog/80 focus-visible:ring-2 focus-visible:ring-ink/20 transition-colors"
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          添加微信
        </button>
        {/* Primary CTA: Ink filled pill — one per screen */}
        <a
          href={`tel:${phone}`}
          className="flex flex-1 items-center justify-center gap-2 h-11 rounded-full bg-ink text-white text-[15px] font-medium tracking-[-0.009em] hover:bg-ink/90 focus-visible:ring-2 focus-visible:ring-ink/40 transition-colors"
          style={{ touchAction: "manipulation" }}
        >
          <Phone className="h-4 w-4" aria-hidden="true" />
          电话联系
        </a>
      </div>
    </div>
  );
}
