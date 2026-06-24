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
    <div className="fixed bottom-20 md:bottom-0 inset-x-0 z-40 border-t border-dove/30 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-3 px-4">
        <button
          onClick={handleCopyWechat}
          className="flex flex-1 items-center justify-center gap-2 h-11 rounded-full bg-fog text-ink text-sm font-medium hover:bg-fog/80 transition-colors"
        >
          <Copy className="h-4 w-4" />
          添加微信
        </button>
        <a
          href={`tel:${phone}`}
          className="flex flex-1 items-center justify-center gap-2 h-11 rounded-full bg-ink text-white text-sm font-medium hover:bg-ink/90 transition-colors"
        >
          <Phone className="h-4 w-4" />
          电话联系
        </a>
      </div>
    </div>
  );
}
