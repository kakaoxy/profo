"use client";

import { useCurrentDate } from "@/hooks/use-current-date";
import { Project } from "../../../../types";
import { differenceInDays, parseISO, isValid } from "date-fns";
import { safeFormatDate } from "@/lib/formatters";

/** 万文案：去掉多余的 .0 尾数（38.0 → 38） */
function formatWan(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

export function HeroMetrics({ project }: { project: Project }) {
  const today = useCurrentDate();

  // ---- 取数（沿用旧版缓存字段：net_cash_flow / roi / days_on_market） ----
  const netProfit = Number(project.net_cash_flow) || 0; // 元
  const roi = Number(project.roi) || 0; // %
  const soldPrice = Number(project.sold_price || 0); // 万
  const signingPrice = Number(project.signing_price || 0); // 万
  const area = Number(project.area || 0); // ㎡

  const rawSoldDate = project.sold_at || project.sold_date;
  const soldDateDisplay = safeFormatDate(rawSoldDate, "yyyy.MM.dd", "--");

  // 资金占用天数（原「资金占用」指标：签约 → 成交，未成交时取今天）
  const rawStartDate = project.signing_date || project.created_at;
  const signingDate = rawStartDate ? parseISO(rawStartDate) : null;
  const soldDate = rawSoldDate ? parseISO(rawSoldDate) : null;

  let occupationDays = 0;
  if (signingDate && isValid(signingDate)) {
    const end = soldDate && isValid(soldDate) ? soldDate : today || new Date();
    occupationDays = Math.max(0, differenceInDays(end, signingDate));
  }
  // 年化收益率（原「年化收益率」指标：ROI 按占用天数简单年化）
  const safeDays = occupationDays > 0 ? occupationDays : 1;
  const annualizedRoR = occupationDays > 0 ? (roi / safeDays) * 365 : 0;

  // 售出天数：优先后端 days_on_market（sold - listing），缺省前端补算
  const listingDate = project.listing_date ? parseISO(project.listing_date) : null;
  let daysOnMarket = project.days_on_market ?? null;
  if (
    daysOnMarket == null &&
    listingDate &&
    isValid(listingDate) &&
    soldDate &&
    isValid(soldDate)
  ) {
    daysOnMarket = Math.max(0, differenceInDays(soldDate, listingDate));
  }

  // ---- 指标 ①：成交总价（44px 衬线 Rust） ----
  const soldDeltaParts: string[] = [];
  if (signingPrice > 0 && soldPrice > 0) {
    const diff = soldPrice - signingPrice;
    soldDeltaParts.push(`较签约价 ${diff >= 0 ? "+" : "-"}${formatWan(Math.abs(diff))} 万`);
  }
  if (soldPrice > 0 && area > 0) {
    soldDeltaParts.push(`单价 ${(soldPrice / area).toFixed(2)} 万/㎡`);
  }

  // ---- 指标 ②：成交日期（delta = 渠道信息，无则省略） ----
  const channelName = project.channel_manager?.trim() || null;

  // ---- 指标 ③：售出天数（delta = 上架 → 成交，融入原「资金占用」数据） ----
  const listingShort = safeFormatDate(project.listing_date, "MM.dd", "");
  const soldShort = safeFormatDate(rawSoldDate, "MM.dd", "");
  const soldDaysDeltaParts: string[] = [];
  if (listingShort && soldShort) {
    soldDaysDeltaParts.push(`上架 ${listingShort} → 成交 ${soldShort}`);
  }
  if (occupationDays > 0) {
    soldDaysDeltaParts.push(`资金占用 ${occupationDays} 天`);
  }

  // ---- 指标 ④：净回报率（= 原「投资回报率」，delta 融入净利润 + 年化） ----
  const roiDeltaParts: string[] = [`净利润 ${formatWan(netProfit / 10000)} 万（详见账本）`];
  if (annualizedRoR > 0) {
    roiDeltaParts.push(`年化 ${annualizedRoR.toFixed(1)}%`);
  }

  return (
    <div className="mt-6">
      {/* 成交总览 · 4 指标 warm 大卡（apricot 底 / 无阴影） */}
      <div className="rounded-cards bg-apricot-wash p-7">
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4">
          {/* ① 成交总价 */}
          <div>
            <div className="text-[13px] font-[450] text-graphite">成交总价</div>
            <div className="mt-1.5 flex items-baseline gap-1 font-signifier text-[44px] font-[480] leading-[1.1] text-rust">
              {soldPrice > 0 ? formatWan(soldPrice) : "--"}
              <span className="text-sm font-[430] text-graphite">万</span>
            </div>
            {soldDeltaParts.length > 0 && (
              <div className="mt-1.5 text-[12.5px] font-[430] leading-relaxed text-graphite">
                {soldDeltaParts.join(" · ")}
              </div>
            )}
          </div>

          {/* ② 成交日期 */}
          <div>
            <div className="text-[13px] font-[450] text-graphite">成交日期</div>
            <div className="mt-2.5 text-[26px] font-[480] leading-[1.15] tracking-[-0.02em] tabular-nums text-ink">
              {soldDateDisplay}
            </div>
            {channelName && (
              <div className="mt-2 text-[12.5px] font-[430] text-graphite">
                渠道 · {channelName}
              </div>
            )}
          </div>

          {/* ③ 售出天数 */}
          <div>
            <div className="text-[13px] font-[450] text-graphite">售出天数</div>
            <div className="mt-2.5 flex items-baseline gap-1 text-[26px] font-[480] leading-[1.15] tracking-[-0.02em] tabular-nums text-ink">
              {daysOnMarket != null ? daysOnMarket : "--"}
              <span className="text-sm font-[430] text-graphite">天</span>
            </div>
            {soldDaysDeltaParts.length > 0 && (
              <div className="mt-2 text-[12.5px] font-[430] leading-relaxed text-graphite">
                {soldDaysDeltaParts.join(" · ")}
              </div>
            )}
          </div>

          {/* ④ 净回报率 */}
          <div>
            <div className="text-[13px] font-[450] text-graphite">净回报率</div>
            <div className="mt-2.5 flex items-baseline gap-0.5 text-[26px] font-[480] leading-[1.15] tracking-[-0.02em] tabular-nums text-ink">
              {roi.toFixed(1)}
              <span className="text-sm font-[430] text-graphite">%</span>
            </div>
            {roiDeltaParts.length > 0 && (
              <div className="mt-2 text-[12.5px] font-[430] leading-relaxed text-graphite">
                {roiDeltaParts.join(" · ")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
