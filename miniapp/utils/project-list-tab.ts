/**
 * 房源列表状态 tab 的跨页暂存：服务页等 tabBar 页跳转到房源列表时，
 * `wx.switchTab` 不支持携带 query 参数，故用模块级内存暂存待切换 tab，
 * 由房源列表页 `onShow` 消费并清除。
 */
/** 待切换的房源列表状态 tab. */
type PendingProjectTab = "sold";

let pendingTab: PendingProjectTab | null = null;

/** 写入待切换 tab（跳转前调用）. */
export function setProjectListPendingTab(tab: PendingProjectTab): void {
  pendingTab = tab;
}

/** 读取并清除待切换 tab（目标页 onShow 时调用）；无 pending 返回 null. */
export function consumeProjectListPendingTab(): PendingProjectTab | null {
  const t = pendingTab;
  pendingTab = null;
  return t;
}
