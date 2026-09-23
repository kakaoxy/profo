/**
 * 户型图取数工具（取图规则与后台 admin/properties/columns.tsx 的 getFloorPlan 等价移植）.
 *
 * 房源缩略图按数据源（贝壳 / 我爱我家 / 其他）匹配 picture_links 中的户型图：
 * - 贝壳：hdic-frame → 第3张 → 第1张，并对 ljcdn.com 外站 URL 追加 CDN 裁剪参数；
 * - 我爱我家：floorplan/layout → 最后一张，并按列表展示尺寸改写 5i5j CDN 处理参数；
 * - 其他：默认第一张。
 * 无合法图片时返回 null，由调用方渲染 SVG 占位。
 *
 * ⚠️ 与后台的差异：后台同名函数不做「我爱我家缩略图尺寸改写」，本文件的尺寸策略
 * 仅作用于小程序列表；后台侧若需同步，须另行确认其列表展示尺寸。
 */

/**
 * 列表缩略图目标宽度（px）.
 *
 * 展示框为 128rpx×144rpx，3x 屏约合 192×216 物理像素，取 240 留余量。
 */
const THUMB_WIDTH = 240;

/** 列表缩略图目标质量（1-100）. */
const THUMB_QUALITY = 70;

/**
 * 将我爱我家（5i5j.com）图片的处理参数改写为列表缩略图尺寸.
 *
 * 5i5j CDN 与阿里云 OSS 同源，支持 `x-image-process`；实测把已有参数改写为
 * `image/resize,w_240/quality,q_70` 后单图由 280~586KB 降至 14~25KB（HTTP 200）。
 * 仅处理 host 含 5i5j.com 的 URL，避免误改其他外站图；URL 无该参数时追加
 * （若对方 CDN 不识别则原图返回，不会加载失败）。
 *
 * 注意：小程序运行环境不支持 URL 构造函数，故用正则判断 host。
 */
function applyThumbSizeFor5i5j(url: string): string {
  if (!/^https?:\/\/[^/]*5i5j\.com\//i.test(url)) {
    return url;
  }
  const process = `image/resize,w_${THUMB_WIDTH}/quality,q_${THUMB_QUALITY}`;
  if (/[?&]x-image-process=/i.test(url)) {
    return url.replace(/([?&]x-image-process=)[^&]*/i, `$1${process}`);
  }
  return `${url}${url.includes("?") ? "&" : "?"}x-image-process=${process}`;
}

/**
 * 清洗 URL 字符串：去除首尾空格和可能包裹的反引号/引号.
 *
 * 数据库脏数据可能包含 Markdown 反引号或引号包裹的 URL，如
 * `` `https://example.com/img.jpg` `` 或 `"https://..."`，
 * 导致正则校验失败。此函数去除最多两层成对包裹字符。
 */
export function cleanUrl(str: string): string {
  let s = str.trim();
  for (let i = 0; i < 2; i++) {
    if (
      s.length >= 2 &&
      ((s.startsWith("`") && s.endsWith("`")) ||
        (s.startsWith("'") && s.endsWith("'")) ||
        (s.startsWith('"') && s.endsWith('"')))
    ) {
      s = s.slice(1, -1).trim();
    } else {
      break;
    }
  }
  return s;
}

/**
 * 校验字符串是否为合法的绝对 URL（http/https）或相对路径.
 * 过滤数据库中的脏数据如 "q_80" 等非 URL 字符串.
 *
 * 注意：微信小程序运行环境不支持 URL 构造函数（new URL() 会抛
 * "URL is not a constructor"），因此使用正则表达式校验。
 */
export function isValidUrl(str: string): boolean {
  const cleaned = cleanUrl(str);
  if (cleaned.startsWith("/")) {
    return true; // 相对路径视为有效
  }
  return /^https?:\/\/[^\s]+/i.test(cleaned);
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
  // 过滤脏数据（如 "q_80"），只保留合法 URL；同时清洗首尾反引号/引号/空格
  const validLinks = links?.map(cleanUrl).filter(isValidUrl);
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
    // 仅链家 CDN（ljcdn.com）需要追加裁剪指令；OSS / 本地路径追加会导致对象 key
    // 包含参数而 404。与后端 _apply_cdn_params 逻辑对齐。
    if (imageUrl && !imageUrl.includes("!m_fill") && imageUrl.includes("ljcdn.com")) {
      imageUrl += "!m_fill,w_1000,h_750,l_bk,f_jpg,ls_50";
    }
  } else if (source === "我爱我家") {
    // 优先级：匹配到的 -> 最后一张；随后按列表展示尺寸改写 5i5j CDN 处理参数
    const picked = floorPlanImage || validLinks[validLinks.length - 1];
    imageUrl = picked ? applyThumbSizeFor5i5j(picked) : picked;
  } else {
    // 其他来源：默认显示第一张图
    imageUrl = validLinks[0];
  }

  return imageUrl || null;
}