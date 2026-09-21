/**
 * 时效纯函数测试：三态边界（0/7/8/14/15 天）、Asia/Shanghai 跨自然日、
 * 基准时间为空、出现窗口、cardTimeLabel 四类状态前缀.
 */
import { describe, expect, it } from "vitest";
import {
  cardTimeLabel,
  FRESHNESS_LABELS,
  freshnessLevel,
  isFreshnessWindow,
} from "../../utils/valuation-freshness";

/** 固定「当前时间」：2026-09-21 12:00 Asia/Shanghai（= 04:00 UTC）. */
const NOW = "2026-09-21T12:00:00+08:00";

/** NOW 往前推 n 个自然日（同时刻），返回 ISO 串. */
function daysAgo(n: number): string {
  const base = new Date("2026-09-21T04:00:00Z");
  base.setUTCDate(base.getUTCDate() - n);
  return base.toISOString();
}

describe("freshnessLevel 三态边界", () => {
  it("d=0 / d=7 → ok（跟进中）", () => {
    expect(freshnessLevel(daysAgo(0), NOW)).toBe("ok");
    expect(freshnessLevel(daysAgo(7), NOW)).toBe("ok");
  });

  it("d=8 / d=14 → soon（即将过期，恰好 14 天归此档）", () => {
    expect(freshnessLevel(daysAgo(8), NOW)).toBe("soon");
    expect(freshnessLevel(daysAgo(14), NOW)).toBe("soon");
  });

  it("d=15 / d=20 → over（已过期）", () => {
    expect(freshnessLevel(daysAgo(15), NOW)).toBe("over");
    expect(freshnessLevel(daysAgo(20), NOW)).toBe("over");
  });

  it("基准时间为空 / 非法 → null（不显示标签）", () => {
    expect(freshnessLevel(null, NOW)).toBeNull();
    expect(freshnessLevel(undefined, NOW)).toBeNull();
    expect(freshnessLevel("", NOW)).toBeNull();
    expect(freshnessLevel("not-a-date", NOW)).toBeNull();
  });

  it("now 非法 → null（防御式，不抛错）", () => {
    expect(freshnessLevel("2026-09-20T00:00:00+08:00", "bad-date")).toBeNull();
  });
});

describe("Asia/Shanghai 自然日口径", () => {
  it("跨自然日：09-18 23:50 → 09-19 00:10 算 1 天（非 0）", () => {
    // 若按 24h 累加应为 0；自然日相减必须为 1
    const d = freshnessLevel("2026-09-18T23:50:00+08:00", "2026-09-19T00:10:00+08:00");
    expect(d).toBe("ok"); // d=1 落入 ok 档
  });

  it("同一自然日 23:00 → 23:59 算 0 天", () => {
    expect(freshnessLevel("2026-09-18T23:00:00+08:00", "2026-09-18T23:59:00+08:00")).toBe("ok");
  });

  it("UTC 存储的时间同样按上海自然日判定（14:50 UTC = 22:50 上海）", () => {
    // 09-18 22:50（上海）→ 09-19 00:10（上海）= 1 天
    expect(freshnessLevel("2026-09-18T14:50:00Z", "2026-09-19T00:10:00+08:00")).toBe("ok");
  });
});

describe("isFreshnessWindow 出现窗口", () => {
  it("仅 pending_visit / visited 为 true", () => {
    expect(isFreshnessWindow("pending_visit")).toBe(true);
    expect(isFreshnessWindow("visited")).toBe(true);
  });

  it("其余状态为 false（右下角留空）", () => {
    expect(isFreshnessWindow("pending_assessment")).toBe(false);
    expect(isFreshnessWindow("signed")).toBe(false);
    expect(isFreshnessWindow("rejected")).toBe(false);
    expect(isFreshnessWindow("lost_to_competitor")).toBe(false);
    expect(isFreshnessWindow("unknown")).toBe(false);
  });
});

describe("FRESHNESS_LABELS 文案", () => {
  it("三档文案与设计稿一致", () => {
    expect(FRESHNESS_LABELS.ok).toBe("跟进中");
    expect(FRESHNESS_LABELS.soon).toBe("即将过期");
    expect(FRESHNESS_LABELS.over).toBe("已过期");
  });
});

describe("cardTimeLabel 左槽时间标签", () => {
  it("跟进窗口（pending_visit/visited）：前缀「跟进」，取 last_follow_up_at", () => {
    const label = cardTimeLabel({
      status: "pending_visit",
      lastFollowUpAt: "2026-09-18T10:00:00+08:00",
      auditTime: "2026-09-10T10:00:00+08:00",
      createdAt: "2026-09-01T10:00:00+08:00",
    });
    expect(label.prefix).toBe("跟进");
    expect(label.text).toBe("09-18");
  });

  it("跟进窗口无跟进记录：回退 audit_time", () => {
    const label = cardTimeLabel({
      status: "visited",
      lastFollowUpAt: null,
      auditTime: "2026-09-12T10:00:00+08:00",
      createdAt: "2026-09-01T10:00:00+08:00",
    });
    expect(label.prefix).toBe("跟进");
    expect(label.text).toBe("09-12");
  });

  it("pending_assessment：前缀「提交」，取 created_at", () => {
    const label = cardTimeLabel({
      status: "pending_assessment",
      auditTime: null,
      createdAt: "2026-09-20T10:00:00+08:00",
    });
    expect(label.prefix).toBe("提交");
    expect(label.text).toBe("09-20");
  });

  it("终态（signed/rejected/lost_to_competitor）：前缀「处理」，取 audit_time ?? created_at", () => {
    for (const status of ["signed", "rejected", "lost_to_competitor"]) {
      const withAudit = cardTimeLabel({
        status,
        lastFollowUpAt: "2026-09-18T10:00:00+08:00",
        auditTime: "2026-09-05T10:00:00+08:00",
        createdAt: "2026-09-01T10:00:00+08:00",
      });
      expect(withAudit.prefix).toBe("处理");
      expect(withAudit.text).toBe("09-05");

      const noAudit = cardTimeLabel({ status, auditTime: null, createdAt: "2026-09-03T10:00:00+08:00" });
      expect(noAudit.prefix).toBe("处理");
      expect(noAudit.text).toBe("09-03");
    }
  });

  it("取值缺失格式化为 —", () => {
    const label = cardTimeLabel({ status: "pending_assessment", createdAt: null });
    expect(label.text).toBe("—");
  });
});
