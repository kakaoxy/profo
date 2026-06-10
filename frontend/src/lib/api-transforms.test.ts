import { describe, it, expect } from "vitest";
import {
  transformCommunitySearch,
  transformCommunitySearchSafe,
} from "./api-transforms";

// ==================== CommunitySearchResponseSchema ====================

describe("CommunitySearchResponseSchema", () => {
  it("验证合法数据：完整字段", () => {
    const data = [
      { id: "1", name: "阳光小区", district: "浦东", business_circle: "陆家嘴" },
    ];
    const result = transformCommunitySearch(data);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
    expect(result[0].name).toBe("阳光小区");
    expect(result[0].district).toBe("浦东");
    expect(result[0].businessCircle).toBe("陆家嘴");
  });

  it("验证合法数据：district 和 business_circle 为 null", () => {
    const data = [
      { id: "2", name: "测试小区", district: null, business_circle: null },
    ];
    const result = transformCommunitySearch(data);
    expect(result[0].district).toBeUndefined();
    expect(result[0].businessCircle).toBeUndefined();
  });

  it("验证合法数据：district 和 business_circle 缺失（optional）", () => {
    const data = [{ id: "3", name: "简略小区" }];
    const result = transformCommunitySearch(data);
    expect(result[0].district).toBeUndefined();
    expect(result[0].businessCircle).toBeUndefined();
  });

  it("验证合法数据：空数组", () => {
    const result = transformCommunitySearch([]);
    expect(result).toEqual([]);
  });

  it("验证非法数据：缺少 id 字段", () => {
    const data = [{ name: "无ID小区" }];
    expect(() => transformCommunitySearch(data)).toThrow(
      "CommunitySearch 数据验证失败"
    );
  });

  it("验证非法数据：缺少 name 字段", () => {
    const data = [{ id: "1" }];
    expect(() => transformCommunitySearch(data)).toThrow(
      "CommunitySearch 数据验证失败"
    );
  });

  it("验证非法数据：id 类型错误（数字而非字符串）", () => {
    const data = [{ id: 1, name: "类型错误小区" }];
    expect(() => transformCommunitySearch(data)).toThrow(
      "CommunitySearch 数据验证失败"
    );
  });

  it("验证非法数据：传入非数组", () => {
    expect(() => transformCommunitySearch({})).toThrow(
      "CommunitySearch 数据验证失败"
    );
  });

  it("验证非法数据：传入 null", () => {
    expect(() => transformCommunitySearch(null)).toThrow(
      "CommunitySearch 数据验证失败"
    );
  });

  it("验证非法数据：传入 undefined", () => {
    expect(() => transformCommunitySearch(undefined)).toThrow(
      "CommunitySearch 数据验证失败"
    );
  });
});

// ==================== transformCommunitySearch ====================

describe("transformCommunitySearch", () => {
  it("正常转换：snake_case → camelCase 字段映射", () => {
    const data = [
      {
        id: "10",
        name: "映射小区",
        district: "徐汇",
        business_circle: "徐家汇",
      },
    ];
    const result = transformCommunitySearch(data);
    expect(result[0]).toEqual({
      id: "10",
      name: "映射小区",
      district: "徐汇",
      businessCircle: "徐家汇",
    });
    // 确保原始 snake_case 字段不存在
    expect(
      "business_circle" in result[0]
    ).toBe(false);
  });

  it("nullable → undefined 转换：null 值变为 undefined", () => {
    const data = [
      { id: "20", name: "空值小区", district: null, business_circle: null },
    ];
    const result = transformCommunitySearch(data);
    expect(result[0].district).toBeUndefined();
    expect(result[0].businessCircle).toBeUndefined();
  });

  it("nullable → undefined 转换：有值字段保持不变", () => {
    const data = [
      {
        id: "21",
        name: "有值小区",
        district: "静安",
        business_circle: "南京西路",
      },
    ];
    const result = transformCommunitySearch(data);
    expect(result[0].district).toBe("静安");
    expect(result[0].businessCircle).toBe("南京西路");
  });

  it("多条数据批量转换", () => {
    const data = [
      { id: "a", name: "小区A", district: "区域A", business_circle: "商圈A" },
      { id: "b", name: "小区B", district: null, business_circle: null },
      { id: "c", name: "小区C" },
    ];
    const result = transformCommunitySearch(data);
    expect(result).toHaveLength(3);
    expect(result[0].businessCircle).toBe("商圈A");
    expect(result[1].district).toBeUndefined();
    expect(result[2].district).toBeUndefined();
  });

  it("验证失败时抛出错误并包含验证信息", () => {
    const badData = [{ id: 123, name: "类型错误" }];
    try {
      transformCommunitySearch(badData);
      expect.unreachable("应该抛出错误");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain("CommunitySearch 数据验证失败");
    }
  });
});

// ==================== transformCommunitySearchSafe ====================

describe("transformCommunitySearchSafe", () => {
  it("正常转换：合法数据返回正确结果", () => {
    const data = [
      {
        id: "30",
        name: "安全小区",
        district: "黄浦",
        business_circle: "外滩",
      },
    ];
    const result = transformCommunitySearchSafe(data);
    expect(result).toEqual([
      {
        id: "30",
        name: "安全小区",
        district: "黄浦",
        businessCircle: "外滩",
      },
    ]);
  });

  it("验证失败时返回空数组而不抛出错误", () => {
    const badData = [{ id: 123, name: "类型错误" }];
    const result = transformCommunitySearchSafe(badData);
    expect(result).toEqual([]);
  });

  it("传入 null 返回空数组", () => {
    const result = transformCommunitySearchSafe(null);
    expect(result).toEqual([]);
  });

  it("传入 undefined 返回空数组", () => {
    const result = transformCommunitySearchSafe(undefined);
    expect(result).toEqual([]);
  });

  it("传入非数组对象返回空数组", () => {
    const result = transformCommunitySearchSafe({});
    expect(result).toEqual([]);
  });

  it("空数组正常返回空数组", () => {
    const result = transformCommunitySearchSafe([]);
    expect(result).toEqual([]);
  });
});
