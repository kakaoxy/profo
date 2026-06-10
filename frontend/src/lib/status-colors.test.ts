import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  getStatusLabel,
  getStatusColor,
  getAllStatusColors,
  getLeadStatusClassName,
  getLeadStatusBadgeClass,
  getProjectStatusClassName,
  getProjectStatusBadgeClass,
  getProjectStatusBorderClass,
  getStatusStyleConfig,
  LEAD_LIFECYCLE_STEPS,
  PROJECT_LIFECYCLE_STEPS,
  STATUS_CONFIG,
  LEAD_STATUS_MAPPING,
  PROJECT_STATUS_MAPPING,
  DEFAULT_STATUS,
  defaultStatusClass,
  PUBLISH_STATUS_CONFIG,
  PUBLISH_STATUS_MAPPING,
  PUBLISH_STATUS_CLASS_MAP,
} from "./status-colors";
import { LeadStatus } from "@/app/(main)/leads/types";

// ─── getStatusLabel ────────────────────────────────────────────────
describe("getStatusLabel", () => {
  it("已知通用状态返回中文标签", () => {
    expect(getStatusLabel("pending")).toBe("待评估");
    expect(getStatusLabel("signing")).toBe("已签约");
    expect(getStatusLabel("renovating")).toBe("装修中");
    expect(getStatusLabel("selling")).toBe("在售");
    expect(getStatusLabel("sold")).toBe("已售");
    expect(getStatusLabel("rejected")).toBe("已驳回");
  });

  it("线索状态字符串映射后返回对应标签", () => {
    expect(getStatusLabel(LeadStatus.PENDING_ASSESSMENT)).toBe("待评估");
    expect(getStatusLabel(LeadStatus.PENDING_VISIT)).toBe("待评估");
    expect(getStatusLabel(LeadStatus.VISITED)).toBe("在售");
    expect(getStatusLabel(LeadStatus.SIGNED)).toBe("已签约");
    expect(getStatusLabel(LeadStatus.REJECTED)).toBe("已驳回");
  });

  it("未知状态返回原始字符串作为回退", () => {
    expect(getStatusLabel("unknown_status")).toBe("unknown_status");
    expect(getStatusLabel("random")).toBe("random");
  });
});

// ─── getStatusColor ────────────────────────────────────────────────
describe("getStatusColor", () => {
  it("SSR 环境下返回回退颜色值", () => {
    const originalWindow = globalThis.window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;

    expect(getStatusColor("pending")).toBe("#f59e0b");
    expect(getStatusColor("signing")).toBe("#005daa");
    expect(getStatusColor("renovating")).toBe("#f97316");
    expect(getStatusColor("selling")).toBe("#10b981");
    expect(getStatusColor("sold")).toBe("#64748b");
    expect(getStatusColor("rejected")).toBe("#94a3b8");

    globalThis.window = originalWindow;
  });

  it("浏览器环境下读取 CSS 变量值", () => {
    const mockGetPropertyValue = vi.fn().mockReturnValue(" #10b981 ");
    const mockGetComputedStyle = vi.fn().mockReturnValue({
      getPropertyValue: mockGetPropertyValue,
    });
    vi.spyOn(window, "getComputedStyle").mockImplementation(mockGetComputedStyle);

    const result = getStatusColor("selling");
    expect(result).toBe("#10b981");
    expect(mockGetComputedStyle).toHaveBeenCalledWith(document.documentElement);
    expect(mockGetPropertyValue).toHaveBeenCalledWith("--status-selling");

    vi.restoreAllMocks();
  });

  it("浏览器环境下 CSS 变量为空时返回默认灰色", () => {
    const mockGetPropertyValue = vi.fn().mockReturnValue("");
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: mockGetPropertyValue,
    } as CSSStyleDeclaration);

    expect(getStatusColor("sold")).toBe("#64748b");

    vi.restoreAllMocks();
  });
});

// ─── getAllStatusColors ────────────────────────────────────────────
describe("getAllStatusColors", () => {
  it("返回完整的状态颜色映射", () => {
    // 在 SSR 环境下测试，结果可预测
    const originalWindow = globalThis.window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;

    const colors = getAllStatusColors();
    expect(colors).toHaveProperty("pending");
    expect(colors).toHaveProperty("signing");
    expect(colors).toHaveProperty("renovating");
    expect(colors).toHaveProperty("selling");
    expect(colors).toHaveProperty("sold");
    expect(colors).toHaveProperty("rejected");
    expect(Object.keys(colors)).toHaveLength(6);

    globalThis.window = originalWindow;
  });

  it("SSR 环境下各颜色值与回退表一致", () => {
    const originalWindow = globalThis.window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;

    const colors = getAllStatusColors();
    expect(colors.pending).toBe("#f59e0b");
    expect(colors.signing).toBe("#005daa");
    expect(colors.renovating).toBe("#f97316");
    expect(colors.selling).toBe("#10b981");
    expect(colors.sold).toBe("#64748b");
    expect(colors.rejected).toBe("#94a3b8");

    globalThis.window = originalWindow;
  });
});

