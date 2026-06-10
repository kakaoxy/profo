import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMarketSentimentAction } from "./market-actions";

vi.mock(
  "@/app/(main)/projects/actions/monitor-lib/sentiment",
  () => ({
    getMarketSentimentByCommunityAction: vi.fn(),
  })
);

const mockGetSentimentByCommunity = vi.mocked(
  (
    await import(
      "@/app/(main)/projects/actions/monitor-lib/sentiment"
    )
  ).getMarketSentimentByCommunityAction
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getMarketSentimentAction", () => {
  const mockSentimentData = {
    floor_stats: [
      {
        type: "高层",
        deals_count: 10,
        deal_avg_price: 35000,
        current_count: 20,
        current_avg_price: 36000,
      },
      {
        type: "低层",
        deals_count: 5,
        deal_avg_price: 32000,
        current_count: 8,
        current_avg_price: 33000,
      },
    ],
    inventory_months: 6,
  };

  it("成功获取市场情绪数据", async () => {
    mockGetSentimentByCommunity.mockResolvedValue({
      success: true,
      data: mockSentimentData,
    });

    const result = await getMarketSentimentAction("comm-1");

    expect(result).not.toBeNull();
    expect(result!.floorStats).toHaveLength(2);
    expect(result!.floorStats[0]).toEqual({
      type: "高层",
      dealsCount: 10,
      dealAvgPrice: 35000,
      currentCount: 20,
      currentAvgPrice: 36000,
    });
    expect(result!.floorStats[1]).toEqual({
      type: "低层",
      dealsCount: 5,
      dealAvgPrice: 32000,
      currentCount: 8,
      currentAvgPrice: 33000,
    });
    expect(result!.inventoryMonths).toBe(6);
    expect(result!.totalListingCount).toBe(28);
    expect(result!.totalDealsCount).toBe(15);
  });

  it("底层接口返回失败时返回 null", async () => {
    mockGetSentimentByCommunity.mockResolvedValue({
      success: false,
      message: "获取市场情绪数据失败",
    });

    const result = await getMarketSentimentAction("comm-1");

    expect(result).toBeNull();
  });

  it("底层接口返回成功但 data 为空时返回 null", async () => {
    mockGetSentimentByCommunity.mockResolvedValue({
      success: true,
      data: null as any,
    });

    const result = await getMarketSentimentAction("comm-1");

    expect(result).toBeNull();
  });

  it("floor_stats 为空数组时汇总值为 0", async () => {
    mockGetSentimentByCommunity.mockResolvedValue({
      success: true,
      data: { floor_stats: [], inventory_months: 0 },
    });

    const result = await getMarketSentimentAction("comm-1");

    expect(result).not.toBeNull();
    expect(result!.floorStats).toEqual([]);
    expect(result!.totalListingCount).toBe(0);
    expect(result!.totalDealsCount).toBe(0);
    expect(result!.inventoryMonths).toBe(0);
  });

  it("floor_stats 中缺少计数字段时回退为 0", async () => {
    mockGetSentimentByCommunity.mockResolvedValue({
      success: true,
      data: {
        floor_stats: [{ type: "中层" }],
        inventory_months: null,
      },
    });

    const result = await getMarketSentimentAction("comm-1");

    expect(result).not.toBeNull();
    expect(result!.floorStats[0]).toEqual({
      type: "中层",
      dealsCount: 0,
      dealAvgPrice: 0,
      currentCount: 0,
      currentAvgPrice: 0,
    });
    expect(result!.inventoryMonths).toBe(0);
  });

  it("inventory_months 为 null 时回退为 0", async () => {
    mockGetSentimentByCommunity.mockResolvedValue({
      success: true,
      data: {
        floor_stats: [],
        inventory_months: null,
      },
    });

    const result = await getMarketSentimentAction("comm-1");

    expect(result!.inventoryMonths).toBe(0);
  });
});
