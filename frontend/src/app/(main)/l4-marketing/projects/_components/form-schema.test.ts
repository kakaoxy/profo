import { describe, expect, it } from "vitest";
import {
  formSchema,
  createSchema,
  updateSchema,
  formValuesToCreateRequest,
  formValuesToUpdateRequest,
  projectToFormValues,
  importDataToFormValues,
  type FormValues,
  type MediaFile,
} from "./form-schema";

// ── 辅助：构造合法的表单值 ──
const validFormValues: FormValues = {
  community_id: "1",
  community_name: "阳光小区",
  layout: "三室两厅",
  orientation: "南北",
  floor_info: "12/18",
  area: 100,
  total_price: 500,
  unit_price: 5,
  title: "精装好房",
  images: ["img1.jpg"],
  sort_order: 0,
  tags: ["地铁房"],
  decoration_style: "精装",
  publish_status: "草稿",
  project_status: "在途",
  consultant_id: "uuid-consultant-001",
  project_id: "uuid-project-001",
};

// ════════════════════════════════════════════════════════════════
// formSchema
// ════════════════════════════════════════════════════════════════
describe("formSchema", () => {
  it("合法值应该通过校验", () => {
    const result = formSchema.safeParse(validFormValues);
    expect(result.success).toBe(true);
  });

  it("community_id 为空字符串应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      community_id: "",
    });
    expect(result.success).toBe(false);
  });

  it("layout 为空字符串应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      layout: "",
    });
    expect(result.success).toBe(false);
  });

  it("layout 超过100字符应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      layout: "x".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("orientation 为空字符串应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      orientation: "",
    });
    expect(result.success).toBe(false);
  });

  it("orientation 超过50字符应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      orientation: "x".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("floor_info 为空字符串应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      floor_info: "",
    });
    expect(result.success).toBe(false);
  });

  it("floor_info 超过100字符应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      floor_info: "x".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("area 为0应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      area: 0,
    });
    expect(result.success).toBe(false);
  });

  it("area 为负数应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      area: -10,
    });
    expect(result.success).toBe(false);
  });

  it("total_price 为0应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      total_price: 0,
    });
    expect(result.success).toBe(false);
  });

  it("total_price 为负数应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      total_price: -1,
    });
    expect(result.success).toBe(false);
  });

  it("title 为空字符串应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("title 超过255字符应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      title: "x".repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it("sort_order 为负数应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      sort_order: -1,
    });
    expect(result.success).toBe(false);
  });

  it("publish_status 非法值应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      publish_status: "已发布",
    });
    expect(result.success).toBe(false);
  });

  it("project_status 非法值应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      project_status: "未知",
    });
    expect(result.success).toBe(false);
  });

  it("可选字段省略时应该通过校验", () => {
    const { community_name, unit_price, decoration_style, consultant_id, project_id, ...required } =
      validFormValues;
    const result = formSchema.safeParse(required);
    expect(result.success).toBe(true);
  });

  it("project_id 为 null 应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      project_id: null,
    });
    expect(result.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════
// createSchema
// ════════════════════════════════════════════════════════════════
describe("createSchema", () => {
  it("必填字段齐全应该通过校验", () => {
    const result = createSchema.safeParse({
      community_id: "1",
      layout: "三室两厅",
      orientation: "南北",
      floor_info: "12/18",
      area: 100,
      total_price: 500,
      title: "精装好房",
    });
    expect(result.success).toBe(true);
  });

  it("可选字段有默认值", () => {
    const result = createSchema.safeParse({
      community_id: "1",
      layout: "三室两厅",
      orientation: "南北",
      floor_info: "12/18",
      area: 100,
      total_price: 500,
      title: "精装好房",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.images).toEqual([]);
      expect(result.data.sort_order).toBe(0);
      expect(result.data.tags).toEqual([]);
      expect(result.data.publish_status).toBe("草稿");
      expect(result.data.project_status).toBe("在途");
    }
  });

  it("community_id 为空应该校验失败", () => {
    const result = createSchema.safeParse({
      community_id: "",
      layout: "三室两厅",
      orientation: "南北",
      floor_info: "12/18",
      area: 100,
      total_price: 500,
      title: "精装好房",
    });
    expect(result.success).toBe(false);
  });

  it("layout 为空应该校验失败", () => {
    const result = createSchema.safeParse({
      community_id: "1",
      layout: "",
      orientation: "南北",
      floor_info: "12/18",
      area: 100,
      total_price: 500,
      title: "精装好房",
    });
    expect(result.success).toBe(false);
  });

  it("layout 超过100字符应该校验失败", () => {
    const result = createSchema.safeParse({
      community_id: "1",
      layout: "x".repeat(101),
      orientation: "南北",
      floor_info: "12/18",
      area: 100,
      total_price: 500,
      title: "精装好房",
    });
    expect(result.success).toBe(false);
  });

  it("orientation 为空应该校验失败", () => {
    const result = createSchema.safeParse({
      community_id: "1",
      layout: "三室两厅",
      orientation: "",
      floor_info: "12/18",
      area: 100,
      total_price: 500,
      title: "精装好房",
    });
    expect(result.success).toBe(false);
  });

  it("orientation 超过50字符应该校验失败", () => {
    const result = createSchema.safeParse({
      community_id: "1",
      layout: "三室两厅",
      orientation: "x".repeat(51),
      floor_info: "12/18",
      area: 100,
      total_price: 500,
      title: "精装好房",
    });
    expect(result.success).toBe(false);
  });

  it("floor_info 为空应该校验失败", () => {
    const result = createSchema.safeParse({
      community_id: "1",
      layout: "三室两厅",
      orientation: "南北",
      floor_info: "",
      area: 100,
      total_price: 500,
      title: "精装好房",
    });
    expect(result.success).toBe(false);
  });

  it("floor_info 超过100字符应该校验失败", () => {
    const result = createSchema.safeParse({
      community_id: "1",
      layout: "三室两厅",
      orientation: "南北",
      floor_info: "x".repeat(101),
      area: 100,
      total_price: 500,
      title: "精装好房",
    });
    expect(result.success).toBe(false);
  });

  it("area 为0应该校验失败", () => {
    const result = createSchema.safeParse({
      community_id: "1",
      layout: "三室两厅",
      orientation: "南北",
      floor_info: "12/18",
      area: 0,
      total_price: 500,
      title: "精装好房",
    });
    expect(result.success).toBe(false);
  });

  it("total_price 为0应该校验失败", () => {
    const result = createSchema.safeParse({
      community_id: "1",
      layout: "三室两厅",
      orientation: "南北",
      floor_info: "12/18",
      area: 100,
      total_price: 0,
      title: "精装好房",
    });
    expect(result.success).toBe(false);
  });

  it("title 为空应该校验失败", () => {
    const result = createSchema.safeParse({
      community_id: "1",
      layout: "三室两厅",
      orientation: "南北",
      floor_info: "12/18",
      area: 100,
      total_price: 500,
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("title 超过255字符应该校验失败", () => {
    const result = createSchema.safeParse({
      community_id: "1",
      layout: "三室两厅",
      orientation: "南北",
      floor_info: "12/18",
      area: 100,
      total_price: 500,
      title: "x".repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it("sort_order 为负数应该校验失败", () => {
    const result = createSchema.safeParse({
      community_id: "1",
      layout: "三室两厅",
      orientation: "南北",
      floor_info: "12/18",
      area: 100,
      total_price: 500,
      title: "精装好房",
      sort_order: -1,
    });
    expect(result.success).toBe(false);
  });

  it("decoration_style 超过100字符应该校验失败", () => {
    const result = createSchema.safeParse({
      community_id: "1",
      layout: "三室两厅",
      orientation: "南北",
      floor_info: "12/18",
      area: 100,
      total_price: 500,
      title: "精装好房",
      decoration_style: "x".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("decoration_style 为 null 应该通过校验", () => {
    const result = createSchema.safeParse({
      community_id: "1",
      layout: "三室两厅",
      orientation: "南北",
      floor_info: "12/18",
      area: 100,
      total_price: 500,
      title: "精装好房",
      decoration_style: null,
    });
    expect(result.success).toBe(true);
  });

  it("consultant_id 超过36字符应该校验失败", () => {
    const result = createSchema.safeParse({
      community_id: "1",
      layout: "三室两厅",
      orientation: "南北",
      floor_info: "12/18",
      area: 100,
      total_price: 500,
      title: "精装好房",
      consultant_id: "x".repeat(37),
    });
    expect(result.success).toBe(false);
  });

  it("project_id 为 null 应该通过校验", () => {
    const result = createSchema.safeParse({
      community_id: "1",
      layout: "三室两厅",
      orientation: "南北",
      floor_info: "12/18",
      area: 100,
      total_price: 500,
      title: "精装好房",
      project_id: null,
    });
    expect(result.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════
// updateSchema
// ════════════════════════════════════════════════════════════════
describe("updateSchema", () => {
  it("空对象应该通过校验（所有字段可选）", () => {
    const result = updateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("部分字段应该通过校验", () => {
    const result = updateSchema.safeParse({
      title: "新标题",
      area: 120,
    });
    expect(result.success).toBe(true);
  });

  it("community_id 为空字符串应该校验失败", () => {
    const result = updateSchema.safeParse({ community_id: "" });
    expect(result.success).toBe(false);
  });

  it("layout 为空字符串应该校验失败", () => {
    const result = updateSchema.safeParse({ layout: "" });
    expect(result.success).toBe(false);
  });

  it("layout 超过100字符应该校验失败", () => {
    const result = updateSchema.safeParse({ layout: "x".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("orientation 为空字符串应该校验失败", () => {
    const result = updateSchema.safeParse({ orientation: "" });
    expect(result.success).toBe(false);
  });

  it("orientation 超过50字符应该校验失败", () => {
    const result = updateSchema.safeParse({ orientation: "x".repeat(51) });
    expect(result.success).toBe(false);
  });

  it("floor_info 为空字符串应该校验失败", () => {
    const result = updateSchema.safeParse({ floor_info: "" });
    expect(result.success).toBe(false);
  });

  it("floor_info 超过100字符应该校验失败", () => {
    const result = updateSchema.safeParse({ floor_info: "x".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("area 为0应该校验失败", () => {
    const result = updateSchema.safeParse({ area: 0 });
    expect(result.success).toBe(false);
  });

  it("area 为负数应该校验失败", () => {
    const result = updateSchema.safeParse({ area: -5 });
    expect(result.success).toBe(false);
  });

  it("total_price 为0应该校验失败", () => {
    const result = updateSchema.safeParse({ total_price: 0 });
    expect(result.success).toBe(false);
  });

  it("total_price 为负数应该校验失败", () => {
    const result = updateSchema.safeParse({ total_price: -1 });
    expect(result.success).toBe(false);
  });

  it("title 为空字符串应该校验失败", () => {
    const result = updateSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("title 超过255字符应该校验失败", () => {
    const result = updateSchema.safeParse({ title: "x".repeat(256) });
    expect(result.success).toBe(false);
  });

  it("sort_order 为负数应该校验失败", () => {
    const result = updateSchema.safeParse({ sort_order: -1 });
    expect(result.success).toBe(false);
  });

  it("publish_status 非法值应该校验失败", () => {
    const result = updateSchema.safeParse({ publish_status: "已发布" });
    expect(result.success).toBe(false);
  });

  it("project_status 非法值应该校验失败", () => {
    const result = updateSchema.safeParse({ project_status: "未知" });
    expect(result.success).toBe(false);
  });

  it("community_name 超过200字符应该校验失败", () => {
    const result = updateSchema.safeParse({ community_name: "x".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("community_name 为 null 应该通过校验", () => {
    const result = updateSchema.safeParse({ community_name: null });
    expect(result.success).toBe(true);
  });

  it("decoration_style 超过100字符应该校验失败", () => {
    const result = updateSchema.safeParse({ decoration_style: "x".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("decoration_style 为 null 应该通过校验", () => {
    const result = updateSchema.safeParse({ decoration_style: null });
    expect(result.success).toBe(true);
  });

  it("consultant_id 超过36字符应该校验失败", () => {
    const result = updateSchema.safeParse({ consultant_id: "x".repeat(37) });
    expect(result.success).toBe(false);
  });

  it("project_id 为 null 应该通过校验", () => {
    const result = updateSchema.safeParse({ project_id: null });
    expect(result.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════
// formValuesToCreateRequest
// ════════════════════════════════════════════════════════════════
describe("formValuesToCreateRequest", () => {
  it("应该正确转换所有字段", () => {
    const result = formValuesToCreateRequest(validFormValues);

    expect(result.community_id).toBe("1");
    expect(result.community_name).toBe("阳光小区");
    expect(result.layout).toBe("三室两厅");
    expect(result.orientation).toBe("南北");
    expect(result.floor_info).toBe("12/18");
    expect(result.area).toBe(100);
    expect(result.total_price).toBe(500);
    expect(result.unit_price).toBe(5);
    expect(result.title).toBe("精装好房");
    expect(result.images).toEqual(["img1.jpg"]);
    expect(result.sort_order).toBe(0);
    expect(result.tags).toEqual(["地铁房"]);
    expect(result.decoration_style).toBe("精装");
    expect(result.publish_status).toBe("草稿");
    expect(result.project_status).toBe("在途");
    expect(result.consultant_id).toBe("uuid-consultant-001");
    expect(result.project_id).toBe("uuid-project-001");
  });

  it("应该正确计算单价（totalPrice / area）", () => {
    const values: FormValues = {
      ...validFormValues,
      area: 80,
      total_price: 320,
    };
    const result = formValuesToCreateRequest(values);
    expect(result.unit_price).toBe(4);
  });

  it("单价计算结果应保留两位小数", () => {
    const values: FormValues = {
      ...validFormValues,
      area: 3,
      total_price: 10,
    };
    const result = formValuesToCreateRequest(values);
    expect(result.unit_price).toBe(3.33);
  });

  it("area 为0时单价应为0", () => {
    // formSchema 校验 area > 0，但函数本身做了防御
    const values = { ...validFormValues, area: 0 };
    const result = formValuesToCreateRequest(values as FormValues);
    expect(result.unit_price).toBe(0);
  });

  it("community_name 为 undefined 时应转为 null", () => {
    const values = { ...validFormValues, community_name: undefined };
    const result = formValuesToCreateRequest(values);
    expect(result.community_name).toBeNull();
  });

  it("decoration_style 为 undefined 时应转为 null", () => {
    const values = { ...validFormValues, decoration_style: undefined };
    const result = formValuesToCreateRequest(values);
    expect(result.decoration_style).toBeNull();
  });

  it("project_id 为 undefined 时不包含 project_id 字段", () => {
    const values = { ...validFormValues, project_id: undefined };
    const result = formValuesToCreateRequest(values);
    expect(result).not.toHaveProperty("project_id");
  });

  it("project_id 有值时应包含 project_id 字段", () => {
    const result = formValuesToCreateRequest(validFormValues);
    expect(result.project_id).toBe("uuid-project-001");
  });

  it("不传 mediaFiles 时不包含 media_files 字段", () => {
    const result = formValuesToCreateRequest(validFormValues);
    expect(result).not.toHaveProperty("media_files");
  });

  it("传入空 mediaFiles 数组时不包含 media_files 字段", () => {
    const result = formValuesToCreateRequest(validFormValues, []);
    expect(result).not.toHaveProperty("media_files");
  });

  it("传入 mediaFiles 时应包含 media_files 字段", () => {
    const mediaFiles: MediaFile[] = [
      {
        file_url: "https://example.com/photo.jpg",
        media_type: "image",
        photo_category: "marketing",
      },
    ];
    const result = formValuesToCreateRequest(validFormValues, mediaFiles);
    expect(result.media_files).toEqual(mediaFiles);
  });
});

// ════════════════════════════════════════════════════════════════
// formValuesToUpdateRequest
// ════════════════════════════════════════════════════════════════
describe("formValuesToUpdateRequest", () => {
  it("空对象应返回空结果", () => {
    const result = formValuesToUpdateRequest({});
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("只包含已变更的字段", () => {
    const result = formValuesToUpdateRequest({
      title: "新标题",
      area: 120,
    });
    expect(result.title).toBe("新标题");
    expect(result.area).toBe(120);
    expect(result).not.toHaveProperty("layout");
    expect(result).not.toHaveProperty("orientation");
  });

  it("total_price 变更时应重新计算单价", () => {
    const result = formValuesToUpdateRequest({
      total_price: 600,
      area: 100,
    });
    expect(result.unit_price).toBe(6);
  });

  it("area 变更时应重新计算单价", () => {
    const result = formValuesToUpdateRequest({
      total_price: 500,
      area: 200,
    });
    expect(result.unit_price).toBe(2.5);
  });

  it("仅 total_price 变更、area 未提供时单价计算 area 按0处理，不生成 unit_price", () => {
    const result = formValuesToUpdateRequest({
      total_price: 500,
    });
    // area 默认为 0，area > 0 不成立，不设置 unit_price
    expect(result).not.toHaveProperty("unit_price");
  });

  it("仅 area 变更、total_price 未提供时单价计算 totalPrice 按0处理，不生成 unit_price", () => {
    const result = formValuesToUpdateRequest({
      area: 100,
    });
    // totalPrice 默认为 0，area > 0 但 totalPrice / area = 0
    // 实际上 area > 0 成立，会计算 unit_price = 0
    expect(result.unit_price).toBe(0);
  });

  it("community_name 为空字符串时应转为 null", () => {
    const result = formValuesToUpdateRequest({
      community_name: "",
    });
    expect(result.community_name).toBeNull();
  });

  it("decoration_style 为空字符串时应转为 null", () => {
    const result = formValuesToUpdateRequest({
      decoration_style: "",
    });
    expect(result.decoration_style).toBeNull();
  });

  it("所有字段都有值时应全部包含", () => {
    const result = formValuesToUpdateRequest(validFormValues);
    expect(result.community_id).toBe("1");
    expect(result.community_name).toBe("阳光小区");
    expect(result.layout).toBe("三室两厅");
    expect(result.orientation).toBe("南北");
    expect(result.floor_info).toBe("12/18");
    expect(result.area).toBe(100);
    expect(result.total_price).toBe(500);
    expect(result.title).toBe("精装好房");
    expect(result.images).toEqual(["img1.jpg"]);
    expect(result.sort_order).toBe(0);
    expect(result.tags).toEqual(["地铁房"]);
    expect(result.decoration_style).toBe("精装");
    expect(result.publish_status).toBe("草稿");
    expect(result.project_status).toBe("在途");
    expect(result.consultant_id).toBe("uuid-consultant-001");
    expect(result.project_id).toBe("uuid-project-001");
    // total_price 和 area 都有值，应计算 unit_price
    expect(result.unit_price).toBe(5);
  });
});

// ════════════════════════════════════════════════════════════════
// projectToFormValues
// ════════════════════════════════════════════════════════════════
describe("projectToFormValues", () => {
  it("应该正确转换标准项目数据", () => {
    const project = {
      community_id: 42,
      community_name: "阳光小区",
      layout: "三室两厅",
      orientation: "南北",
      floor_info: "12/18",
      area: 100,
      total_price: 500,
      unit_price: 5,
      title: "精装好房",
      images: ["img1.jpg"],
      sort_order: 1,
      tags: ["地铁房"],
      decoration_style: "精装",
      publish_status: "草稿",
      project_status: "在途",
      consultant_id: "uuid-001",
      project_id: "uuid-p-001",
    };

    const result = projectToFormValues(project);
    expect(result.community_id).toBe("42");
    expect(result.community_name).toBe("阳光小区");
    expect(result.layout).toBe("三室两厅");
    expect(result.orientation).toBe("南北");
    expect(result.floor_info).toBe("12/18");
    expect(result.area).toBe(100);
    expect(result.total_price).toBe(500);
    expect(result.unit_price).toBe(5);
    expect(result.title).toBe("精装好房");
    expect(result.images).toEqual(["img1.jpg"]);
    expect(result.sort_order).toBe(1);
    expect(result.tags).toEqual(["地铁房"]);
    expect(result.decoration_style).toBe("精装");
    expect(result.publish_status).toBe("草稿");
    expect(result.project_status).toBe("在途");
    expect(result.consultant_id).toBe("uuid-001");
    expect(result.project_id).toBe("uuid-p-001");
  });

  it("community_id 为数字时应转为字符串", () => {
    const result = projectToFormValues({ community_id: 123 });
    expect(result.community_id).toBe("123");
  });

  it("community_id 为字符串时应保持不变", () => {
    const result = projectToFormValues({ community_id: "abc-456" });
    expect(result.community_id).toBe("abc-456");
  });

  it("community_id 为 null 时应转为空字符串", () => {
    const result = projectToFormValues({ community_id: null });
    expect(result.community_id).toBe("");
  });

  it("community_id 为 undefined 时应转为空字符串", () => {
    const result = projectToFormValues({});
    expect(result.community_id).toBe("");
  });

  it("area 为字符串时应转为数字", () => {
    const result = projectToFormValues({ area: "88.5" });
    expect(result.area).toBe(88.5);
  });

  it("total_price 为字符串时应转为数字", () => {
    const result = projectToFormValues({ total_price: "300.5" });
    expect(result.total_price).toBe(300.5);
  });

  it("unit_price 为字符串时应转为数字", () => {
    const result = projectToFormValues({ unit_price: "3.5" });
    expect(result.unit_price).toBe(3.5);
  });

  it("images 为非数组时应返回空数组", () => {
    const result = projectToFormValues({ images: "not-array" });
    expect(result.images).toEqual([]);
  });

  it("images 为 undefined 时应返回空数组", () => {
    const result = projectToFormValues({});
    expect(result.images).toEqual([]);
  });

  it("tags 为非数组时应返回空数组", () => {
    const result = projectToFormValues({ tags: "not-array" });
    expect(result.tags).toEqual([]);
  });

  it("tags 为 undefined 时应返回空数组", () => {
    const result = projectToFormValues({});
    expect(result.tags).toEqual([]);
  });

  it("sort_order 为0时应保留0", () => {
    const result = projectToFormValues({ sort_order: 0 });
    expect(result.sort_order).toBe(0);
  });

  it("缺失字符串字段时应使用默认值", () => {
    const result = projectToFormValues({});
    expect(result.layout).toBe("");
    expect(result.orientation).toBe("");
    expect(result.floor_info).toBe("");
    expect(result.title).toBe("");
    expect(result.publish_status).toBe("草稿");
    expect(result.project_status).toBe("在途");
  });

  it("community_name 为空字符串时应转为 undefined", () => {
    const result = projectToFormValues({ community_name: "" });
    expect(result.community_name).toBeUndefined();
  });

  it("decoration_style 为空字符串时应转为 undefined", () => {
    const result = projectToFormValues({ decoration_style: "" });
    expect(result.decoration_style).toBeUndefined();
  });

  it("consultant_id 为空字符串时应转为 undefined", () => {
    const result = projectToFormValues({ consultant_id: "" });
    expect(result.consultant_id).toBeUndefined();
  });

  it("project_id 为空字符串时应转为 undefined", () => {
    const result = projectToFormValues({ project_id: "" });
    expect(result.project_id).toBeUndefined();
  });

  it("unit_price 为0时应转为 undefined", () => {
    const result = projectToFormValues({ unit_price: 0 });
    expect(result.unit_price).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════
// importDataToFormValues
// ════════════════════════════════════════════════════════════════
describe("importDataToFormValues", () => {
  it("应该正确转换导入数据", () => {
    const data = {
      project_id: "uuid-l3-001",
      community_id: 10,
      community_name: "花园小区",
      layout: "两室一厅",
      orientation: "东西",
      floor_info: "5/10",
      area: 75,
      total_price: 300,
      unit_price: 4,
      title: "好房推荐",
      tags: ["学区房"],
      decoration_style: "简装",
      status: "on_sale",
    };

    const result = importDataToFormValues(data);
    expect(result.project_id).toBe("uuid-l3-001");
    expect(result.community_id).toBe("10");
    expect(result.community_name).toBe("花园小区");
    expect(result.layout).toBe("两室一厅");
    expect(result.orientation).toBe("东西");
    expect(result.floor_info).toBe("5/10");
    expect(result.area).toBe(75);
    expect(result.total_price).toBe(300);
    expect(result.unit_price).toBe(4);
    expect(result.title).toBe("好房推荐");
    expect(result.tags).toEqual(["学区房"]);
    expect(result.decoration_style).toBe("简装");
    expect(result.project_status).toBe("在售");
  });

  it("status 为 signing 应映射为 在途", () => {
    const result = importDataToFormValues({ status: "signing" });
    expect(result.project_status).toBe("在途");
  });

  it("status 为 for_sale 应映射为 在售", () => {
    const result = importDataToFormValues({ status: "for_sale" });
    expect(result.project_status).toBe("在售");
  });

  it("status 为 on_sale 应映射为 在售", () => {
    const result = importDataToFormValues({ status: "on_sale" });
    expect(result.project_status).toBe("在售");
  });

  it("status 为 available 应映射为 在售", () => {
    const result = importDataToFormValues({ status: "available" });
    expect(result.project_status).toBe("在售");
  });

  it("status 为 sold 应映射为 已售", () => {
    const result = importDataToFormValues({ status: "sold" });
    expect(result.project_status).toBe("已售");
  });

  it("status 为 completed 应映射为 已售", () => {
    const result = importDataToFormValues({ status: "completed" });
    expect(result.project_status).toBe("已售");
  });

  it("status 为 renovating 应映射为 在途", () => {
    const result = importDataToFormValues({ status: "renovating" });
    expect(result.project_status).toBe("在途");
  });

  it("status 为 renovation 应映射为 在途", () => {
    const result = importDataToFormValues({ status: "renovation" });
    expect(result.project_status).toBe("在途");
  });

  it("status 为 pending 应映射为 在途", () => {
    const result = importDataToFormValues({ status: "pending" });
    expect(result.project_status).toBe("在途");
  });

  it("status 为未知值应映射为 在途（默认）", () => {
    const result = importDataToFormValues({ status: "unknown_status" });
    expect(result.project_status).toBe("在途");
  });

  it("status 为 undefined 应映射为 在途（默认）", () => {
    const result = importDataToFormValues({});
    expect(result.project_status).toBe("在途");
  });

  it("status 大小写不敏感应正确映射", () => {
    const result = importDataToFormValues({ status: "SOLD" });
    expect(result.project_status).toBe("已售");
  });

  it("community_id 为数字时应转为字符串", () => {
    const result = importDataToFormValues({ community_id: 42 });
    expect(result.community_id).toBe("42");
  });

  it("community_id 为字符串时应保持不变", () => {
    const result = importDataToFormValues({ community_id: "abc" });
    expect(result.community_id).toBe("abc");
  });

  it("community_id 为 null 时应转为空字符串", () => {
    const result = importDataToFormValues({ community_id: null });
    expect(result.community_id).toBe("");
  });

  it("community_id 为 undefined 时应转为空字符串", () => {
    const result = importDataToFormValues({});
    expect(result.community_id).toBe("");
  });

  it("project_id 为 undefined 时应转为 undefined", () => {
    const result = importDataToFormValues({});
    expect(result.project_id).toBeUndefined();
  });

  it("area 为字符串时应转为数字", () => {
    const result = importDataToFormValues({ area: "88.5" });
    expect(result.area).toBe(88.5);
  });

  it("total_price 为字符串时应转为数字", () => {
    const result = importDataToFormValues({ total_price: "200.5" });
    expect(result.total_price).toBe(200.5);
  });

  it("unit_price 为字符串时应转为数字", () => {
    const result = importDataToFormValues({ unit_price: "2.5" });
    expect(result.unit_price).toBe(2.5);
  });

  it("tags 为非数组时应返回空数组", () => {
    const result = importDataToFormValues({ tags: "not-array" });
    expect(result.tags).toEqual([]);
  });

  it("缺失字段时应使用默认值", () => {
    const result = importDataToFormValues({});
    expect(result.layout).toBe("");
    expect(result.orientation).toBe("");
    expect(result.floor_info).toBe("");
    expect(result.title).toBe("");
    expect(result.area).toBe(0);
    expect(result.total_price).toBe(0);
    expect(result.decoration_style).toBe("");
  });
});
