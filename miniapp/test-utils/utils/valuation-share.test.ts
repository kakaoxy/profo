import { describe, expect, it } from "vitest";
import {
  buildValuationSharePath,
  parseValuationQuery,
  VALUATION_SHARE_IMAGE,
  VALUATION_SHARE_TITLE,
} from "../../utils/valuation-share";

describe("parseValuationQuery", () => {
  it("解析出 referrer", () => {
    expect(parseValuationQuery({ referrer: "emp1" })).toEqual({ referrer: "emp1" });
  });

  it("referrer 缺省为空串", () => {
    expect(parseValuationQuery({})).toEqual({ referrer: "" });
    expect(parseValuationQuery({ source: "card" })).toEqual({ referrer: "" });
  });
});

describe("buildValuationSharePath", () => {
  it("带 referrer 生成完整 path（含 source=card）", () => {
    expect(buildValuationSharePath("emp1")).toBe(
      "/pages/valuation/submit/index?referrer=emp1&source=card",
    );
  });

  it("referrer 为空时不拼接该参数（直接分享无归属）", () => {
    expect(buildValuationSharePath("")).toBe("/pages/valuation/submit/index?source=card");
  });

  it("对特殊字符进行 encodeURIComponent", () => {
    expect(buildValuationSharePath("张 三&a")).toBe(
      "/pages/valuation/submit/index?referrer=%E5%BC%A0%20%E4%B8%89%26a&source=card",
    );
  });
});

describe("VALUATION_SHARE_TITLE", () => {
  it("标题与 about 服务页分享卡片一致", () => {
    expect(VALUATION_SHARE_TITLE).toBe("零现金焕新，全流程托管，点击了解您的房价");
  });
});

describe("VALUATION_SHARE_IMAGE", () => {
  it("图片与 about 服务页分享卡片一致", () => {
    expect(VALUATION_SHARE_IMAGE).toBe("/assets/share.jpg");
  });
});