// ─── getLeadStatusClassName ────────────────────────────────────────
describe("getLeadStatusClassName", () => {
  it("已知线索状态返回对应 Tailwind 类名", () => {
    expect(getLeadStatusClassName(LeadStatus.PENDING_ASSESSMENT)).toContain("bg-status-pending");
    expect(getLeadStatusClassName(LeadStatus.PENDING_VISIT)).toContain("bg-status-pending");
    expect(getLeadStatusClassName(LeadStatus.VISITED)).toContain("bg-status-selling");
    expect(getLeadStatusClassName(LeadStatus.SIGNED)).toContain("bg-status-signing");
    expect(getLeadStatusClassName(LeadStatus.REJECTED)).toContain("bg-status-rejected");
  });

  it("所有已知状态返回的类名包含 text-white", () => {
    const statuses = Object.values(LeadStatus);
    for (const s of statuses) {
      expect(getLeadStatusClassName(s)).toContain("text-white");
    }
  });
});

// ─── getLeadStatusBadgeClass ───────────────────────────────────────
describe("getLeadStatusBadgeClass", () => {
  it("枚举值输入返回 Badge 样式", () => {
    expect(getLeadStatusBadgeClass(LeadStatus.PENDING_ASSESSMENT)).toContain("bg-status-pending/10");
    expect(getLeadStatusBadgeClass(LeadStatus.PENDING_VISIT)).toContain("bg-status-pending/10");
    expect(getLeadStatusBadgeClass(LeadStatus.VISITED)).toContain("bg-status-selling/10");
    expect(getLeadStatusBadgeClass(LeadStatus.SIGNED)).toContain("bg-status-signing/10");
    expect(getLeadStatusBadgeClass(LeadStatus.REJECTED)).toContain("bg-status-rejected/10");
  });

  it("字符串输入（下划线格式）返回 Badge 样式", () => {
    expect(getLeadStatusBadgeClass("pending_assessment")).toContain("bg-status-pending/10");
    expect(getLeadStatusBadgeClass("pending_visit")).toContain("bg-status-pending/10");
    expect(getLeadStatusBadgeClass("visited")).toContain("bg-status-selling/10");
    expect(getLeadStatusBadgeClass("signed")).toContain("bg-status-signing/10");
    expect(getLeadStatusBadgeClass("rejected")).toContain("bg-status-rejected/10");
  });

  it("未知字符串状态返回默认样式", () => {
    expect(getLeadStatusBadgeClass("unknown")).toBe("bg-muted text-muted-foreground");
  });
});

// ─── getProjectStatusClassName ─────────────────────────────────────
describe("getProjectStatusClassName", () => {
  it("英文状态键返回对应类名", () => {
    expect(getProjectStatusClassName("signing")).toContain("bg-status-signing");
    expect(getProjectStatusClassName("renovating")).toContain("bg-status-renovating");
    expect(getProjectStatusClassName("selling")).toContain("bg-status-selling");
    expect(getProjectStatusClassName("sold")).toContain("bg-status-sold");
  });

  it("中文状态键返回对应类名", () => {
    expect(getProjectStatusClassName("签约")).toContain("bg-status-signing");
    expect(getProjectStatusClassName("签约中")).toContain("bg-status-signing");
    expect(getProjectStatusClassName("装修")).toContain("bg-status-renovating");
    expect(getProjectStatusClassName("装修中")).toContain("bg-status-renovating");
    expect(getProjectStatusClassName("挂牌")).toContain("bg-status-selling");
    expect(getProjectStatusClassName("在售")).toContain("bg-status-selling");
    expect(getProjectStatusClassName("已成交")).toContain("bg-status-sold");
    expect(getProjectStatusClassName("已售")).toContain("bg-status-sold");
    expect(getProjectStatusClassName("成交")).toContain("bg-status-sold");
    expect(getProjectStatusClassName("已结束")).toContain("bg-status-sold");
  });

  it("L4 营销项目状态映射", () => {
    expect(getProjectStatusClassName("在途")).toContain("bg-status-signing");
  });

  it("过期状态映射", () => {
    expect(getProjectStatusClassName("过期")).toContain("bg-status-rejected");
  });

  it("未知状态返回默认样式", () => {
    expect(getProjectStatusClassName("unknown")).toBe("bg-muted text-muted-foreground");
  });
});

