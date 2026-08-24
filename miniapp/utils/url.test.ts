import { describe, expect, it } from "vitest";
import { resolveImageUrl } from "./url";

const OSS = "https://profo.oss-cn-shanghai.aliyuncs.com";

describe("resolveImageUrl OSS 水印参数拼接", () => {
  it("OSS 图片 URL 追加 ?x-oss-process=style/profo", () => {
    expect(resolveImageUrl(`${OSS}/20260801_abc.jpg`)).toBe(
      `${OSS}/20260801_abc.jpg?x-oss-process=style/profo`,
    );
  });

  it("URL 已有查询参数时用 & 拼接", () => {
    expect(resolveImageUrl(`${OSS}/a.jpg?version=1`)).toBe(
      `${OSS}/a.jpg?version=1&x-oss-process=style/profo`,
    );
  });

  it("已含 x-oss-process 时幂等跳过", () => {
    const url = `${OSS}/a.jpg?x-oss-process=style/other`;
    expect(resolveImageUrl(url)).toBe(url);
  });

  it("本地模式相对路径仅拼 origin，不加水印参数", () => {
    expect(resolveImageUrl("/static/uploads/a.jpg")).toBe(
      "https://fangmengchina.com/static/uploads/a.jpg",
    );
  });

  it("data URI 与第三方域名 URL 原样返回", () => {
    expect(resolveImageUrl("data:image/png;base64,xxx")).toBe("data:image/png;base64,xxx");
    expect(resolveImageUrl("https://third.example.com/a.jpg")).toBe(
      "https://third.example.com/a.jpg",
    );
  });

  it("相似前缀域名（钓鱼域）不命中", () => {
    expect(resolveImageUrl(`${OSS}.evil.com/a.jpg`)).toBe(`${OSS}.evil.com/a.jpg`);
  });

  it("空值返回空字符串", () => {
    expect(resolveImageUrl(null)).toBe("");
    expect(resolveImageUrl(undefined)).toBe("");
    expect(resolveImageUrl("")).toBe("");
  });
});
