import type { components } from "@/lib/api-types";

type ProjectResponse = components["schemas"]["ProjectResponse"];

/**
 * 项目阶段排序优先级
 * 数值越小，排序越靠前（靠左显示）
 */
const STAGE_PRIORITY: Record<string, number> = {
  selling: 1,      // 在售阶段 - 最高优先级
  renovating: 2,   // 装修阶段
  signing: 3,      // 签约阶段
  sold: 4,         // 已售阶段 - 最低优先级
};

/**
 * 计算在售项目的到期时间
 * 根据签约日期 + 签约期限（月）+ 延长期限（月）计算
 * @param project 项目响应数据
 * @returns 到期时间的毫秒时间戳，如果无法计算则返回 Infinity
 */
function calculateExpirationTime(project: ProjectResponse): number {
  // 如果不是在售项目，不需要计算到期时间
  if (project.status !== "selling") {
    return Infinity;
  }

  // 获取签约日期
  const signingDate = project.signing_date;
  const signingPeriod = project.signing_period;

  if (!signingDate || !signingPeriod) {
    return Infinity;
  }

  // 明确使用 UTC 时间解析日期字符串，避免时区问题
  const startDate = new Date(signingDate + "T00:00:00Z");
  if (isNaN(startDate.getTime())) {
    return Infinity;
  }

  // 计算到期日期：签约日期 + 签约期限（月）
  const expirationDate = new Date(startDate);
  expirationDate.setMonth(expirationDate.getMonth() + signingPeriod);

  // 如果有延长期限，加上延长期限
  const extensionPeriod = project.extension_period;
  if (extensionPeriod && extensionPeriod > 0) {
    expirationDate.setMonth(expirationDate.getMonth() + extensionPeriod);
  }

  return expirationDate.getTime();
}

/**
 * 对项目列表进行排序
 * 排序规则：
 * 1. 按阶段优先级排序：在售 → 装修 → 签约 → 已售
 * 2. 在售阶段内按到期时间升序排列（越临近到期越靠前）
 *
 * @param projects 项目列表
 * @returns 排序后的项目列表（新数组，不修改原数组）
 *
 * @example
 * const sortedProjects = sortProjects(projects);
 */
export function sortProjects(projects: ProjectResponse[]): ProjectResponse[] {
  return [...projects].sort((a, b) => {
    const priorityA = STAGE_PRIORITY[a.status] ?? 99;
    const priorityB = STAGE_PRIORITY[b.status] ?? 99;

    // 首先按阶段优先级排序
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // 如果是同一阶段且都是在售阶段，按到期时间排序
    if (a.status === "selling" && b.status === "selling") {
      const expirationA = calculateExpirationTime(a);
      const expirationB = calculateExpirationTime(b);

      // 无法计算到期时间的项目排在最后
      if (expirationA === Infinity && expirationB === Infinity) {
        return 0;
      }
      if (expirationA === Infinity) {
        return 1;
      }
      if (expirationB === Infinity) {
        return -1;
      }

      // 按到期时间升序排列（越近越靠前）
      return expirationA - expirationB;
    }

    // 其他阶段保持原有顺序（稳定排序）
    return 0;
  });
}
