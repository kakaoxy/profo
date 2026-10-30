/**
 * 楼栋号展示口径（与 admin `frontend/src/lib/dict-display.ts` 同源）.
 *
 * 库内 `building_no` 原样存储，可能自带「号 / 号楼 / 栋 / 幢 / 单元 / 弄」量词；
 * 展示时已自带量词则原样返回，否则补一个「号」，避免出现「21栋」或「21号号」。
 */

/** 楼栋号是否已自带量词（与 admin `hasBuildingSuffix` 同源） */
export function hasBuildingSuffix(buildingNo: string | null | undefined): boolean {
  const s = (buildingNo ?? "").trim();
  if (!s) {
    return false;
  }
  return /(号|号楼|栋|幢|单元|弄)$/.test(s);
}

/** 楼栋展示文案：自带量词原样，否则补「号」（空值返回空串） */
export function formatBuildingLabel(buildingNo: string | null | undefined): string {
  const s = (buildingNo ?? "").trim();
  if (!s) {
    return "";
  }
  return hasBuildingSuffix(s) ? s : `${s}号`;
}
