import { startOfWeek } from "date-fns";
import { toNumber } from "@/lib/number-utils";
import type { ApiSalesRecord } from "./project-card-types";

export type { ApiSalesRecord } from "./project-card-types";

export function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

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

  const sortedOffers = [...offerRecords].sort(
    (a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime()
  );

  const offerPrices = sortedOffers
    .map(r => toNumber(r.price))
    .filter((p): p is number => p !== undefined);

  const maxOffer = sortedOffers.length > 0 && offerPrices.length > 0 ? Math.max(...offerPrices) : 0;
  const lastOffer = sortedOffers.length > 0 ? toNumber(sortedOffers[0].price) ?? 0 : 0;

  return { offerCount, maxOffer, lastOffer };
}

export { mapProjectResponseToProject } from "./project-card-mapper";
export { toNumber } from "@/lib/number-utils";