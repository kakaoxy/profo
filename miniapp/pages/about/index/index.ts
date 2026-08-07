interface FaqItem {
  q: string;
  a: string;
  open: boolean;
}

interface PageData {
  faqList: FaqItem[];
}

interface PageCustom {
  onGoValuation(): void;
  onToggleFaq(e: WechatMiniprogram.BaseEvent): void;
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
});
