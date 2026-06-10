import { describe, expect, it } from "vitest";
import { sortProjects } from "./project-sort";
import type { components } from "@/lib/api-types";

type ProjectResponse = components["schemas"]["ProjectResponse"];

/** 构建最小 ProjectResponse 的工厂函数 */
function makeProject(overrides: Partial<ProjectResponse> & { id: string; status: string }): ProjectResponse {
  return {
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    is_deleted: false,
    ...overrides,
  } as ProjectResponse;
}

describe("project-sort", () => {
  describe("sortProjects", () => {
    it("阶段优先级排序：在售 > 装修 > 签约 > 已售", () => {
      const sold = makeProject({ id: "1", status: "sold" });
      const signing = makeProject({ id: "2", status: "signing" });
      const renovating = makeProject({ id: "3", status: "renovating" });
      const selling = makeProject({ id: "4", status: "selling" });

      const result = sortProjects([sold, signing, renovating, selling]);
      expect(result.map((p) => p.status)).toEqual(["selling", "renovating", "signing", "sold"]);
    });

    it("同一阶段内在售项目按到期时间升序排列", () => {
      const early = makeProject({
        id: "1",
        status: "selling",
        signing_date: "2025-01-01",
        signing_period: 3,
      });
      const late = makeProject({
        id: "2",
        status: "selling",
        signing_date: "2025-01-01",
        signing_period: 12,
      });

      const result = sortProjects([late, early]);
      expect(result.map((p) => p.id)).toEqual(["1", "2"]);
    });

    it("缺少日期的在售项目排在同阶段最后", () => {
      const withDate = makeProject({
        id: "1",
        status: "selling",
        signing_date: "2025-01-01",
        signing_period: 3,
      });
      const noDate = makeProject({
        id: "2",
        status: "selling",
        signing_date: null,
        signing_period: null,
      });

      const result = sortProjects([noDate, withDate]);
      expect(result.map((p) => p.id)).toEqual(["1", "2"]);
    });

    it("两个都缺少日期的在售项目保持原顺序", () => {
      const a = makeProject({ id: "1", status: "selling", signing_date: null, signing_period: null });
      const b = makeProject({ id: "2", status: "selling", signing_date: null, signing_period: null });

      const result = sortProjects([a, b]);
      expect(result.map((p) => p.id)).toEqual(["1", "2"]);
    });

    it("非在售项目的到期时间为 Infinity，不影响排序", () => {
      const renovating1 = makeProject({ id: "1", status: "renovating" });
      const renovating2 = makeProject({ id: "2", status: "renovating" });

      const result = sortProjects([renovating2, renovating1]);
      // 同阶段非 selling 保持原顺序（稳定排序）
      expect(result.map((p) => p.id)).toEqual(["2", "1"]);
    });

    it("空数组返回空数组", () => {
      expect(sortProjects([])).toEqual([]);
    });

    it("不修改原数组", () => {
      const original = [
        makeProject({ id: "1", status: "sold" }),
        makeProject({ id: "2", status: "selling", signing_date: "2025-01-01", signing_period: 6 }),
      ];
      const copy = [...original];
      sortProjects(original);
      expect(original).toEqual(copy);
    });

    it("未知阶段排在已知阶段之后", () => {
      const unknown = makeProject({ id: "1", status: "unknown_status" });
      const sold = makeProject({ id: "2", status: "sold" });

      const result = sortProjects([unknown, sold]);
      expect(result.map((p) => p.status)).toEqual(["sold", "unknown_status"]);
    });

    it("多个未知阶段之间保持原顺序", () => {
      const a = makeProject({ id: "1", status: "foo" });
      const b = makeProject({ id: "2", status: "bar" });

      const result = sortProjects([a, b]);
      expect(result.map((p) => p.id)).toEqual(["1", "2"]);
    });

    it("混合场景：各阶段都有项目时整体排序正确", () => {
      const projects = [
        makeProject({ id: "sold-1", status: "sold" }),
        makeProject({ id: "selling-6m", status: "selling", signing_date: "2025-01-01", signing_period: 6 }),
        makeProject({ id: "renovating-1", status: "renovating" }),
        makeProject({ id: "selling-3m", status: "selling", signing_date: "2025-01-01", signing_period: 3 }),
        makeProject({ id: "signing-1", status: "signing" }),
        makeProject({ id: "selling-nodate", status: "selling", signing_date: null, signing_period: null }),
      ];

      const result = sortProjects(projects);
      expect(result.map((p) => p.id)).toEqual([
        "selling-3m",
        "selling-6m",
        "selling-nodate",
        "renovating-1",
        "signing-1",
        "sold-1",
      ]);
    });
  });

  describe("calculateExpirationTime（通过 sortProjects 间接测试）", () => {
    it("正常计算：签约日期 + 签约期限", () => {
      // 2025-01-01 + 3个月 = 2025-04-01
      const project = makeProject({
        id: "1",
        status: "selling",
        signing_date: "2025-01-01",
        signing_period: 3,
      });

      const other = makeProject({
        id: "2",
        status: "selling",
        signing_date: "2025-04-01",
        signing_period: 3,
      });

      // project 到期 2025-04-01，other 到期 2025-07-01
      const result = sortProjects([other, project]);
      expect(result.map((p) => p.id)).toEqual(["1", "2"]);
    });

    it("缺少签约日期时返回 Infinity，排到最后", () => {
      const noSigningDate = makeProject({
        id: "1",
        status: "selling",
        signing_date: null,
        signing_period: 3,
      });
      const normal = makeProject({
        id: "2",
        status: "selling",
        signing_date: "2025-01-01",
        signing_period: 3,
      });

      const result = sortProjects([noSigningDate, normal]);
      expect(result.map((p) => p.id)).toEqual(["2", "1"]);
    });

    it("缺少签约期限时返回 Infinity，排到最后", () => {
      const noPeriod = makeProject({
        id: "1",
        status: "selling",
        signing_date: "2025-01-01",
        signing_period: null,
      });
      const normal = makeProject({
        id: "2",
        status: "selling",
        signing_date: "2025-01-01",
        signing_period: 3,
      });

      const result = sortProjects([noPeriod, normal]);
      expect(result.map((p) => p.id)).toEqual(["2", "1"]);
    });

    it("非在售项目返回 Infinity", () => {
      // 非在售项目之间排序不影响顺序（稳定排序）
      const renovating = makeProject({ id: "1", status: "renovating", signing_date: "2025-01-01", signing_period: 3 });
      const signing = makeProject({ id: "2", status: "signing", signing_date: "2025-06-01", signing_period: 6 });

      const result = sortProjects([renovating, signing]);
      // renovating 优先级 2，signing 优先级 3
      expect(result.map((p) => p.status)).toEqual(["renovating", "signing"]);
    });

    it("延长期限加入计算：签约日期 + 签约期限 + 延长期限", () => {
      const withExtension = makeProject({
        id: "1",
        status: "selling",
        signing_date: "2025-01-01",
        signing_period: 3,
        extension_period: 2,
      });
      // 到期: 2025-01-01 + 3 + 2 = 2025-06-01

      const noExtension = makeProject({
        id: "2",
        status: "selling",
        signing_date: "2025-01-01",
        signing_period: 3,
        extension_period: null,
      });
      // 到期: 2025-01-01 + 3 = 2025-04-01

      const result = sortProjects([withExtension, noExtension]);
      expect(result.map((p) => p.id)).toEqual(["2", "1"]);
    });

    it("延长期限为 0 时不影响计算", () => {
      const zeroExtension = makeProject({
        id: "1",
        status: "selling",
        signing_date: "2025-01-01",
        signing_period: 3,
        extension_period: 0,
      });
      const noExtension = makeProject({
        id: "2",
        status: "selling",
        signing_date: "2025-01-01",
        signing_period: 3,
        extension_period: null,
      });

      // 两者到期时间相同，保持原顺序
      const result = sortProjects([zeroExtension, noExtension]);
      expect(result.map((p) => p.id)).toEqual(["1", "2"]);
    });

    it("无效签约日期返回 Infinity", () => {
      const invalidDate = makeProject({
        id: "1",
        status: "selling",
        signing_date: "not-a-date",
        signing_period: 3,
      });
      const normal = makeProject({
        id: "2",
        status: "selling",
        signing_date: "2025-01-01",
        signing_period: 3,
      });

      const result = sortProjects([invalidDate, normal]);
      expect(result.map((p) => p.id)).toEqual(["2", "1"]);
    });
  });
});