// ─── getProjectStatusBadgeClass ────────────────────────────────────
describe("getProjectStatusBadgeClass", () => {
  it("英文状态键返回 Badge 样式", () => {
    expect(getProjectStatusBadgeClass("signing")).toContain("bg-status-signing/10");
    expect(getProjectStatusBadgeClass("renovating")).toContain("bg-status-renovating/10");
    expect(getProjectStatusBadgeClass("selling")).toContain("bg-status-selling/10");
    expect(getProjectStatusBadgeClass("sold")).toContain("bg-status-sold/10");
  });

  it("中文状态键返回 Badge 样式", () => {
    expect(getProjectStatusBadgeClass("签约")).toContain("bg-status-signing/10");
    expect(getProjectStatusBadgeClass("装修中")).toContain("bg-status-renovating/10");
    expect(getProjectStatusBadgeClass("在售")).toContain("bg-status-selling/10");
    expect(getProjectStatusBadgeClass("已售")).toContain("bg-status-sold/10");
  });

  it("未知状态返回默认样式", () => {
    expect(getProjectStatusBadgeClass("unknown")).toBe("bg-muted text-muted-foreground");
  });
});

// ─── getProjectStatusBorderClass ───────────────────────────────────
describe("getProjectStatusBorderClass", () => {
  it("项目状态返回左边框类名", () => {
    expect(getProjectStatusBorderClass("signing")).toBe("border-l-status-signing");
    expect(getProjectStatusBorderClass("renovating")).toBe("border-l-status-renovating");
    expect(getProjectStatusBorderClass("selling")).toBe("border-l-status-selling");
    expect(getProjectStatusBorderClass("sold")).toBe("border-l-status-sold");
  });

  it("中文状态键映射后返回左边框类名", () => {
    expect(getProjectStatusBorderClass("签约")).toBe("border-l-status-signing");
    expect(getProjectStatusBorderClass("装修中")).toBe("border-l-status-renovating");
    expect(getProjectStatusBorderClass("在售")).toBe("border-l-status-selling");
    expect(getProjectStatusBorderClass("已售")).toBe("border-l-status-sold");
  });

  it("未知状态返回空字符串", () => {
    expect(getProjectStatusBorderClass("unknown")).toBe("");
  });

  it("pending 和 rejected 状态不在项目边框映射中，返回空字符串", () => {
    // pending/rejected 不属于 ProjectStatusType，borderClassMap 不包含它们
    expect(getProjectStatusBorderClass("pending")).toBe("");
    expect(getProjectStatusBorderClass("rejected")).toBe("");
  });
});

// ─── getStatusStyleConfig ──────────────────────────────────────────
describe("getStatusStyleConfig", () => {
  it("线索状态字符串返回对应配置", () => {
    const pendingAssessment = getStatusStyleConfig("pending_assessment");
    expect(pendingAssessment.label).toBe("待评估");
    expect(pendingAssessment.className).toContain("bg-status-pending/10");

    const pendingVisit = getStatusStyleConfig("pending_visit");
    expect(pendingVisit.label).toBe("待看房");
    expect(pendingVisit.className).toContain("bg-status-pending/10");

    const visited = getStatusStyleConfig("visited");
    expect(visited.label).toBe("已看房");
    expect(visited.className).toContain("bg-status-selling/10");

    const signed = getStatusStyleConfig("signed");
    expect(signed.label).toBe("已签约");
    expect(signed.className).toContain("bg-status-signing/10");

    const rejected = getStatusStyleConfig("rejected");
    expect(rejected.label).toBe("已驳回");
    expect(rejected.className).toContain("bg-status-rejected/10");
  });

  it("通用 StatusType 返回对应配置", () => {
    const pending = getStatusStyleConfig("pending");
    expect(pending.label).toBe("待评估");
    expect(pending.className).toContain("bg-status-pending/10");

    const selling = getStatusStyleConfig("selling");
    expect(selling.label).toBe("在售");
    expect(selling.className).toContain("bg-status-selling/10");

    const sold = getStatusStyleConfig("sold");
    expect(sold.label).toBe("已售");
    expect(sold.className).toContain("bg-status-sold/10");
  });

  it("未知状态返回原始字符串作为标签和默认样式", () => {
    const result = getStatusStyleConfig("nonexistent");
    expect(result.label).toBe("nonexistent");
    expect(result.className).toBe("bg-muted text-muted-foreground");
  });
});

