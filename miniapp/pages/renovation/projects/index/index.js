import { createProjectListPage } from "../../../../utils/project-list-page";

/** 装修子阶段顺序（对齐后台 constants.ts RENOVATION_STAGES 的 value）. */
const RENOVATION_STAGE_VALUES = ["拆除", "设计", "水电", "木瓦", "油漆", "交付"];

Page(
  createProjectListPage({
    status: "renovating",
    detailRoute: "/pages/renovation/detail/index/index",
    toDisplay(project) {
      const stage = project.renovation_stage;
      let stageText = "未开始";
      if (stage) {
        if (RENOVATION_STAGE_VALUES.indexOf(stage) >= 0) {
          stageText = stage;
        } else if (stage === "已完成") {
          stageText = "已完成";
        }
      }
      const dates = project.renovationStageDates || {};
      const completed = RENOVATION_STAGE_VALUES.filter((s) => dates[s]).length;
      const percent = Math.round(
        (completed / RENOVATION_STAGE_VALUES.length) * 100,
      );
      return {
        id: project.id,
        name: project.community_name || project.name || "未命名项目",
        statusText: "装修中",
        statusColor: "#f97316",
        stageText: stageText,
        progressText: percent + "%",
      };
    },
  }),
);
