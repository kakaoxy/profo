import { describe, it, expect } from "vitest";
import { mapBackendToFrontend } from "./utils";
import { LeadStatus } from "../types";
import type { components } from "@/lib/api-types";

type BackendLead = components["schemas"]["LeadResponse"];

/** 构造一个所有字段都有值的完整后端线索对象 */
function makeFullBackendLead(): BackendLead {
  return {
    id: "lead-001",
    community_name: "阳光花园",
    community_id: "comm-001",
    is_hot: 1,
    layout: "3室2厅",
    orientation: "南北",
    floor_info: "12/18层",
    area: 89.5,
    total_price: 350,
    unit_price: 39106,
    eval_price: 340,
    district: "浦东",
    business_area: "陆家嘴",
    remarks: "业主急售",
    source_property_id: 42,
    status: "pending_assessment",
    audit_reason: "价格偏高",
    auditor_id: "5",
    audit_time: "2026-01-15T10:30:00Z",
    images: ["img1.jpg", "img2.jpg"],
    creator_id: "1",
    creator_name: "张三",
    last_follow_up_at: "2026-03-01T14:00:00Z",
    created_at: "2026-01-10T08:00:00Z",
  };
}

describe("mapBackendToFrontend", () => {
  // ─── 1. 完整字段映射 ───
  it("应将所有 snake_case 后端字段正确映射为 camelCase 前端字段", () => {
    const backend = makeFullBackendLead();
    const result = mapBackendToFrontend(backend);

    expect(result.id).toBe("lead-001");
    expect(result.communityName).toBe("阳光花园");
    expect(result.communityId).toBe("comm-001");
    expect(result.layout).toBe("3室2厅");
    expect(result.orientation).toBe("南北");
    expect(result.floorInfo).toBe("12/18层");
    expect(result.area).toBe(89.5);
    expect(result.totalPrice).toBe(350);
    expect(result.unitPrice).toBe(39106);
    expect(result.evalPrice).toBe(340);
    expect(result.district).toBe("浦东");
    expect(result.businessArea).toBe("陆家嘴");
    expect(result.remarks).toBe("业主急售");
    expect(result.auditReason).toBe("价格偏高");
    expect(result.auditorId).toBe("5");
    expect(result.auditTime).toBe("2026-01-15T10:30:00Z");
    expect(result.images).toEqual(["img1.jpg", "img2.jpg"]);
    expect(result.creatorName).toBe("张三");
    expect(result.lastFollowUpAt).toBe("2026-03-01T14:00:00Z");
  });

  // ─── 2. null → undefined / 默认值处理 ───
  it("应将 null 的可选字符串字段映射为 undefined 或空字符串默认值", () => {
    const backend = makeFullBackendLead();
    backend.community_id = null;
    backend.layout = null;
    backend.orientation = null;
    backend.floor_info = null;
    backend.eval_price = null;
    backend.district = null;
    backend.business_area = null;
    backend.remarks = null;
    backend.creator_name = null;
    backend.audit_reason = null;
    backend.audit_time = null;
    backend.last_follow_up_at = null;

    const result = mapBackendToFrontend(backend);

    // ?? undefined
    expect(result.communityId).toBeUndefined();
    expect(result.evalPrice).toBeUndefined(); // number | null → undefined
    expect(result.auditReason).toBeUndefined();
    expect(result.auditTime).toBeUndefined();
    expect(result.lastFollowUpAt).toBeUndefined();

    // ?? "" (空字符串兜底)
    expect(result.layout).toBe("");
    expect(result.orientation).toBe("");
    expect(result.floorInfo).toBe("");
    expect(result.district).toBe("");
    expect(result.businessArea).toBe("");
    expect(result.remarks).toBe("");

    // ?? "未知"
    expect(result.creatorName).toBe("未知");
  });

  it("应将 null 的数值字段映射为 0", () => {
    const backend = makeFullBackendLead();
    backend.area = null;
    backend.total_price = null;
    backend.unit_price = null;

    const result = mapBackendToFrontend(backend);

    expect(result.area).toBe(0);
    expect(result.totalPrice).toBe(0);
    expect(result.unitPrice).toBe(0);
  });

  // ─── 3. status 类型断言 ───
  it("应将后端 status 字符串断言为前端 LeadStatus 枚举", () => {
    const statuses: Array<{ backend: BackendLead["status"]; expected: LeadStatus }> = [
      { backend: "pending_assessment", expected: LeadStatus.PENDING_ASSESSMENT },
      { backend: "pending_visit", expected: LeadStatus.PENDING_VISIT },
      { backend: "rejected", expected: LeadStatus.REJECTED },
      { backend: "visited", expected: LeadStatus.VISITED },
      { backend: "signed", expected: LeadStatus.SIGNED },
    ];

    for (const { backend, expected } of statuses) {
      const lead = makeFullBackendLead();
      lead.status = backend;
      expect(mapBackendToFrontend(lead).status).toBe(expected);
    }
  });

  // ─── 4. 日期格式化 ───
  it("应将 created_at ISO 日期字符串格式化为本地化字符串", () => {
    const backend = makeFullBackendLead();
    backend.created_at = "2026-06-09T12:00:00Z";

    const result = mapBackendToFrontend(backend);

    // 验证结果是通过 toLocaleString() 生成的，而非原始 ISO 字符串
    expect(result.createdAt).not.toBe("2026-06-09T12:00:00Z");
    // 验证包含年份
    expect(result.createdAt).toContain("2026");
  });

  // ─── 5. images 空数组兜底 ───
  it("当 images 为空数组时应原样返回空数组", () => {
    const backend = makeFullBackendLead();
    backend.images = [];

    const result = mapBackendToFrontend(backend);

    expect(result.images).toEqual([]);
  });

  // ─── 6. 所有字段均为 null 的极端情况 ───
  it("当所有可空字段均为 null 时应返回合理的默认值", () => {
    const backend: BackendLead = {
      id: "lead-minimal",
      community_name: "最低线索",
      is_hot: 0,
      status: "pending_assessment",
      images: [],
      created_at: "2026-01-01T00:00:00Z",
      // 以下全部为 null / undefined
      community_id: null,
      layout: null,
      orientation: null,
      floor_info: null,
      area: null,
      total_price: null,
      unit_price: null,
      eval_price: null,
      district: null,
      business_area: null,
      remarks: null,
      source_property_id: null,
      audit_reason: null,
      auditor_id: null,
      audit_time: null,
      creator_id: null,
      creator_name: null,
      last_follow_up_at: null,
    };

    const result = mapBackendToFrontend(backend);

    expect(result.id).toBe("lead-minimal");
    expect(result.communityName).toBe("最低线索");
    expect(result.communityId).toBeUndefined();
    expect(result.layout).toBe("");
    expect(result.orientation).toBe("");
    expect(result.floorInfo).toBe("");
    expect(result.area).toBe(0);
    expect(result.totalPrice).toBe(0);
    expect(result.unitPrice).toBe(0);
    expect(result.evalPrice).toBeUndefined();
    expect(result.district).toBe("");
    expect(result.businessArea).toBe("");
    expect(result.remarks).toBe("");
    expect(result.status).toBe(LeadStatus.PENDING_ASSESSMENT);
    expect(result.auditReason).toBeUndefined();
    expect(result.auditorId).toBeUndefined();
    expect(result.auditTime).toBeUndefined();
    expect(result.images).toEqual([]);
    expect(result.creatorName).toBe("未知");
    expect(result.lastFollowUpAt).toBeUndefined();
    expect(result.createdAt).toContain("2026");
  });

  // ─── 7. auditor_id 数字转字符串 ───
  it("应将 auditor_id 转换为字符串类型", () => {
    const backend = makeFullBackendLead();
    // 后端 auditor_id 类型为 string | null，但实际可能是数字
    // 代码中使用 .toString() 处理
    backend.auditor_id = "123";

    const result = mapBackendToFrontend(backend);

    expect(result.auditorId).toBe("123");
    expect(typeof result.auditorId).toBe("string");
  });

  it("当 auditor_id 为 null 时应返回 undefined", () => {
    const backend = makeFullBackendLead();
    backend.auditor_id = null;

    const result = mapBackendToFrontend(backend);

    expect(result.auditorId).toBeUndefined();
  });
});
