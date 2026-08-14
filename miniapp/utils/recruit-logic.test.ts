import { describe, expect, it } from "vitest";
import {
  buildShareEventPayload,
  buildSharePath,
  buildShareQuery,
  checkRecruitForm,
  isDeepView,
  parseRecruitQuery,
  RECRUIT_LANDING_CONTENT,
} from "./recruit-logic";

describe("parseRecruitQuery", () => {
  it("解析出 campaign_id / referrer / source", () => {
    const q = parseRecruitQuery({ campaign_id: "abc", referrer: "emp1", source: "poster" });
    expect(q).toEqual({ campaignId: "abc", referrer: "emp1", source: "poster" });
  });

  it("source 非 poster 时默认 card", () => {
    expect(parseRecruitQuery({ source: "unknown" }).source).toBe("card");
    expect(parseRecruitQuery({}).source).toBe("card");
  });

  it("缺省 campaign_id 用兜底值", () => {
    expect(parseRecruitQuery({}, "fallback").campaignId).toBe("fallback");
    expect(parseRecruitQuery({}).campaignId).toBe("");
  });

  it("referrer 缺省为空串", () => {
    expect(parseRecruitQuery({}).referrer).toBe("");
  });
});

describe("isDeepView", () => {
  it("停留 >= 3000ms 判定深度浏览", () => {
    expect(isDeepView(3000)).toBe(true);
    expect(isDeepView(5000)).toBe(true);
  });

  it("停留 < 3000ms 非深度浏览", () => {
    expect(isDeepView(2999)).toBe(false);
    expect(isDeepView(0)).toBe(false);
  });
});

describe("checkRecruitForm", () => {
  it("主营商圈为空提示先填写商圈", () => {
    expect(checkRecruitForm("", true)).toBe("请先填写主营商圈");
    expect(checkRecruitForm("   ", false)).toBe("请先填写主营商圈");
  });

  it("商圈已填但未勾协议提示先阅读协议", () => {
    expect(checkRecruitForm("静安", false)).toBe("请先阅读并同意隐私协议");
  });

  it("全部通过返回空串", () => {
    expect(checkRecruitForm("静安", true)).toBe("");
  });
});

describe("buildShareQuery", () => {
  it("带 referrer 生成 query 串（不含 path）", () => {
    expect(buildShareQuery("abc", "emp1", "card")).toBe(
      "campaign_id=abc&referrer=emp1&source=card",
    );
  });

  it("无 referrer 时省略该参数", () => {
    expect(buildShareQuery("abc", "", "poster")).toBe(
      "campaign_id=abc&source=poster",
    );
  });

  it("对特殊字符进行 encodeURIComponent", () => {
    expect(buildShareQuery("a&b", "张三", "card")).toBe(
      "campaign_id=a%26b&referrer=%E5%BC%A0%E4%B8%89&source=card",
    );
  });
});

describe("buildSharePath", () => {
  it("带 referrer 生成完整 path", () => {
    expect(buildSharePath("abc", "emp1", "card")).toBe(
      "/pages/recruit/detail/index?campaign_id=abc&referrer=emp1&source=card",
    );
  });

  it("无 referrer 时省略该参数", () => {
    expect(buildSharePath("abc", "", "poster")).toBe(
      "/pages/recruit/detail/index?campaign_id=abc&source=poster",
    );
  });
});

describe("RECRUIT_LANDING_CONTENT", () => {
  it("Hero 含 title / lead / tags / closerPrefix / closerBold", () => {
    const { hero } = RECRUIT_LANDING_CONTENT;
    expect(hero.title).toBe("你缺客户吗？");
    expect(hero.lead).toBe("我们就是那个——");
    expect(hero.tags).toEqual(["不约时间", "不磨价格", "不玩消失"]);
    expect(hero.closerPrefix).toBe("的");
    expect(hero.closerBold).toContain("神仙客户");
  });

  it("数据卡含 3 项（经纪人 / 商圈 / 佣金），target 为数值用于滚动", () => {
    const { stats } = RECRUIT_LANDING_CONTENT;
    expect(stats).toHaveLength(3);
    expect(stats[0].target).toBe(300);
    expect(stats[0].suffix).toBe("+");
    expect(stats[0].unit).toBe("人");
    expect(stats[0].label).toBe("已合作经纪人");
    expect(stats[1].target).toBe(15);
    expect(stats[1].unit).toBe("个");
    expect(stats[1].label).toBe("覆盖商圈");
    expect(stats[2].yen).toBe("¥");
    expect(stats[2].target).toBe(1000);
    expect(stats[2].suffix).toBe("W+");
    expect(stats[2].label).toBe("累计佣金");
  });

  it("痛点含 3 项且仅中项 warm=true", () => {
    const { pains } = RECRUIT_LANDING_CONTENT;
    expect(pains).toHaveLength(3);
    expect(pains.map((p) => p.warm)).toEqual([false, true, false]);
    expect(pains.every((p) => p.q && p.aBold)).toBe(true);
  });

  it("优势含 4 项 01-04 编号", () => {
    const { whys } = RECRUIT_LANDING_CONTENT;
    expect(whys).toHaveLength(4);
    expect(whys.map((w) => w.num)).toEqual(["01", "02", "03", "04"]);
    expect(whys.every((w) => w.title && w.desc)).toBe(true);
  });

  it("流程含 5 步", () => {
    const { flow } = RECRUIT_LANDING_CONTENT;
    expect(flow).toHaveLength(5);
    expect(flow[0].name).toBe("推荐房源");
    expect(flow[4].name).toBe("佣金到账");
    expect(flow.every((f) => f.name && f.desc)).toBe(true);
  });

  it("评价含 2 条且 stars=5", () => {
    const { reviews } = RECRUIT_LANDING_CONTENT;
    expect(reviews).toHaveLength(2);
    expect(reviews.every((r) => r.stars === 5)).toBe(true);
    expect(reviews[0].name).toBe("洪店长");
    expect(reviews[1].name).toBe("李店长");
    expect(reviews.every((r) => r.avatar && r.text && r.role)).toBe(true);
  });

  it("区段标题字段齐全", () => {
    const { painTitle, whyTitle, flowTitle, reviewTitle } = RECRUIT_LANDING_CONTENT;
    expect(painTitle).toBe("我们懂你的每一个痛点");
    expect(whyTitle).toBe("为什么选择跟我们合作？");
    expect(flowTitle).toBe("合作流程");
    expect(reviewTitle).toBe("合作伙伴怎么说？");
  });
});

describe("buildShareEventPayload", () => {
  it("生成 card 分享事件体", () => {
    const payload = buildShareEventPayload("abc", "card");
    expect(payload).toEqual({ campaign_id: "abc", share_type: "card" });
  });

  it("生成 poster 分享事件体", () => {
    const payload = buildShareEventPayload("abc", "poster");
    expect(payload).toEqual({ campaign_id: "abc", share_type: "poster" });
  });

  it("无 campaign_id 时 campaign_id 为 undefined", () => {
    const payload = buildShareEventPayload("", "card");
    expect(payload.campaign_id).toBeUndefined();
  });
});
