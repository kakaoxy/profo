import { describe, expect, it } from "vitest";
import {
  formSchema,
  orientationEnum,
  ORIENTATION_OPTIONS,
} from "./schema";

// ── 辅助：构造合法的表单值 ──
const validFormValues = {
  community_name: "阳光小区",
  address: "北京市朝阳区xxx路1号",
  contract_no: "HT-2025-001",
};

// ════════════════════════════════════════════════════════════════
// formSchema
// ════════════════════════════════════════════════════════════════
describe("create-project/formSchema", () => {
  it("合法值应该通过校验", () => {
    const result = formSchema.safeParse(validFormValues);
    expect(result.success).toBe(true);
  });

  it("完整字段应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      community_id: "c-001",
      area: 100,
      project_manager_id: "pm-001",
      rooms: 3,
      halls: 2,
      bathrooms: 1,
      orientation: "南北",
      signing_price: 500000,
      signing_date: new Date("2025-01-01"),
      signing_period: 12,
      extension_period: 6,
      extension_rent: 3000,
      cost_assumption_type: "meifangbao",
      cost_assumption_other: "其他费用说明",
      planned_handover_date: new Date("2025-06-01"),
      other_agreements: "无特殊约定",
      owner_name: "张三",
      owner_phone: "13800138000",
      owner_id_card: "110101199001011234",
      notes: "备注信息",
      attachments: [],
    });
    expect(result.success).toBe(true);
  });

  // ── 必填字段缺失 ──
  it("缺少 community_name 应该校验失败", () => {
    const result = formSchema.safeParse({
      address: "北京市朝阳区xxx路1号",
      contract_no: "HT-2025-001",
    });
    expect(result.success).toBe(false);
  });

  it("community_name 为空字符串应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      community_name: "",
    });
    expect(result.success).toBe(false);
  });

  it("community_name 超过200字符应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      community_name: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("缺少 address 应该校验失败", () => {
    const result = formSchema.safeParse({
      community_name: "阳光小区",
      contract_no: "HT-2025-001",
    });
    expect(result.success).toBe(false);
  });

  it("address 为空字符串应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      address: "",
    });
    expect(result.success).toBe(false);
  });

  it("address 超过500字符应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      address: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("缺少 contract_no 应该校验失败", () => {
    const result = formSchema.safeParse({
      community_name: "阳光小区",
      address: "北京市朝阳区xxx路1号",
    });
    expect(result.success).toBe(false);
  });

  it("contract_no 为空字符串应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      contract_no: "",
    });
    expect(result.success).toBe(false);
  });

  it("contract_no 超过100字符应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      contract_no: "x".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  // ── 可选字段默认值 ──
  it("orientation 默认值为 南北", () => {
    const result = formSchema.safeParse(validFormValues);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orientation).toBe("南北");
    }
  });

  it("cost_assumption_type 默认值为 meifangbao", () => {
    const result = formSchema.safeParse(validFormValues);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cost_assumption_type).toBe("meifangbao");
    }
  });

  it("cost_assumption_type 非法值应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      cost_assumption_type: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("cost_assumption_type 所有合法值应该通过校验", () => {
    const validTypes = ["meifangbao", "owner", "respective", "other"];
    for (const t of validTypes) {
      const result = formSchema.safeParse({
        ...validFormValues,
        cost_assumption_type: t,
      });
      expect(result.success).toBe(true);
    }
  });

  // ── 业主信息长度限制 ──
  it("owner_name 超过100字符应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      owner_name: "x".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("owner_phone 超过20字符应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      owner_phone: "x".repeat(21),
    });
    expect(result.success).toBe(false);
  });

  it("owner_id_card 超过18字符应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      owner_id_card: "x".repeat(19),
    });
    expect(result.success).toBe(false);
  });

  it("cost_assumption_other 超过50字符应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      cost_assumption_other: "x".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  // ── signing_date 和 planned_handover_date 可为 null ──
  it("signing_date 为 null 应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      signing_date: null,
    });
    expect(result.success).toBe(true);
  });

  it("planned_handover_date 为 null 应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      planned_handover_date: null,
    });
    expect(result.success).toBe(true);
  });

  // ── 附件校验 ──
  it("合法附件应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      attachments: [
        {
          id: "att-001",
          filename: "合同.pdf",
          url: "https://example.com/contract.pdf",
          category: "signing_contract",
          fileType: "pdf",
          size: 1024,
          uploadedAt: "2025-01-01T00:00:00Z",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("附件 category 非法值应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      attachments: [
        {
          id: "att-001",
          filename: "test.pdf",
          url: "https://example.com/test.pdf",
          category: "invalid_category",
          fileType: "pdf",
          size: 1024,
          uploadedAt: "2025-01-01T00:00:00Z",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("附件 fileType 非法值应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      attachments: [
        {
          id: "att-001",
          filename: "test.pdf",
          url: "https://example.com/test.pdf",
          category: "other",
          fileType: "invalid",
          size: 1024,
          uploadedAt: "2025-01-01T00:00:00Z",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════
// optionalNumber（通过 formSchema 间接测试）
// ════════════════════════════════════════════════════════════════
describe("optionalNumber 转换", () => {
  it("数字类型应该原样保留", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      area: 100,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.area).toBe(100);
    }
  });

  it("字符串数字应该转换为数字", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      area: "88.5",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.area).toBe(88.5);
    }
  });

  it("空字符串应该转换为 undefined", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      area: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.area).toBeUndefined();
    }
  });

  it("null 应该转换为 undefined", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      area: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.area).toBeUndefined();
    }
  });

  it("undefined 应该转换为 undefined", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      area: undefined,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.area).toBeUndefined();
    }
  });

  it("非数字字符串应该转换为 undefined", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      area: "abc",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.area).toBeUndefined();
    }
  });
});

