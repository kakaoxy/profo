import { describe, expect, it } from "vitest";
import { formSchema } from "./schema";

// ── 辅助：构造合法的表单值 ──
const validFormValues = {
  title: "精装好房推荐",
  cover_image: null,
  style: null,
  description: null,
  marketing_tags: ["地铁房", "学区房"],
  share_title: null,
  share_image: null,
  consultant_id: null,
  is_published: false,
  sort_order: 0,
};

// ════════════════════════════════════════════════════════════════
// formSchema
// ════════════════════════════════════════════════════════════════
describe("l4-marketing/[id]/formSchema", () => {
  it("合法值应该通过校验", () => {
    const result = formSchema.safeParse(validFormValues);
    expect(result.success).toBe(true);
  });

  it("所有字段有值应该通过校验", () => {
    const result = formSchema.safeParse({
      title: "精装好房推荐",
      cover_image: "https://example.com/cover.jpg",
      style: "现代简约",
      description: "三室两厅，南北通透",
      marketing_tags: ["地铁房", "学区房"],
      share_title: "分享标题",
      share_image: "https://example.com/share.jpg",
      consultant_id: "uuid-consultant-001",
      is_published: true,
      sort_order: 10,
    });
    expect(result.success).toBe(true);
  });

  // ── title 必填 ──
  it("title 为空字符串应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("缺少 title 应该校验失败", () => {
    const result = formSchema.safeParse({
      cover_image: null,
      style: null,
      description: null,
      marketing_tags: [],
      share_title: null,
      share_image: null,
      consultant_id: null,
      is_published: false,
      sort_order: 0,
    });
    expect(result.success).toBe(false);
  });

  // ── nullable 字段 ──
  it("cover_image 为 null 应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      cover_image: null,
    });
    expect(result.success).toBe(true);
  });

  it("cover_image 为字符串应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      cover_image: "https://example.com/cover.jpg",
    });
    expect(result.success).toBe(true);
  });

  it("style 为 null 应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      style: null,
    });
    expect(result.success).toBe(true);
  });

  it("style 为字符串应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      style: "北欧风",
    });
    expect(result.success).toBe(true);
  });

  it("description 为 null 应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      description: null,
    });
    expect(result.success).toBe(true);
  });

  it("description 为字符串应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      description: "三室两厅，南北通透",
    });
    expect(result.success).toBe(true);
  });

  it("share_title 为 null 应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      share_title: null,
    });
    expect(result.success).toBe(true);
  });

  it("share_image 为 null 应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      share_image: null,
    });
    expect(result.success).toBe(true);
  });

  it("consultant_id 为 null 应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      consultant_id: null,
    });
    expect(result.success).toBe(true);
  });

  it("consultant_id 为字符串应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      consultant_id: "uuid-consultant-001",
    });
    expect(result.success).toBe(true);
  });

  // ── marketing_tags ──
  it("marketing_tags 为空数组应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      marketing_tags: [],
    });
    expect(result.success).toBe(true);
  });

  it("marketing_tags 为字符串数组应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      marketing_tags: ["地铁房", "学区房", "精装修"],
    });
    expect(result.success).toBe(true);
  });

  it("marketing_tags 为 null 应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      marketing_tags: null,
    });
    expect(result.success).toBe(false);
  });

  it("marketing_tags 包含非字符串应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      marketing_tags: [123],
    });
    expect(result.success).toBe(false);
  });

  // ── is_published ──
  it("is_published 为 true 应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      is_published: true,
    });
    expect(result.success).toBe(true);
  });

  it("is_published 为 false 应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      is_published: false,
    });
    expect(result.success).toBe(true);
  });

  it("is_published 为字符串应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      is_published: "true",
    });
    expect(result.success).toBe(false);
  });

  // ── sort_order ──
  it("sort_order 为 0 应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      sort_order: 0,
    });
    expect(result.success).toBe(true);
  });

  it("sort_order 为正数应该通过校验", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      sort_order: 100,
    });
    expect(result.success).toBe(true);
  });

  it("sort_order 为字符串应该校验失败", () => {
    const result = formSchema.safeParse({
      ...validFormValues,
      sort_order: "0",
    });
    expect(result.success).toBe(false);
  });

  it("缺少 sort_order 应该校验失败", () => {
    const result = formSchema.safeParse({
      title: "精装好房推荐",
      cover_image: null,
      style: null,
      description: null,
      marketing_tags: [],
      share_title: null,
      share_image: null,
      consultant_id: null,
      is_published: false,
    });
    expect(result.success).toBe(false);
  });

  // ── 缺少必填字段 ──
  it("缺少 is_published 应该校验失败", () => {
    const result = formSchema.safeParse({
      title: "精装好房推荐",
      cover_image: null,
      style: null,
      description: null,
      marketing_tags: [],
      share_title: null,
      share_image: null,
      consultant_id: null,
      sort_order: 0,
    });
    expect(result.success).toBe(false);
  });

  it("缺少 marketing_tags 应该校验失败", () => {
    const result = formSchema.safeParse({
      title: "精装好房推荐",
      cover_image: null,
      style: null,
      description: null,
      share_title: null,
      share_image: null,
      consultant_id: null,
      is_published: false,
      sort_order: 0,
    });
    expect(result.success).toBe(false);
  });
});
