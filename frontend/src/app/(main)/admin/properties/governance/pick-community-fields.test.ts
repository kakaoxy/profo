import { describe, expect, it } from "vitest";
import { pickCommunityFields, type Community } from "./pick-community-fields";

/**
 * pickCommunityFields 等价性测试
 *
 * 验证 P2 重构（RSC 序列化精简）后：
 *   1. 前端实际使用的 8 个字段完整保留（含 is_active / aliases）
 *   2. 剔除 city_id / avg_price_wan（前端无引用）
 *   3. 字段值与原对象一致
 */
describe("pickCommunityFields", () => {
  const fullCommunity: Community = {
    id: "abc-123",
    name: "黄浦花园",
    city_id: 1,
    district: "黄浦区",
    business_circle: "人民广场",
    avg_price_wan: 85000,
    total_properties: 42,
    is_active: true,
    created_at: "2025-01-15T08:30:00Z",
    aliases: [{ id: "al-1", alias_name: "黄浦花园（别名）", data_source: "manual", created_at: "2025-01-16T08:30:00Z" }],
  };

  it("保留 id 字段", () => {
    expect(pickCommunityFields(fullCommunity).id).toBe("abc-123");
  });

  it("保留 name 字段", () => {
    expect(pickCommunityFields(fullCommunity).name).toBe("黄浦花园");
  });

  it("保留 district 字段", () => {
    expect(pickCommunityFields(fullCommunity).district).toBe("黄浦区");
  });

  it("保留 business_circle 字段", () => {
    expect(pickCommunityFields(fullCommunity).business_circle).toBe("人民广场");
  });

  it("保留 total_properties 字段", () => {
    expect(pickCommunityFields(fullCommunity).total_properties).toBe(42);
  });

  it("保留 created_at 字段", () => {
    expect(pickCommunityFields(fullCommunity).created_at).toBe("2025-01-15T08:30:00Z");
  });

  it("保留 is_active 字段", () => {
    expect(pickCommunityFields(fullCommunity).is_active).toBe(true);
  });

  it("保留 aliases 字段", () => {
    expect(pickCommunityFields(fullCommunity).aliases).toEqual(fullCommunity.aliases);
  });

  it("is_active 缺省时回退为 true", () => {
    const input = { ...fullCommunity, is_active: undefined } as Community;
    expect(pickCommunityFields(input).is_active).toBe(true);
  });

  it("aliases 缺省时回退为空数组", () => {
    const input = { ...fullCommunity, aliases: undefined } as Community;
    expect(pickCommunityFields(input).aliases).toEqual([]);
  });

  it("剔除 city_id 字段", () => {
    const result = pickCommunityFields(fullCommunity) as Record<string, unknown>;
    expect(result).not.toHaveProperty("city_id");
  });

  it("剔除 avg_price_wan 字段", () => {
    const result = pickCommunityFields(fullCommunity) as Record<string, unknown>;
    expect(result).not.toHaveProperty("avg_price_wan");
  });

  it("结果对象仅含 8 个字段", () => {
    const result = pickCommunityFields(fullCommunity) as Record<string, unknown>;
    expect(Object.keys(result).sort()).toEqual(
      ["id", "name", "district", "business_circle", "total_properties", "is_active", "created_at", "aliases"].sort(),
    );
  });

  it("district 为 null 时保留 null", () => {
    const input: Community = { ...fullCommunity, district: null };
    expect(pickCommunityFields(input).district).toBeNull();
  });

  it("business_circle 为 null 时保留 null", () => {
    const input: Community = { ...fullCommunity, business_circle: null };
    expect(pickCommunityFields(input).business_circle).toBeNull();
  });

  it("district 为 undefined 时保留 undefined", () => {
    const input: Community = {
      ...fullCommunity,
      district: undefined,
    };
    expect(pickCommunityFields(input).district).toBeUndefined();
  });

  it("business_circle 为 undefined 时保留 undefined", () => {
    const input: Community = {
      ...fullCommunity,
      business_circle: undefined,
    };
    expect(pickCommunityFields(input).business_circle).toBeUndefined();
  });

  it("批量映射保持顺序与数量", () => {
    const items: Community[] = [
      fullCommunity,
      { ...fullCommunity, id: "def-456", name: "静安嘉里中心" },
      { ...fullCommunity, id: "ghi-789", name: "徐汇苑" },
    ];
    const result = items.map(pickCommunityFields);
    expect(result).toHaveLength(3);
    expect(result.map((c) => c.id)).toEqual(["abc-123", "def-456", "ghi-789"]);
    expect(result.map((c) => c.name)).toEqual(["黄浦花园", "静安嘉里中心", "徐汇苑"]);
  });
});
