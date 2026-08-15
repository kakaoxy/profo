/**
 * 商圈分析报表 URL 状态解析/构建辅助。
 *
 * `rooms` URL 参数语义：逗号分隔字符串，普通户型为数字（"1"/"2"/"3"），
 * 4室及以上用 "4plus" 哨兵值表示（如 "1,3,4plus"）。
 * `floor_levels` URL 参数语义：逗号分隔的中文标签（如 "低楼层,高楼层"）。
 *
 * 该模块为纯函数，无副作用，可被 Client Component 安全导入。
 */

/** 4室及以上的 URL 哨兵值 */
export const FOURPLUS_SENTINEL = "4plus" as const;

/** 户型多选状态：普通户型数组 + 是否包含 4室及以上 */
export interface RoomsState {
  rooms: number[];
  include4plus: boolean;
}

/**
 * 将 `rooms` URL 字符串解析为 RoomsState。
 * 空串或全空白 → { rooms: [], include4plus: false }。
 * 非法 token（既非 "4plus" 也非数字）会被静默丢弃。
 */
export function parseRoomsUrl(value: string): RoomsState {
  if (!value) return { rooms: [], include4plus: false };
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const rooms: number[] = [];
  let include4plus = false;
  for (const part of parts) {
    if (part === FOURPLUS_SENTINEL) {
      include4plus = true;
      continue;
    }
    const n = Number(part);
    if (Number.isInteger(n) && n > 0) rooms.push(n);
  }
  return { rooms, include4plus };
}

/**
 * 将 RoomsState 构建为 `rooms` URL 字符串。
 * 输出顺序稳定：普通户型数字升序，"4plus" 始终在末尾。
 * 空状态返回空串。
 */
export function buildRoomsUrl(state: RoomsState): string {
  const numericParts = [...state.rooms].sort((a, b) => a - b).map(String);
  const parts = state.include4plus ? [...numericParts, FOURPLUS_SENTINEL] : numericParts;
  return parts.join(",");
}

/**
 * 将 `floor_levels` URL 字符串解析为标签数组。
 * 空串返回空数组；保留输入顺序。
 */
export function parseFloorLevelsUrl(value: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 将楼层标签数组构建为 `floor_levels` URL 字符串。
 * 空数组返回空串。
 */
export function buildFloorLevelsUrl(levels: string[]): string {
  return levels
    .map((s) => s.trim())
    .filter(Boolean)
    .join(",");
}
