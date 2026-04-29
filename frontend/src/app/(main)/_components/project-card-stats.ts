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

  const offerPrices = offerRecords
    .map(r => toNumber(r.price))
    .filter((p): p is number => p !== undefined);

  const maxOffer = offerPrices.length > 0 ? Math.max(...offerPrices) : 0;
  const lastOffer = offerPrices.length > 0 ? offerPrices[offerPrices.length - 1] : 0;

  return { offerCount, maxOffer, lastOffer };
}
