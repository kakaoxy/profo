import { describe, expect, it } from "vitest";
import {
  L3ProjectBriefSchema,
  L3ProjectListResponseSchema,
  ImportableMediaSchema,
  ImportPreviewDataSchema,
  ProjectQueryParamsSchema,
} from "./schemas";

// ════════════════════════════════════════════════════════════════
// L3ProjectBriefSchema
// ════════════════════════════════════════════════════════════════
describe("L3ProjectBriefSchema", () => {
  const validBrief = {
    id: "proj-001",
    name: "阳光小区3号楼",
    community_name: "阳光小区",
    address: "北京市朝阳区xxx路1号",
    status: "on_sale",
  };

  it("合法值应该通过校验", () => {
    const result = L3ProjectBriefSchema.safeParse(validBrief);
    expect(result.success).toBe(true);
  });

  it("包含可选字段应该通过校验", () => {
    const result = L3ProjectBriefSchema.safeParse({
      ...validBrief,
      area: 100,
      layout: "三室两厅",
      orientation: "南北",
    });
    expect(result.success).toBe(true);
  });

  it("缺少必填字段 id 应该校验失败", () => {
    const result = L3ProjectBriefSchema.safeParse({
      name: "阳光小区3号楼",
      community_name: "阳光小区",
      address: "北京市朝阳区xxx路1号",
      status: "on_sale",
    });
    expect(result.success).toBe(false);
  });

  it("缺少必填字段 name 应该校验失败", () => {
    const result = L3ProjectBriefSchema.safeParse({
      id: "proj-001",
      community_name: "阳光小区",
      address: "北京市朝阳区xxx路1号",
      status: "on_sale",
    });
    expect(result.success).toBe(false);
  });

  it("缺少必填字段 community_name 应该校验失败", () => {
    const result = L3ProjectBriefSchema.safeParse({
      id: "proj-001",
      name: "阳光小区3号楼",
      address: "北京市朝阳区xxx路1号",
      status: "on_sale",
    });
    expect(result.success).toBe(false);
  });

  it("缺少必填字段 address 应该校验失败", () => {
    const result = L3ProjectBriefSchema.safeParse({
      id: "proj-001",
      name: "阳光小区3号楼",
      community_name: "阳光小区",
      status: "on_sale",
    });
    expect(result.success).toBe(false);
  });

  it("缺少必填字段 status 应该校验失败", () => {
    const result = L3ProjectBriefSchema.safeParse({
      id: "proj-001",
      name: "阳光小区3号楼",
      community_name: "阳光小区",
      address: "北京市朝阳区xxx路1号",
    });
    expect(result.success).toBe(false);
  });

  it("area 为非数字应该校验失败", () => {
    const result = L3ProjectBriefSchema.safeParse({
      ...validBrief,
      area: "100",
    });
    expect(result.success).toBe(false);
  });

  it("id 为数字应该校验失败", () => {
    const result = L3ProjectBriefSchema.safeParse({
      ...validBrief,
      id: 123,
    });
    expect(result.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════
// L3ProjectListResponseSchema
// ════════════════════════════════════════════════════════════════
describe("L3ProjectListResponseSchema", () => {
  const validItem = {
    id: "proj-001",
    name: "阳光小区3号楼",
    community_name: "阳光小区",
    address: "北京市朝阳区xxx路1号",
    status: "on_sale",
  };

  it("合法值应该通过校验", () => {
    const result = L3ProjectListResponseSchema.safeParse({
      items: [validItem],
      total: 1,
      page: 1,
      page_size: 20,
    });
    expect(result.success).toBe(true);
  });

  it("空列表应该通过校验", () => {
    const result = L3ProjectListResponseSchema.safeParse({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
    });
    expect(result.success).toBe(true);
  });

  it("多个项目应该通过校验", () => {
    const result = L3ProjectListResponseSchema.safeParse({
      items: [validItem, { ...validItem, id: "proj-002", name: "花园小区1号楼" }],
      total: 2,
      page: 1,
      page_size: 20,
    });
    expect(result.success).toBe(true);
  });

  it("缺少 items 应该校验失败", () => {
    const result = L3ProjectListResponseSchema.safeParse({
      total: 0,
      page: 1,
      page_size: 20,
    });
    expect(result.success).toBe(false);
  });

  it("缺少 total 应该校验失败", () => {
    const result = L3ProjectListResponseSchema.safeParse({
      items: [],
      page: 1,
      page_size: 20,
    });
    expect(result.success).toBe(false);
  });

  it("缺少 page 应该校验失败", () => {
    const result = L3ProjectListResponseSchema.safeParse({
      items: [],
      total: 0,
      page_size: 20,
    });
    expect(result.success).toBe(false);
  });

  it("缺少 page_size 应该校验失败", () => {
    const result = L3ProjectListResponseSchema.safeParse({
      items: [],
      total: 0,
      page: 1,
    });
    expect(result.success).toBe(false);
  });

  it("items 中包含无效项应该校验失败", () => {
    const result = L3ProjectListResponseSchema.safeParse({
      items: [{ id: 123 }], // 缺少必填字段且类型错误
      total: 1,
      page: 1,
      page_size: 20,
    });
    expect(result.success).toBe(false);
  });

  it("total 为字符串应该校验失败", () => {
    const result = L3ProjectListResponseSchema.safeParse({
      items: [],
      total: "0",
      page: 1,
      page_size: 20,
    });
    expect(result.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════
// ImportableMediaSchema
// ════════════════════════════════════════════════════════════════
describe("ImportableMediaSchema", () => {
  const validMedia = {
    id: "media-001",
    file_url: "https://example.com/photo.jpg",
    photo_category: "marketing",
    sort_order: 1,
  };

  it("合法值（image 类型）应该通过校验", () => {
    const result = ImportableMediaSchema.safeParse({
      ...validMedia,
      media_type: "image",
    });
    expect(result.success).toBe(true);
  });

  it("合法值（video 类型）应该通过校验", () => {
    const result = ImportableMediaSchema.safeParse({
      ...validMedia,
      media_type: "video",
    });
    expect(result.success).toBe(true);
  });

  it("不传 media_type 应该通过校验（可选）", () => {
    const result = ImportableMediaSchema.safeParse(validMedia);
    expect(result.success).toBe(true);
  });

  it("包含所有可选字段应该通过校验", () => {
    const result = ImportableMediaSchema.safeParse({
      ...validMedia,
      thumbnail_url: "https://example.com/thumb.jpg",
      renovation_stage: "硬装完成",
      description: "客厅照片",
      media_type: "image",
    });
    expect(result.success).toBe(true);
  });

  it("缺少必填字段 id 应该校验失败", () => {
    const result = ImportableMediaSchema.safeParse({
      file_url: "https://example.com/photo.jpg",
      photo_category: "marketing",
      sort_order: 1,
    });
    expect(result.success).toBe(false);
  });

  it("缺少必填字段 file_url 应该校验失败", () => {
    const result = ImportableMediaSchema.safeParse({
      id: "media-001",
      photo_category: "marketing",
      sort_order: 1,
    });
    expect(result.success).toBe(false);
  });

  it("缺少必填字段 photo_category 应该校验失败", () => {
    const result = ImportableMediaSchema.safeParse({
      id: "media-001",
      file_url: "https://example.com/photo.jpg",
      sort_order: 1,
    });
    expect(result.success).toBe(false);
  });

  it("缺少必填字段 sort_order 应该校验失败", () => {
    const result = ImportableMediaSchema.safeParse({
      id: "media-001",
      file_url: "https://example.com/photo.jpg",
      photo_category: "marketing",
    });
    expect(result.success).toBe(false);
  });

  it("media_type 为非法值应该校验失败", () => {
    const result = ImportableMediaSchema.safeParse({
      ...validMedia,
      media_type: "audio",
    });
    expect(result.success).toBe(false);
  });

  it("sort_order 为字符串应该校验失败", () => {
    const result = ImportableMediaSchema.safeParse({
      ...validMedia,
      sort_order: "1",
    });
    expect(result.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════
// ImportPreviewDataSchema
// ════════════════════════════════════════════════════════════════
describe("ImportPreviewDataSchema", () => {
  const validMedia = {
    id: "media-001",
    file_url: "https://example.com/photo.jpg",
    photo_category: "marketing",
    sort_order: 1,
  };

  const validPreview = {
    project_id: "proj-001",
    community_name: "阳光小区",
    title: "精装好房",
    available_media: [validMedia],
  };

  it("合法值应该通过校验", () => {
    const result = ImportPreviewDataSchema.safeParse(validPreview);
    expect(result.success).toBe(true);
  });

  it("包含所有可选字段应该通过校验", () => {
    const result = ImportPreviewDataSchema.safeParse({
      ...validPreview,
      community_id: "c-001",
      layout: "三室两厅",
      orientation: "南北",
      floor_info: "12/18",
      area: 100,
      total_price: 500,
      unit_price: 5,
      tags: "地铁房",
      decoration_style: "精装",
      status: "on_sale",
    });
    expect(result.success).toBe(true);
  });

  it("缺少必填字段 project_id 应该校验失败", () => {
    const result = ImportPreviewDataSchema.safeParse({
      community_name: "阳光小区",
      title: "精装好房",
      available_media: [],
    });
    expect(result.success).toBe(false);
  });

  it("缺少必填字段 community_name 应该校验失败", () => {
    const result = ImportPreviewDataSchema.safeParse({
      project_id: "proj-001",
      title: "精装好房",
      available_media: [],
    });
    expect(result.success).toBe(false);
  });

  it("缺少必填字段 title 应该校验失败", () => {
    const result = ImportPreviewDataSchema.safeParse({
      project_id: "proj-001",
      community_name: "阳光小区",
      available_media: [],
    });
    expect(result.success).toBe(false);
  });

  it("available_media 为空数组应该通过校验", () => {
    const result = ImportPreviewDataSchema.safeParse({
      ...validPreview,
      available_media: [],
    });
    expect(result.success).toBe(true);
  });

  it("available_media 中包含无效项应该校验失败", () => {
    const result = ImportPreviewDataSchema.safeParse({
      ...validPreview,
      available_media: [{ id: 123 }],
    });
    expect(result.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════
// ProjectQueryParamsSchema
// ════════════════════════════════════════════════════════════════
describe("ProjectQueryParamsSchema", () => {
  it("合法值应该通过校验", () => {
    const result = ProjectQueryParamsSchema.safeParse({
      page: 1,
      page_size: 20,
    });
    expect(result.success).toBe(true);
  });

  it("包含可选字段应该通过校验", () => {
    const result = ProjectQueryParamsSchema.safeParse({
      community_name: "阳光小区",
      status: "on_sale",
      page: 1,
      page_size: 20,
    });
    expect(result.success).toBe(true);
  });

  it("缺少必填字段 page 应该校验失败", () => {
    const result = ProjectQueryParamsSchema.safeParse({
      page_size: 20,
    });
    expect(result.success).toBe(false);
  });

  it("缺少必填字段 page_size 应该校验失败", () => {
    const result = ProjectQueryParamsSchema.safeParse({
      page: 1,
    });
    expect(result.success).toBe(false);
  });

  it("page 为字符串应该校验失败", () => {
    const result = ProjectQueryParamsSchema.safeParse({
      page: "1",
      page_size: 20,
    });
    expect(result.success).toBe(false);
  });

  it("page_size 为字符串应该校验失败", () => {
    const result = ProjectQueryParamsSchema.safeParse({
      page: 1,
      page_size: "20",
    });
    expect(result.success).toBe(false);
  });

  it("community_name 为数字应该校验失败", () => {
    const result = ProjectQueryParamsSchema.safeParse({
      community_name: 123,
      page: 1,
      page_size: 20,
    });
    expect(result.success).toBe(false);
  });

  it("status 为数字应该校验失败", () => {
    const result = ProjectQueryParamsSchema.safeParse({
      status: 123,
      page: 1,
      page_size: 20,
    });
    expect(result.success).toBe(false);
  });
});
