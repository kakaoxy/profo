// 与 floor-plan.ts 逻辑完全一致（去掉类型注解），改动需同步两侧
// 户型图取数工具（与后台 admin/properties/columns.tsx 的 getFloorPlan 等价移植）

// 校验字符串是否为合法的绝对 URL（http/https）或相对路径
export function isValidUrl(str) {
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

// 按数据源匹配户型图 URL；无合法图返回 null
export function getFloorPlan(dataSource, links) {
  // 过滤脏数据（如 "q_80"），只保留合法 URL
  const validLinks = links && links.filter(isValidUrl);
  if (!validLinks || validLinks.length === 0) {
    return null;
  }

  const source = dataSource || "";
  let hdicFrameImage;
  let floorPlanImage;

  // 单次循环：同时匹配 hdic-frame 与 floorplan/layout
  for (const link of validLinks) {
    const lower = link.toLowerCase();
    if (!hdicFrameImage && lower.indexOf("hdic-frame") >= 0) {
      hdicFrameImage = link;
    }
    if (
      !floorPlanImage &&
      (lower.indexOf("floorplan") >= 0 || lower.indexOf("layout") >= 0)
    ) {
      floorPlanImage = link;
    }
    if (hdicFrameImage && floorPlanImage) {
      break;
    }
  }

  let imageUrl;

  if (source === "贝壳") {
    // 优先级：hdic-frame -> 第3张 -> 第1张（越界访问返回 undefined，逻辑安全）
    imageUrl = hdicFrameImage || validLinks[2] || validLinks[0];
    // 添加 CDN 裁剪参数
    if (imageUrl && imageUrl.indexOf("!m_fill") < 0) {
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