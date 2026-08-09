import { createProjectListPage } from "../../../../utils/project-list-page";

/** 项目状态 → 展示中文 + 状态色（对齐后台 status-colors 语义）. */
const STATUS_DISPLAY = {
  signing: { label: "已签约", color: "#005daa" },
  renovating: { label: "装修中", color: "#f97316" },
  selling: { label: "在售", color: "#10b981" },
  sold: { label: "已售", color: "#64748b" },
  ended: { label: "已下架", color: "#78716c" },
  deleted: { label: "已删除", color: "#a3a6af" },
};

/**
 * 按记录类型统计项目销售记录数.
 * 对齐 TS 版 parseSalesRecords（utils/sales-records.ts）的兜底语义：
 * 非数组视为空、跳过非对象项、缺失 record_type 按 "viewing" 兜底。
 * （sales-records 无对应 .js，无法直接引入，故内联等价逻辑。）
 */
function countByType(project, type) {
  const records = project.sales_records;
  if (!Array.isArray(records)) {
    return 0;
  }
  return records.filter(
    (r) =>
      r &&
      typeof r === "object" &&
      (typeof r.record_type === "string" ? r.record_type : "viewing") === type,
  ).length;
}

Page(
  createProjectListPage({
    status: "selling",
    detailRoute: "/pages/viewing/detail/index/index",
    toDisplay(project) {
      const status = project.status || "signing";
      const statusCfg = STATUS_DISPLAY[status] || {
        label: status,
        color: "#a3a6af",
      };
      return {
        id: project.id,
        name: project.community_name || project.name || "未命名项目",
        statusText: statusCfg.label,
        statusColor: statusCfg.color,
        viewingCount: countByType(project, "viewing"),
        offerCount: countByType(project, "offer"),
        negotiationCount: countByType(project, "negotiation"),
      };
    },
  }),
);
