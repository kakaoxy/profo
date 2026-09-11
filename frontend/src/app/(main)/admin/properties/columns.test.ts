import { describe, expect, it } from "vitest";
import { getFloorPlan } from "./columns";

/**
 * getFloorPlan 等价性测试
 *
 * 验证 P1 重构（单次循环 + toLowerCase 缓存）后业务行为与原实现一致。
 * 关键分支：
 *   1. 空输入 / 无合法链接 -> null
 *   2. 贝壳：hdic-frame 优先 → 第3张 → 第1张，追加 CDN 参数
 *   3. 我爱我家：floorplan/layout 匹配 → 最后一张
 *   4. 其他来源：第一张
 *   5. CDN 参数已存在时不重复追加
 *   6. 脏数据过滤（如 "q_80"）
 */
describe("getFloorPlan", () => {
  it("无链接时返回 null", () => {
    expect(getFloorPlan("贝壳", null)).toBeNull();
    expect(getFloorPlan("贝壳", [])).toBeNull();
    expect(getFloorPlan("贝壳", undefined)).toBeNull();
  });

  it("无合法 URL 时返回 null（脏数据过滤）", () => {
    // "q_80" 不是合法 URL，应被过滤
    expect(getFloorPlan("贝壳", ["q_80", "invalid_string"])).toBeNull();
  });

  it("贝壳：优先取 hdic-frame 链接", () => {
    const links = [
      "https://image1.ljcdn.com/1.jpg",
      "https://image1.ljcdn.com/2.jpg",
      "https://image1.ljcdn.com/hdic-frame-3.jpg",
      "https://image1.ljcdn.com/4.jpg",
    ];
    const result = getFloorPlan("贝壳", links);
    expect(result).toBe(
      "https://image1.ljcdn.com/hdic-frame-3.jpg!m_fill,w_1000,h_750,l_bk,f_jpg,ls_50",
    );
  });

  it("贝壳：hdic-frame 匹配大小写不敏感", () => {
    const links = ["https://image1.ljcdn.com/HDIC-FRAME-1.jpg", "https://image1.ljcdn.com/2.jpg"];
    const result = getFloorPlan("贝壳", links);
    expect(result).toBe(
      "https://image1.ljcdn.com/HDIC-FRAME-1.jpg!m_fill,w_1000,h_750,l_bk,f_jpg,ls_50",
    );
  });

  it("贝壳：无 hdic-frame 时回退到第3张", () => {
    const links = [
      "https://image1.ljcdn.com/1.jpg",
      "https://image1.ljcdn.com/2.jpg",
      "https://image1.ljcdn.com/3.jpg",
      "https://image1.ljcdn.com/4.jpg",
    ];
    const result = getFloorPlan("贝壳", links);
    expect(result).toBe("https://image1.ljcdn.com/3.jpg!m_fill,w_1000,h_750,l_bk,f_jpg,ls_50");
  });

  it("贝壳：无 hdic-frame 且不足3张时回退到第1张", () => {
    const links = ["https://image1.ljcdn.com/1.jpg", "https://image1.ljcdn.com/2.jpg"];
    const result = getFloorPlan("贝壳", links);
    expect(result).toBe("https://image1.ljcdn.com/1.jpg!m_fill,w_1000,h_750,l_bk,f_jpg,ls_50");
  });

  it("贝壳：CDN 参数已存在时不重复追加", () => {
    const links = ["https://image1.ljcdn.com/1.jpg!m_fill,w_1000,h_750,l_bk,f_jpg,ls_50"];
    const result = getFloorPlan("贝壳", links);
    expect(result).toBe("https://image1.ljcdn.com/1.jpg!m_fill,w_1000,h_750,l_bk,f_jpg,ls_50");
  });

  it("贝壳：本地路径不追加 CDN 参数（避免文件名带参数 404）", () => {
    const links = ["/static/uploads/properties/20260811_c930e8aa.jpg"];
    const result = getFloorPlan("贝壳", links);
    expect(result).toBe("/static/uploads/properties/20260811_c930e8aa.jpg");
  });

  it("贝壳：OSS URL 不追加 CDN 参数（避免对象 key 包含参数 404）", () => {
    const links = ["https://profo.oss-cn-shanghai.aliyuncs.com/properties/20260811_abc.png"];
    const result = getFloorPlan("贝壳", links);
    expect(result).toBe("https://profo.oss-cn-shanghai.aliyuncs.com/properties/20260811_abc.png");
  });

  it("我爱我家：优先取含 floorplan 的链接", () => {
    const links = [
      "https://5i5j.com/1.jpg",
      "https://5i5j.com/floorplan-2.jpg",
      "https://5i5j.com/3.jpg",
    ];
    const result = getFloorPlan("我爱我家", links);
    expect(result).toBe("https://5i5j.com/floorplan-2.jpg");
  });

  it("我爱我家：优先取含 layout 的链接", () => {
    const links = [
      "https://5i5j.com/1.jpg",
      "https://5i5j.com/layout-2.jpg",
      "https://5i5j.com/3.jpg",
    ];
    const result = getFloorPlan("我爱我家", links);
    expect(result).toBe("https://5i5j.com/layout-2.jpg");
  });

  it("我爱我家：匹配大小写不敏感", () => {
    const links = ["https://5i5j.com/1.jpg", "https://5i5j.com/FLOORPLAN-2.jpg"];
    const result = getFloorPlan("我爱我家", links);
    expect(result).toBe("https://5i5j.com/FLOORPLAN-2.jpg");
  });

  it("我爱我家：无匹配时回退到最后一张", () => {
    const links = ["https://5i5j.com/1.jpg", "https://5i5j.com/2.jpg", "https://5i5j.com/3.jpg"];
    const result = getFloorPlan("我爱我家", links);
    expect(result).toBe("https://5i5j.com/3.jpg");
  });

  it("其他来源：取第一张图", () => {
    const links = ["https://example.com/1.jpg", "https://example.com/2.jpg"];
    const result = getFloorPlan("链家", links);
    expect(result).toBe("https://example.com/1.jpg");
  });

  it("dataSource 为 null 时按其他来源处理（取第一张）", () => {
    const links = ["https://example.com/1.jpg"];
    const result = getFloorPlan(null, links);
    expect(result).toBe("https://example.com/1.jpg");
  });

  it("dataSource 为空字符串时按其他来源处理", () => {
    const links = ["https://example.com/1.jpg"];
    const result = getFloorPlan("", links);
    expect(result).toBe("https://example.com/1.jpg");
  });

  it("脏数据与合法 URL 混合时仅取合法 URL", () => {
    const links = ["q_80", "https://ke.com/valid.jpg"];
    const result = getFloorPlan("未知来源", links);
    expect(result).toBe("https://ke.com/valid.jpg");
  });

  it("相对路径视为合法 URL", () => {
    const links = ["/static/img/1.jpg"];
    const result = getFloorPlan("未知来源", links);
    expect(result).toBe("/static/img/1.jpg");
  });

  it("贝壳：hdic-frame 与 floorplan 同时存在时，贝壳逻辑优先用 hdic-frame", () => {
    const links = [
      "https://image1.ljcdn.com/floorplan-1.jpg",
      "https://image1.ljcdn.com/hdic-frame-2.jpg",
    ];
    const result = getFloorPlan("贝壳", links);
    expect(result).toBe(
      "https://image1.ljcdn.com/hdic-frame-2.jpg!m_fill,w_1000,h_750,l_bk,f_jpg,ls_50",
    );
  });

  it("我爱我家：hdic-frame 与 floorplan 同时存在时，我爱我家逻辑优先用 floorplan", () => {
    const links = ["https://5i5j.com/hdic-frame-1.jpg", "https://5i5j.com/floorplan-2.jpg"];
    const result = getFloorPlan("我爱我家", links);
    expect(result).toBe("https://5i5j.com/floorplan-2.jpg");
  });
});
