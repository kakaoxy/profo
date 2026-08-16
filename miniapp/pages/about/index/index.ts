import { setProjectListPendingTab } from "../../../utils/project-list-tab";
import { animateServedCount, clearServedCountTimer, loadServedCount } from "../../../utils/served-count";

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
  onServedTagTap(): void;
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
  /** 累计服务标签点击：写入待切换 tab 后跳转房源列表（过往案例）. */
  onServedTagTap() {
    setProjectListPendingTab("sold");
    wx.switchTab({ url: "/pages/projects/list/index" });
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
    return loadServedCount(this);
  },
  /** 从 0 缓动到 target（约 1.2s ease-out）. */
  animateServedCount(target: number) {
    return animateServedCount(this, target);
  },
  clearServedCountTimer() {
    return clearServedCountTimer(this);
  },
});
