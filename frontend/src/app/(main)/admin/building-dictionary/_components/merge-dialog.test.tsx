import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";

/**
 * 合并弹层 · 影响预览接线验证（SPEC community-merge-union §6.1 / AC-6）.
 *
 * 这是「接线类」改动：新增 preview 调用给既有弹层供值。按 AGENTS 约定必须验证
 * **消费方真实生效**——所以断言不只看请求发出，还看返回的画像并集被渲染出来
 * （「b 的信息会不会进 a」正是运营在合并前唯一想知道的事）。
 *
 * 覆盖：
 * 1. 勾选后调用 /merge/preview（带 primary_id + merge_ids），并把「将补入画像」
 *    逐字段渲染成「旧值 → 新值」；
 * 2. 主档非空值保留（source=kept）的字段不出现在补入列表（D1 口径可视化）；
 * 3. 预览失败 → 降级为静态文案且**不阻塞**确认合并按钮；
 * 4. 合并成功后 toast 带上补入字段数与 warnings。
 */

import { MergeDialog } from "./merge-dialog";

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }));

vi.mock("@/lib/api-client", () => ({
  client: { GET: getMock, POST: postMock },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const PREVIEW_OK = {
  primary: { id: "a-1", name: "金杨十街坊", district: "浦东新区", business_circle: "金杨" },
  children: [
    {
      id: "b-1",
      name: "金杨新村十街坊",
      building_count: 153,
      room_count: 1200,
      linked_document_count: 2,
      image_count: 2,
      open_pending_count: 1,
      competitor_edge_count: 0,
      archived_children_count: 0,
      alias_count: 0,
    },
  ],
  profile: [
    { field: "ring", before: null, after: "内环至中环", source: "child:b-1" },
    { field: "developer", before: "主档原有开发商", after: "主档原有开发商", source: "kept" },
    { field: "era_from", before: null, after: 1993, source: "child:b-1" },
    { field: "property_types", before: [], after: ["住宅-公寓", "住宅-新里"], source: "union" },
  ],
  counts: {
    properties: 3,
    buildings: 153,
    rooms: 1200,
    documents: 2,
    images: 2,
    pending_entries: 1,
    competitor_edges: 0,
    archived_children: 0,
    aliases: 1,
  },
  warnings: ["地址合并后 612 字符超过列宽 500，已保留主档地址"],
};

function searchResults() {
  return {
    data: {
      total: 1,
      items: [
        {
          id: "b-1",
          name: "金杨新村十街坊",
          district: "浦东新区",
          business_circle: "金杨",
          ring: null,
          property_types: [],
          era_from: null,
          era_to: null,
          address: "金杨路660弄",
          building_count: 153,
          room_count: 1200,
          linked_project_count: 2,
          first_image_url: null,
          merged_into_id: null,
        },
      ],
    },
    error: undefined,
  };
}

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  getMock.mockResolvedValue(searchResults());
});

/** 搜索 → 勾选 b-1（弹层唯一的入口链路） */
async function checkChild() {
  const input = document.querySelector('input[placeholder="输入小区名或地址检索"]') as HTMLInputElement;
  fireEvent.change(input, { target: { value: "金杨" } });
  fireEvent.click(document.querySelector('button[title="搜索"]') ?? Array.from(document.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === "搜索")!);
  const row = await waitFor(() => {
    const el = Array.from(document.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("金杨新村十街坊"),
    ) as HTMLElement | undefined;
    if (!el) throw new Error("搜索结果未渲染");
    return el;
  });
  fireEvent.click(row);
}

describe("MergeDialog · 影响预览消费方真实生效", () => {
  it("勾选后拉取预览并把「将补入画像」渲染成 旧值 → 新值", async () => {
    postMock.mockImplementation((url: string) => {
      if (url.includes("/merge/preview")) return Promise.resolve({ data: PREVIEW_OK, error: undefined });
      return Promise.resolve({ data: {}, error: undefined });
    });

    render(
      <MergeDialog
        open
        onOpenChange={vi.fn()}
        primaryId="a-1"
        primaryName="金杨十街坊"
      />,
    );
    await checkChild();

    // 防抖 300ms 后调用预览端点，body 含 primary_id + merge_ids
    await waitFor(() => {
      const call = postMock.mock.calls.find(([url]) => url.includes("/merge/preview"));
      if (!call) throw new Error("预览未被调用");
      expect(call[1]).toMatchObject({
        body: { primary_id: "a-1", merge_ids: ["b-1"] },
      });
    });

    // 消费方生效：补入字段逐条渲染
    const text = await waitFor(() => {
      const el = document.body.textContent ?? "";
      if (!el.includes("将补入画像 3 项")) throw new Error(`补入区块未渲染：${el.slice(0, 200)}`);
      return el;
    });
    expect(text).toContain("环线：—→内环至中环");
    expect(text).toContain("物业类型：—→住宅-公寓、住宅-新里");
    // D1 可视化：source=kept 的 developer 不进补入列表
    expect(text).not.toContain("开发商：主档原有开发商→");
    // 资产计数 + 告警
    expect(text).toContain("楼栋 153 / 户室 1,200 归并到主档名下");
    expect(text).toContain("户型图 2 张随主档收敛");
    expect(text).toContain("已保留主档地址");
  });

  it("预览失败时降级静态文案，且确认合并不被阻塞", async () => {
    postMock.mockImplementation((url: string) => {
      if (url.includes("/merge/preview")) return Promise.resolve({ data: undefined, error: { code: 500 } });
      return Promise.resolve({ data: { profile_filled: [], images_moved: 0, warnings: [] }, error: undefined });
    });

    render(<MergeDialog open onOpenChange={vi.fn()} primaryId="a-1" primaryName="金杨十街坊" />);
    await checkChild();

    const fallback = await waitFor(() => {
      const el = document.body.textContent ?? "";
      if (!el.includes("被并小区软归档（可解除合并恢复）")) throw new Error("降级文案未出现");
      return el;
    });
    expect(fallback).toContain("户型图片随主档收敛");
    expect(fallback).not.toContain("将补入画像");

    const confirm = Array.from(document.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("确认合并"),
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => {
      expect(postMock.mock.calls.some(([url]) => url.endsWith("/communities/merge"))).toBe(true);
    });
  });

  it("合并成功 toast 带上补入字段数与告警", async () => {
    const { toast } = await import("sonner");
    postMock.mockImplementation((url: string) => {
      if (url.includes("/merge/preview")) return Promise.resolve({ data: PREVIEW_OK, error: undefined });
      return Promise.resolve({
        data: {
          success: true,
          affected_properties: 3,
          message: "ok",
          profile_filled: ["ring", "era_from", "property_types"],
          images_moved: 2,
          warnings: ["地址合并后超长，已保留主档地址"],
        },
        error: undefined,
      });
    });

    render(<MergeDialog open onOpenChange={vi.fn()} primaryId="a-1" primaryName="金杨十街坊" />);
    await checkChild();

    const confirm = await waitFor(() => {
      const el = Array.from(document.querySelectorAll("button")).find((b) =>
        (b.textContent ?? "").includes("确认合并"),
      ) as HTMLButtonElement | undefined;
      if (!el || el.disabled) throw new Error("确认按钮不可用");
      return el;
    });
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining("补入画像 3 项"),
      );
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("迁移户型图 2 张"));
      expect(toast.warning).toHaveBeenCalledWith("地址合并后超长，已保留主档地址");
    });
  });
});
