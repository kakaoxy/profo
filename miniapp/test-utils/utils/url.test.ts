import { describe, expect, it } from "vitest";
import { resolveImageUrl } from "../../utils/url";

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

describe("resolveImageUrl 显式尺寸参数（P-03）", () => {
  it("传 width/quality 拼接 image/resize 参数（替代水印样式）", () => {
    expect(resolveImageUrl(`${OSS}/a.jpg`, { width: 750, quality: 80 })).toBe(
      `${OSS}/a.jpg?x-oss-process=image/resize,w_750/quality,q_80`,
    );
  });

  it("仅传 width 只拼 resize", () => {
    expect(resolveImageUrl(`${OSS}/a.jpg`, { width: 500 })).toBe(
      `${OSS}/a.jpg?x-oss-process=image/resize,w_500`,
    );
  });

  it("仅传 quality 只拼 quality", () => {
    expect(resolveImageUrl(`${OSS}/a.jpg`, { quality: 60 })).toBe(
      `${OSS}/a.jpg?x-oss-process=image/quality,q_60`,
    );
  });

  it("已含 x-oss-process 时尺寸参数幂等跳过", () => {
    const url = `${OSS}/a.jpg?x-oss-process=style/profo`;
    expect(resolveImageUrl(url, { width: 750 })).toBe(url);
  });

  it("本地模式相对路径不拼尺寸参数", () => {
    expect(resolveImageUrl("/static/uploads/a.jpg", { width: 750 })).toBe(
      "https://fangmengchina.com/static/uploads/a.jpg",
    );
  });

  it("不传 opts 时保持默认水印行为", () => {
    expect(resolveImageUrl(`${OSS}/a.jpg`)).toBe(`${OSS}/a.jpg?x-oss-process=style/profo`);
  });
});
