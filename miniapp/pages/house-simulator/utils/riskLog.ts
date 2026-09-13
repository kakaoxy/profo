/**
 * 购房模拟器 · 风险确认记录（本地持久化 + 追溯）.
 *
 * 记录用户对「违约风险 / 到手价税费风险」提示框的确认操作（含时间戳与内容摘要），
 * 作为交易凭证的一部分写入微信本地存储；同时镜像进 SimState.riskLog 供 final 屏渲染。
 * 本模块触碰 wx 存储 API，属于页面层工具；纯计算逻辑不在此列（见 calc.ts）。
 */

import type { RiskRecord } from "./constants";

/** 本地存储 key（交易凭证 · 风险确认记录）. */
const KEY = "houseSimRiskLog";

/** 读取本地风险确认记录（无 / 损坏时回退空数组）. */
export function readRiskLog(): RiskRecord[] {
  try {
    const v = wx.getStorageSync(KEY);
    return Array.isArray(v) ? (v as RiskRecord[]) : [];
  } catch {
    return [];
  }
}

/** 追加一条风险确认记录到本地存储（失败仅影响追溯，不阻断流程）并返回该记录. */
export function pushRiskLog(rec: RiskRecord): RiskRecord {
  const list = readRiskLog();
  list.push(rec);
  try {
    wx.setStorageSync(KEY, list);
  } catch {
    // 存储失败：继续模拟，不抛错
  }
  return rec;
}

/** 清空风险确认记录（重新开始模拟时调用，交易凭证随单次模拟生命周期结束）. */
export function clearRiskLog(): void {
  try {
    wx.removeStorageSync(KEY);
  } catch {
    // 存储失败：忽略
  }
}

/** 当前时间格式化：YYYY-MM-DD HH:mm:ss. */
export function fmtTs(d: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return (
    d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
    " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds())
  );
}