"use client";

import useSWR from "swr";
import Link from "next/link";
import { Verified, Zap, Lock, TrendingUp, ArrowRight } from "lucide-react";

interface SoldProject {
  id: number;
  community_name: string | null;
  layout: string;
  area: number;
  total_price: number;
}

interface SoldListResponse {
  items: SoldProject[];
  total: number;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Failed to fetch");
    return r.json();
  });

const BULLET_POINTS = [
  { icon: Verified, text: "专业估价师一对一服务" },
  { icon: Zap, text: "最快24小时出具报告" },
  { icon: Lock, text: "信息严格保密，安全可靠" },
  { icon: TrendingUp, text: "基于真实成交数据定价" },
];

export function ValuationSidebar() {
  const { data: soldData } = useSWR<SoldListResponse>(
    "/api/v1/public/projects/sold?pageSize=2",
    fetcher
  );

  return (
    <div className="space-y-6">
      <div className="rounded-cards bg-white p-6 shadow-steep border border-dove/30">
        <h3 className="text-lg font-medium text-ink mb-4">为什么选择美房宝？</h3>
        <ul className="space-y-3">
          {BULLET_POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <Icon className="h-5 w-5 text-rust shrink-0" />
              <span className="text-sm text-ink">{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative rounded-cards overflow-hidden h-48 bg-apricot-wash shadow-steep-sm">
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
          <span className="text-4xl font-medium text-rust">400+</span>
          <span className="mt-1 text-sm text-ash">业主信赖之选</span>
        </div>
      </div>

      <div className="rounded-cards bg-white p-6 shadow-steep border border-dove/30">
        <h3 className="text-lg font-medium text-ink mb-4">近期成交参考</h3>
        {soldData?.items && soldData.items.length > 0 ? (
          <ul className="space-y-3">
            {soldData.items.map((project) => (
              <li
                key={project.id}
                className="flex items-center justify-between py-2 border-b border-dove/30 last:border-b-0"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {project.community_name ?? "未知小区"}
                  </p>
                  <p className="text-xs text-ash">
                    {project.area}㎡ · {project.layout}
                  </p>
                </div>
                <span className="text-sm font-medium text-rust">
                  {project.total_price}万
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ash">暂无成交参考</p>
        )}
        <Link
          href="/contact"
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-rust hover:underline"
        >
          查看更多案例
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
