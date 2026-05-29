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
      <div className="rounded-xl bg-white p-6 shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-c-border-subtle">
        <h3 className="text-lg font-bold text-c-trust-blue mb-4">为什么选择美房宝？</h3>
        <ul className="space-y-3">
          {BULLET_POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <Icon className="h-5 w-5 text-c-action-gold shrink-0" />
              <span className="text-sm text-c-text-primary">{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative rounded-xl overflow-hidden h-48 shadow-[0px_4px_20px_rgba(15,23,42,0.05)]">
        <div className="absolute inset-0 bg-linear-to-br from-c-trust-blue to-slate-800" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6">
          <span className="text-4xl font-bold">400+</span>
          <span className="mt-1 text-sm text-white/70">业主信赖之选</span>
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-c-border-subtle">
        <h3 className="text-lg font-bold text-c-trust-blue mb-4">近期成交参考</h3>
        {soldData?.items && soldData.items.length > 0 ? (
          <ul className="space-y-3">
            {soldData.items.map((project) => (
              <li
                key={project.id}
                className="flex items-center justify-between py-2 border-b border-c-border-subtle last:border-b-0"
              >
                <div>
                  <p className="text-sm font-medium text-c-text-primary">
                    {project.community_name ?? "未知小区"}
                  </p>
                  <p className="text-xs text-c-text-secondary">
                    {project.area}㎡ · {project.layout}
                  </p>
                </div>
                <span className="text-sm font-bold text-c-trust-blue">
                  {project.total_price}万
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-c-text-secondary">暂无成交参考</p>
        )}
        <Link
          href="/c/contact"
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-c-action-gold hover:underline"
        >
          查看更多案例
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
