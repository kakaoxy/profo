import { describe, expect, it } from "vitest";
import { formatBuildingLabel, hasBuildingSuffix } from "../../utils/building-label";

/** 与 admin `frontend/src/lib/dict-display.test.ts` 同口径的用例集 */
describe("hasBuildingSuffix", () => {
  it("识别已自带量词的楼栋号", () => {
    expect(hasBuildingSuffix("21号")).toBe(true);
    expect(hasBuildingSuffix("2号楼")).toBe(true);
    expect(hasBuildingSuffix("A栋")).toBe(true);
    expect(hasBuildingSuffix("单栋")).toBe(true);
    expect(hasBuildingSuffix("3幢")).toBe(true);
    expect(hasBuildingSuffix("2单元")).toBe(true);
    expect(hasBuildingSuffix("660弄")).toBe(true);
  });

  it("裸楼栋号不带量词", () => {
    expect(hasBuildingSuffix("285")).toBe(false);
    expect(hasBuildingSuffix("01")).toBe(false);
    expect(hasBuildingSuffix("")).toBe(false);
    expect(hasBuildingSuffix(null)).toBe(false);
  });
});

describe("formatBuildingLabel", () => {
  it("裸楼栋号补「号」", () => {
    expect(formatBuildingLabel("285")).toBe("285号");
    expect(formatBuildingLabel(" 01 ")).toBe("01号");
  });

  it("自带量词原样返回，不重复追加", () => {
    expect(formatBuildingLabel("21号")).toBe("21号");
    expect(formatBuildingLabel("2号楼")).toBe("2号楼");
    expect(formatBuildingLabel("A栋")).toBe("A栋");
    expect(formatBuildingLabel("单栋")).toBe("单栋");
  });

  it("空值返回空串", () => {
    expect(formatBuildingLabel("")).toBe("");
    expect(formatBuildingLabel(null)).toBe("");
    expect(formatBuildingLabel(undefined)).toBe("");
  });
});
