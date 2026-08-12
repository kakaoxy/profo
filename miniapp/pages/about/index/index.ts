import type { components } from "../../../types/api-types";
import { request } from "../../../utils/request";

/** 平台统计（取 total_sold 作为累计服务家庭数）. */
type PublicPlatformStats = components["schemas"]["PublicPlatformStats"];

/** 千位分隔符格式化（NaN/负数兜底返回 "0"）. */
function formatThousands(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

interface FaqItem {
  q: string;
  a: string;
  open: boolean;
}

interface PageData {
  faqList: FaqItem[];
  // 累计服务家庭数标签
  servedCountTotal: number;
  servedCountDisplay: string;
  servedCountLoading: boolean;
  servedCountVisible: boolean;
}

interface PageCustom {
  onLoad(): void;
  onUnload(): void;
  onGoValuation(): void;
  onToggleFaq(e: WechatMiniprogram.BaseEvent): void;
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent;
  onShareTimeline(): WechatMiniprogram.Page.ICustomTimelineContent;
  loadServedCount(): void;
  animateServedCount(target: number): void;
  clearServedCountTimer(): void;
  servedCountTimer: ReturnType<typeof setInterval> | null;
}

Page<PageData, PageCustom>({
  data: {
    faqList: [
      {
        q: "约定价格会不会被压低？",
        a: "约定价格基于周边真实成交数据商定，写进合同；公司利益绑定，没有压低价格的动机。",
        open: false,
      },
      {
        q: "真的免费送装修，有隐藏条件吗？",
        a: "未售出则装修无偿赠送，写在合同里，没有额外收费或隐藏条件。",
        open: false,
      },
      {
        q: "65天不能看房，值不值？",
        a: "装修期专职团队全包，换来的是更好卖相与更高的成交价，业主零投入、零操心。",
        open: false,
      },
      {
        q: "你们怎么赚钱？",
        a: "公司赚的是「卖超约定价」的溢价部分，卖得越高公司赚得越多，和业主利益一致。",
        open: false,
      },
    ],
    servedCountTotal: 0,
    servedCountDisplay: "0",
    servedCountLoading: false,
    servedCountVisible: true,
  },
  servedCountTimer: null,
  onLoad() {
    wx.showShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
    this.loadServedCount();
  },
  onUnload() {
    this.clearServedCountTimer();
  },
  onGoValuation() {
    wx.switchTab({ url: "/pages/valuation/submit/index" });
  },
  onToggleFaq(e: WechatMiniprogram.BaseEvent) {
    const index = e.currentTarget.dataset.index as number;
    this.setData({
      ["faqList[" + index + "].open"]: !this.data.faqList[index].open,
    });
  },
  onShareAppMessage() {
    return {
      title: "零现金焕新，全流程托管，点击了解您的房价",
      path: "/pages/about/index/index",
      imageUrl: "/assets/share.jpg",
    };
  },
  onShareTimeline() {
    return {
      title: "零现金焕新，全流程托管，点击了解您的房价",
      query: "",
      imageUrl: "/assets/share.jpg",
    };
  },
  /** 拉取平台统计 total_sold（公开接口，skipAuth），成功后从 0 缓动. */
  async loadServedCount() {
    this.clearServedCountTimer();
    this.setData({
      servedCountVisible: true,
      servedCountLoading: true,
      servedCountTotal: 0,
      servedCountDisplay: "0",
    });
    try {
      const res = await request<PublicPlatformStats>({
        url: "/public/stats/platform",
        skipAuth: true,
      });
      const total = Math.max(0, Math.floor(res.total_sold || 0));
      this.setData({ servedCountTotal: total, servedCountLoading: false });
      this.animateServedCount(total);
    } catch {
      this.setData({ servedCountVisible: false, servedCountLoading: false });
    }
  },
  /** 从 0 缓动到 target（约 1.2s ease-out）. */
  animateServedCount(target: number) {
    this.clearServedCountTimer();
    if (target <= 0) {
      this.setData({ servedCountDisplay: "0" });
      return;
    }
    const duration = 1200;
    const start = Date.now();
    this.servedCountTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / duration);
      const progress = 1 - (1 - t) * (1 - t);
      const current = Math.floor(target * progress);
      this.setData({ servedCountDisplay: formatThousands(current) });
      if (t >= 1) {
        this.setData({ servedCountDisplay: formatThousands(target) });
        this.clearServedCountTimer();
      }
    }, 16);
  },
  clearServedCountTimer() {
    if (this.servedCountTimer) {
      clearInterval(this.servedCountTimer);
      this.servedCountTimer = null;
    }
  },
});
