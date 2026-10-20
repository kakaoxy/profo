import { describe, expect, it } from "vitest";

import { formatBuildingLabel, formatPlate, hasBuildingSuffix, previewNormalizedBuildingNo } from "./dict-display";

/**
 * BR-29 展示口径单测（与后端 utils/building_dict.normalize_building_no /
 * has_building_suffix 同源，两侧断言必须一致）.
 *
 * 背景：运营录入「金杨路660弄21号」时展示层硬编码补「号」→「金杨路660弄21号号」；
 * 库内还有「2号楼」「单栋」「A栋」等自带量词的写法，同样会被拼坏。
 */
describe("hasBuildingSuffix", () => {
  it.each([
    ["21号", true],
    ["2号楼", true],
    ["单栋", true],
    ["A栋", true],
    ["3幢", true],
    ["5单元", true],
    ["660弄", true],
    ["21", false],
    ["金杨路660弄21", false],
    ["", false],
  ])("%s → %s", (input, expected) => {
    expect(hasBuildingSuffix(input)).toBe(expected);
  });

  it("null/undefined 安全", () => {
    expect(hasBuildingSuffix(null)).toBe(false);
    expect(hasBuildingSuffix(undefined)).toBe(false);
  });
});

describe("formatBuildingLabel", () => {
  it("未带量词补「号」", () => {
    expect(formatBuildingLabel("21")).toBe("21号");
    expect(formatBuildingLabel("金杨路660弄21")).toBe("金杨路660弄21号");
  });

  it("已带量词原样返回（不重复追加）", () => {
    expect(formatBuildingLabel("21号")).toBe("21号");
    expect(formatBuildingLabel("2号楼")).toBe("2号楼");
    expect(formatBuildingLabel("单栋")).toBe("单栋");
    expect(formatBuildingLabel("A栋")).toBe("A栋");
  });

  it("空值返回空串（便于 filter(Boolean)）", () => {
    expect(formatBuildingLabel("")).toBe("");
    expect(formatBuildingLabel(null)).toBe("");
    expect(formatBuildingLabel("   ")).toBe("");
  });
});

describe("previewNormalizedBuildingNo（审核弹层「将保存为」预览）", () => {
  it("剥离尾部单个「号」", () => {
    expect(previewNormalizedBuildingNo("金杨路660弄21号")).toBe("金杨路660弄21");
    expect(previewNormalizedBuildingNo("105号")).toBe("105");
  });

  it("保留「号楼/栋」等语义后缀（与后端同口径）", () => {
    expect(previewNormalizedBuildingNo("2号楼")).toBe("2号楼");
    expect(previewNormalizedBuildingNo("A栋")).toBe("A栋");
    expect(previewNormalizedBuildingNo("单栋")).toBe("单栋");
  });

  it("无后缀原样返回 + 空白折叠", () => {
    expect(previewNormalizedBuildingNo("  金杨路  660弄21  ")).toBe("金杨路 660弄21");
  });

  it("纯「号」剥完为空时回退原文（不给脏值造空串）", () => {
    expect(previewNormalizedBuildingNo("号")).toBe("号");
  });

  it("归一对展示不变（真正的往返不变式）", () => {
    // 不变式：先归一后展示 === 直接展示。即「写入层剥离尾号」不会改变用户看到的文案，
    // 这正是 BR-29 能对历史存量（不提洗）安全生效的原因。
    for (const raw of ["金杨路660弄21号", "105号", "21", "2号楼", "单栋"]) {
      expect(formatBuildingLabel(previewNormalizedBuildingNo(raw))).toBe(formatBuildingLabel(raw));
    }
  });
});

describe("formatPlate", () => {
  it("门牌预览不重复补「号」", () => {
    expect(formatPlate("金杨七街坊", "660弄21", "401")).toBe("金杨七街坊 660弄21号 401");
    expect(formatPlate("金杨七街坊", "660弄21号", "401")).toBe("金杨七街坊 660弄21号 401");
    expect(formatPlate("金杨七街坊", "2号楼", "401")).toBe("金杨七街坊 2号楼 401");
  });

  it("缺省楼栋/户号时不留多余空格", () => {
    expect(formatPlate("金杨七街坊", "", "")).toBe("金杨七街坊");
    expect(formatPlate("金杨七街坊", "21", null)).toBe("金杨七街坊 21号");
  });
});
