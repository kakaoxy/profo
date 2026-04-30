/**
 * 项目卡片统计计算函数
 */

import { toNumber } from "@/lib/number-utils";
import { getWeekStart } from "./project-card-date";
import type { ApiSalesRecord } from "./project-card-types";

export function getWeekViewStats(viewingRecords: ApiSalesRecord[]) {
  const now = new Date();
  const thisWeekStart = getWeekStart(now);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setMilliseconds(-1);

  const currentWeekViews = viewingRecords.filter(r => {
    const d = new Date(r.record_date);
    return d >= thisWeekStart;
  }).length;

  const lastWeekViews = viewingRecords.filter(r => {
    const d = new Date(r.record_date);
    return d >= lastWeekStart && d <= lastWeekEnd;
  }).length;

  return { currentWeekViews, lastWeekViews };
}

export function getOfferStats(offerRecords: ApiSalesRecord[]) {
  const offerCount = offerRecords.length;

  // 按日期降序排序，确保获取最新的记录
  const sortedOffers = [...offerRecords].sort(
    (a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime()
  );

  const offerPrices = sortedOffers
    .map(r => toNumber(r.price))
    .filter((p): p is number => p !== undefined);

  const maxOffer = offerPrices.length > 0 ? Math.max(...offerPrices) : 0;
  // 取按日期排序后最新的出价
  const lastOffer = sortedOffers.length > 0 ? toNumber(sortedOffers[0].price) ?? 0 : 0;

  return { offerCount, maxOffer, lastOffer };
}
