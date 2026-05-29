import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "免费卖房估价 - 美房宝 | Profo",
  description: "输入房源信息，免费获取专业估价师基于真实成交数据的房产评估报告。",
  openGraph: {
    title: "免费卖房估价 - 美房宝 | Profo",
    description: "输入房源信息，免费获取专业估价师基于真实成交数据的房产评估报告。",
    url: "/c/valuation",
  },
};

export default function ValuationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
