/**
 * 匿名访客 ID（房源/评估埋点 UV 去重键）.
 *
 * 前端生成 uuid v4 并缓存于 storage，跨会话保持稳定；
 * 免登录场景（房源详情页/估价页访客埋点）以此做 UV 去重。
 * ⚠️ 口径与招募的 openid_hash（需登录）不同，数值不可横向对比。
 */

const VISITOR_ID_KEY = "profo_visitor_id";

/** 生成 uuid v4 格式字符串（Math.random 随机源，满足 UV 去重强度）. */
function generateUuidV4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 读取（不存在则生成并缓存）匿名访客 ID. */
export function getVisitorId(): string {
  const cached = wx.getStorageSync(VISITOR_ID_KEY);
  if (typeof cached === "string" && cached) {
    return cached;
  }
  const id = generateUuidV4();
  wx.setStorageSync(VISITOR_ID_KEY, id);
  return id;
}