// ─── LEAD_LIFECYCLE_STEPS ──────────────────────────────────────────
describe("LEAD_LIFECYCLE_STEPS", () => {
  it("包含 4 个步骤", () => {
    expect(LEAD_LIFECYCLE_STEPS).toHaveLength(4);
  });

  it("步骤序号从 0 递增", () => {
    LEAD_LIFECYCLE_STEPS.forEach((step, i) => {
      expect(step.step).toBe(i);
    });
  });

  it("包含所有线索生命周期状态", () => {
    const statuses = LEAD_LIFECYCLE_STEPS.map((s) => s.status);
    expect(statuses).toContain(LeadStatus.PENDING_ASSESSMENT);
    expect(statuses).toContain(LeadStatus.PENDING_VISIT);
    expect(statuses).toContain(LeadStatus.VISITED);
    expect(statuses).toContain(LeadStatus.SIGNED);
  });

  it("每个步骤都有中文标签", () => {
    for (const step of LEAD_LIFECYCLE_STEPS) {
      expect(step.label.length).toBeGreaterThan(0);
    }
  });
});

// ─── PROJECT_LIFECYCLE_STEPS ───────────────────────────────────────
describe("PROJECT_LIFECYCLE_STEPS", () => {
  it("包含 4 个步骤", () => {
    expect(PROJECT_LIFECYCLE_STEPS).toHaveLength(4);
  });

  it("步骤序号从 0 递增", () => {
    PROJECT_LIFECYCLE_STEPS.forEach((step, i) => {
      expect(step.step).toBe(i);
    });
  });

  it("包含所有项目生命周期状态", () => {
    const statuses = PROJECT_LIFECYCLE_STEPS.map((s) => s.status);
    expect(statuses).toEqual(["signing", "renovating", "selling", "sold"]);
  });

  it("每个步骤都有中文标签", () => {
    for (const step of PROJECT_LIFECYCLE_STEPS) {
      expect(step.label.length).toBeGreaterThan(0);
    }
  });
});

// ─── 常量完整性校验 ────────────────────────────────────────────────
describe("常量完整性", () => {
  it("STATUS_CONFIG 包含所有 StatusType 键", () => {
    const keys = Object.keys(STATUS_CONFIG);
    expect(keys).toContain("pending");
    expect(keys).toContain("signing");
    expect(keys).toContain("renovating");
    expect(keys).toContain("selling");
    expect(keys).toContain("sold");
    expect(keys).toContain("rejected");
    expect(keys).toHaveLength(6);
  });

  it("LEAD_STATUS_MAPPING 覆盖所有 LeadStatus 枚举值", () => {
    const enumValues = Object.values(LeadStatus);
    for (const v of enumValues) {
      expect(LEAD_STATUS_MAPPING[v]).toBeDefined();
    }
  });

  it("PROJECT_STATUS_MAPPING 包含英文和中文键", () => {
    // 英文键
    expect(PROJECT_STATUS_MAPPING["signing"]).toBe("signing");
    expect(PROJECT_STATUS_MAPPING["renovating"]).toBe("renovating");
    expect(PROJECT_STATUS_MAPPING["selling"]).toBe("selling");
    expect(PROJECT_STATUS_MAPPING["sold"]).toBe("sold");
    // 中文键
    expect(PROJECT_STATUS_MAPPING["签约"]).toBe("signing");
    expect(PROJECT_STATUS_MAPPING["在售"]).toBe("selling");
    expect(PROJECT_STATUS_MAPPING["已售"]).toBe("sold");
  });

  it("DEFAULT_STATUS 为 signing", () => {
    expect(DEFAULT_STATUS).toBe("signing");
  });

  it("defaultStatusClass 为默认灰色样式", () => {
    expect(defaultStatusClass).toBe("bg-muted text-muted-foreground");
  });
});

// ─── 发布状态常量 ──────────────────────────────────────────────────
describe("发布状态常量", () => {
  it("PUBLISH_STATUS_CONFIG 包含 published 和 draft", () => {
    expect(PUBLISH_STATUS_CONFIG.published.label).toBe("已发布");
    expect(PUBLISH_STATUS_CONFIG.draft.label).toBe("草稿");
  });

  it("PUBLISH_STATUS_MAPPING 中文映射正确", () => {
    expect(PUBLISH_STATUS_MAPPING["发布"]).toBe("published");
    expect(PUBLISH_STATUS_MAPPING["草稿"]).toBe("draft");
  });

  it("PUBLISH_STATUS_CLASS_MAP 包含对应样式", () => {
    expect(PUBLISH_STATUS_CLASS_MAP.published).toContain("bg-status-selling");
    expect(PUBLISH_STATUS_CLASS_MAP.draft).toContain("bg-status-pending");
  });
});
