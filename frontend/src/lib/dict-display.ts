/**
 * 楼盘字典展示口径（BR-29：楼栋号量词不重复追加）.
 *
 * 背景：``bd_buildings.building_no`` 原样存储（BR-03 不做数字化抽取），而展示层
 * 历来硬编码 ``${buildingNo}号``。运营录入「金杨路660弄21号」时会被拼成
 * 「金杨路660弄21号号」；库内还有「2号楼」「单栋」「A栋」等自带量词的写法，
 * 同样会被拼坏。
 *
 * 口径（与后端 ``utils/building_dict.normalize_building_no`` / ``has_building_suffix``
 * 同源，改一处必须同步另一处）：
 * - 写入层：尾部单个「号」自动剥离（``21号`` → ``21``）；
 * - 展示层：**已自带量词则原样，否则补一个「号」** —— 两边恒等，且对历史
 *   4477 条以「号」结尾的存量数据同样正确（不依赖清洗）。
 */

/** 楼栋号是否已自带量词（号/号楼/栋/幢/单元/弄）—— 与后端 has_building_suffix 同源 */
export function hasBuildingSuffix(buildingNo: string | null | undefined): boolean {
  const s = (buildingNo ?? "").trim();
  if (!s) return false;
  return /(号|号楼|栋|幢|单元|弄)$/.test(s);
}

/** 楼栋展示文案：自带量词原样，否则补「号」（空值返回空串，便于 filter(Boolean)） */
export function formatBuildingLabel(buildingNo: string | null | undefined): string {
  const s = (buildingNo ?? "").trim();
  if (!s) return "";
  return hasBuildingSuffix(s) ? s : `${s}号`;
}

/**
 * 门牌预览：小区名 + 楼栋展示 + 户号映射（0401→401）.
 *
 * 例：``formatPlate("金杨七街坊", "660弄21", "401")`` → ``"金杨七街坊 660弄21号 401"``
 */
export function formatPlate(
  communityName: string | null | undefined,
  buildingNo: string | null | undefined,
  plateNo?: string | null,
): string {
  return [communityName ?? "", formatBuildingLabel(buildingNo), plateNo ?? ""].filter(Boolean).join(" ");
}

/**
 * 楼栋号量词归一的**前端预览**（BR-29）.
 *
 * 只用于审核弹层「将保存为」实时对照，真正落库以后端为准（后端同样规则）。
 * 刻意只剥尾部单个「号」，与后端保持一致 —— 剥「号楼」会让「2号楼」丢失原文语义。
 */
export function previewNormalizedBuildingNo(raw: string | null | undefined): string {
  const collapsed = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!collapsed) return "";
  const stripped = collapsed.replace(/号$/, "").trim();
  // 回退保护：纯「号」剥完为空 → 保留原文（与后端 normalize_building_no 同口径）
  return stripped || collapsed;
}
