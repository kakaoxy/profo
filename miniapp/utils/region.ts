/**
 * 区域（区县）匹配工具（REQ-IT1-04）：地图选点后按地址文本回填系统区域字典.
 */

/**
 * 从选点地址/名称文本中匹配系统区域，返回命中的最长区域名，未命中返回空串.
 * 取最长命中，避免短名区域抢占（如地址同时包含「浦东」与「浦东新区」时取后者）.
 */
export function matchDistrict(address: string, placeName: string, districts: string[]): string {
  const text = `${address || ""} ${placeName || ""}`;
  let matched = "";
  for (const district of districts) {
    const name = (district || "").trim();
    if (name && text.includes(name) && name.length > matched.length) {
      matched = name;
    }
  }
  return matched;
}
