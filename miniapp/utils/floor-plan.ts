/**
 * 户型图取数工具（与后台 admin/properties/columns.tsx 的 getFloorPlan 等价移植）.
 *
 * 房源缩略图按数据源（贝壳 / 我爱我家 / 其他）匹配 picture_links 中的户型图：
 * - 贝壳：hdic-frame → 第3张 → 第1张，并追加 CDN 裁剪参数；
 * - 我爱我家：floorplan/layout → 最后一张；
 * - 其他：默认第一张。
 * 无合法图片时返回 null，由调用方渲染 SVG 占位。
 */

/**
 * 校验字符串是否为合法的绝对 URL（http/https）或相对路径.
 * 过滤数据库中的脏数据如 "q_80" 等非 URL 字符串.
 */
export function isValidUrl(str: string): boolean {
  if (str.startsWith("/")) {
    return true; // 相对路径视为有效
  }
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * 按数据源匹配户型图 URL；无合法图返回 null.
 *
 * @param dataSource 数据源（贝壳 / 我爱我家 / 其他）
 * @param links 房源图片链接列表
 */
export function getFloorPlan(
  dataSource: string | null | undefined,
  links: string[] | null | undefined,
): string | null {
  // 过滤脏数据（如 "q_80"），只保留合法 URL
  const validLinks = links?.filter(isValidUrl);
  if (!validLinks || validLinks.length === 0) {
    return null;
  }

  const source = dataSource || "";
  let hdicFrameImage: string | undefined;
  let floorPlanImage: string | undefined;

  // 单次循环：同时匹配 hdic-frame 与 floorplan/layout，缓存 toLowerCase 结果
  for (const link of validLinks) {
    const lower = link.toLowerCase();
    if (!hdicFrameImage && lower.includes("hdic-frame")) {
      hdicFrameImage = link;
    }
    if (
      !floorPlanImage &&
      (lower.includes("floorplan") || lower.includes("layout"))
    ) {
      floorPlanImage = link;
    }
    if (hdicFrameImage && floorPlanImage) {
      break;
    }
  }

  let imageUrl: string | undefined;

  if (source === "贝壳") {
    // 优先级：hdic-frame -> 第3张 -> 第1张（JS 数组越界访问返回 undefined，逻辑安全）
    imageUrl = hdicFrameImage || validLinks[2] || validLinks[0];
    // 添加 CDN 裁剪参数
    if (imageUrl && !imageUrl.includes("!m_fill")) {
      imageUrl += "!m_fill,w_1000,h_750,l_bk,f_jpg,ls_50";
    }
  } else if (source === "我爱我家") {
    // 优先级：匹配到的 -> 最后一张
    imageUrl = floorPlanImage || validLinks[validLinks.length - 1];
  } else {
    // 其他来源：默认显示第一张图
    imageUrl = validLinks[0];
  }

  return imageUrl || null;
}