// ════════════════════════════════════════════════════════════════
// attachmentCategoryEnum（通过 formSchema 间接测试）
// ════════════════════════════════════════════════════════════════
describe("attachmentCategoryEnum", () => {
  const validCategories = [
    "signing_contract",
    "property_certificate",
    "property_survey",
    "owner_id_card",
    "owner_bank_card",
    "renovation_contract",
    "handover_document",
    "receipt",
    "cooperation_confirmation",
    "store_investment_agreement",
    "value_added_service",
    "other",
  ];

  it("所有合法 category 应该通过校验", () => {
    for (const cat of validCategories) {
      const result = formSchema.safeParse({
        ...validFormValues,
        attachments: [
          {
            id: "att-001",
            filename: "test.pdf",
            url: "https://example.com/test.pdf",
            category: cat,
            fileType: "pdf",
            size: 1024,
            uploadedAt: "2025-01-01T00:00:00Z",
          },
        ],
      });
      expect(result.success).toBe(true);
    }
  });

  it("非法 category 应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      attachments: [
        {
          id: "att-001",
          filename: "test.pdf",
          url: "https://example.com/test.pdf",
          category: "nonexistent",
          fileType: "pdf",
          size: 1024,
          uploadedAt: "2025-01-01T00:00:00Z",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════
// roomNumberSchema（通过 formSchema 间接测试）
// ════════════════════════════════════════════════════════════════
describe("roomNumberSchema", () => {
  it("正整数应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      rooms: 3,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rooms).toBe(3);
    }
  });

  it("0 应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      rooms: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rooms).toBe(0);
    }
  });

  it("字符串数字应该转换为数字", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      rooms: "5",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rooms).toBe(5);
    }
  });

  it("空字符串应该转换为 undefined", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      rooms: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rooms).toBeUndefined();
    }
  });

  it("null 应该转换为 undefined", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      rooms: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rooms).toBeUndefined();
    }
  });

  it("负数应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      rooms: -1,
    });
    expect(result.success).toBe(false);
  });

  it("小数应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      rooms: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("非数字字符串应该转换为 undefined", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      rooms: "abc",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rooms).toBeUndefined();
    }
  });

  it("halls 和 bathrooms 同样适用 roomNumberSchema 规则", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      halls: 2,
      bathrooms: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.halls).toBe(2);
      expect(result.data.bathrooms).toBe(1);
    }
  });
});

// ════════════════════════════════════════════════════════════════
// orientationEnum
// ════════════════════════════════════════════════════════════════
describe("orientationEnum", () => {
  it("所有合法朝向应该通过校验", () => {
    const validOrientations = ["南北", "南", "东", "西", "北"];
    for (const o of validOrientations) {
      const result = orientationEnum.safeParse(o);
      expect(result.success).toBe(true);
    }
  });

  it("非法朝向应该校验失败", () => {
    const result = orientationEnum.safeParse("东南");
    expect(result.success).toBe(false);
  });

  it("空字符串应该校验失败", () => {
    const result = orientationEnum.safeParse("");
    expect(result.success).toBe(false);
  });

  it("ORIENTATION_OPTIONS 与 orientationEnum 值一致", () => {
    const enumValues = ORIENTATION_OPTIONS.map((o) => o.value);
    expect(enumValues).toEqual(["南北", "南", "东", "西", "北"]);
  });
});
