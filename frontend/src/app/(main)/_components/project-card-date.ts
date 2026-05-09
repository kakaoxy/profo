import { startOfWeek } from "date-fns";

export function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}
//获取指定日期所在周的周一（按日历周计算）
