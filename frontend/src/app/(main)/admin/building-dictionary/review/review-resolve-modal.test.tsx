import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * BR-29 审核弹层组件测试（默认动作数据驱动 + 名称修正 + 推荐标）.
 *
 * 覆盖运营反馈场景②的关键回归：
 * - ``mergeAvailability="empty"`` → 默认动作 = create、merge 卡 disabled、
 *   推荐标在 create 上（**不再是「推荐一个提交不了的选项」**）；
 * - 用户手动点过 merge 后，晚到的 availability 变更**不再覆盖**用户选择；
 * - 名称输入的可编辑性随动作切换（仅 create 可编辑）+「将保存为」对照。
 */

import { ReviewResolveModal } from "./review-resolve-modal";

// 目标选择器被替换为可控桩：直接暴露 availability 上报入口，避免真实网络请求
const { pickerProps } = vi.hoisted(() => ({
  pickerProps: { current: null as Record<string, unknown> | null },
}));

vi.mock("./review-target-picker", () => ({
  ReviewTargetPicker: (props: Record<string, unknown>) => {
    pickerProps.current = props;
    return <div data-testid="target-picker" />;
  },
}));

vi.mock("@/lib/api-client", () => ({
  client: { POST: vi.fn().mockResolvedValue({ data: { success: true }, error: undefined }) },
}));

const baseItem = {
  id: 101,
  kind: "building",
  name: "金杨路660弄21号",
  community_id: "c-1",
  community_name: "金杨七街坊",
  parent_kind: "community",
  parent_id: 0,
  source_type: "project",
  submitter_name: "张三",
  created_at: "2026-10-20T10:00:00Z",
  reference_count: 1,
};

function renderModal(item: Partial<typeof baseItem> = {}) {
  return render(
    <ReviewResolveModal item={{ ...baseItem, ...item }} onClose={vi.fn()} onResolved={vi.fn()} />,
  );
}

/** 读取动作卡（按文字定位按钮） */
function cardButton(name: RegExp): HTMLElement {
  const btn = screen.getAllByRole("button").find((b) => name.test(b.textContent ?? ""));
  if (!btn) throw new Error(`未找到动作卡: ${name}`);
  return btn;
}

beforeEach(() => {
  pickerProps.current = null;
  vi.clearAllMocks();
});

describe("ReviewResolveModal · mergeAvailability 驱动默认动作（BR-29 场景②）", () => {
  it("availability=empty → 默认选中确认新增，merge 卡 disabled 且无推荐标", async () => {
    renderModal();
    // 初始 unknown → 默认 merge（设计稿口径）
    await waitFor(() => expect(pickerProps.current).not.toBeNull());
    const onAvail = pickerProps.current?.onAvailabilityChange as (v: string) => void;
    onAvail("empty");

    await waitFor(() => {
      const merge = cardButton(/用已有的/);
      expect(merge).toBeDisabled();
      // 「推荐」标从 merge 移到 create
      expect(merge.textContent).not.toContain("推荐");
      expect(cardButton(/确认新增/).textContent).toContain("推荐");
    });
  });

  it("availability=empty 时 merge 卡文案给出「无可用目标」原因", async () => {
    renderModal();
    await waitFor(() => expect(pickerProps.current).not.toBeNull());
    (pickerProps.current?.onAvailabilityChange as (v: string) => void)("empty");

    await waitFor(() => {
      expect(screen.getByText(/本小区暂无任何楼栋（含待审）/, { exact: false })).toBeInTheDocument();
    });
  });

  it("availability=available → 保持默认 merge + 推荐标在 merge 上（设计稿口径回归）", async () => {
    renderModal();
    await waitFor(() => expect(pickerProps.current).not.toBeNull());
    (pickerProps.current?.onAvailabilityChange as (v: string) => void)("available");

    await waitFor(() => {
      const merge = cardButton(/用已有的/);
      expect(merge).not.toBeDisabled();
      expect(merge.textContent).toContain("推荐");
    });
  });

  it("用户手动点过 merge 后，晚到的 empty 不再覆盖用户选择", async () => {
    const user = userEvent.setup();
    renderModal();
    await waitFor(() => expect(pickerProps.current).not.toBeNull());

    // 用户先点 merge（unknown 阶段），再收到 empty
    await user.click(cardButton(/用已有的/));
    (pickerProps.current?.onAvailabilityChange as (v: string) => void)("empty");

    await waitFor(() => {
      // 用户选择不被冲掉：merge 卡仍处于选中态（border-rust），而非回到 create
      expect(cardButton(/用已有的/).className).toContain("border-rust");
    });
  });

  it("disabled 的 merge 卡点击后不改变选中动作（仍停在 create）", async () => {
    const user = userEvent.setup();
    renderModal();
    await waitFor(() => expect(pickerProps.current).not.toBeNull());
    (pickerProps.current?.onAvailabilityChange as (v: string) => void)("empty");

    await waitFor(() => expect(cardButton(/用已有的/)).toBeDisabled());
    await user.click(cardButton(/用已有的/));

    // click disabled 按钮时原生不触发；保险断言 create 仍为选中态
    expect(cardButton(/确认新增/).className).toContain("border-rust");
  });
});

describe("ReviewResolveModal · 名称修正（BR-29 场景①）", () => {
  it("默认动作 create 时名称输入可编辑，且展示「将保存为」归一结果", async () => {
    const user = userEvent.setup();
    renderModal();
    await waitFor(() => expect(pickerProps.current).not.toBeNull());
    (pickerProps.current?.onAvailabilityChange as (v: string) => void)("empty");

    const input = await screen.findByPlaceholderText("楼栋号，如 21");
    // empty → create 需一次重渲染，等输入框从 disabled 变为可编辑
    await waitFor(() => expect(input).not.toBeDisabled());
    // 初值为提交原文
    expect(input).toHaveValue("金杨路660弄21号");

    await user.clear(input);
    await user.type(input, "金杨路660弄22号");

    // 归一对照：尾部「号」去除 + 展示仍带「号」
    await waitFor(() => {
      expect(screen.getByText(/将保存为/)).toBeInTheDocument();
      expect(screen.getByText("金杨路660弄22")).toBeInTheDocument();
    });
  });

  it("切到 merge 动作后名称输入变为只读（名称只影响写入字典）", async () => {
    const user = userEvent.setup();
    renderModal();
    await waitFor(() => expect(pickerProps.current).not.toBeNull());
    (pickerProps.current?.onAvailabilityChange as (v: string) => void)("available");

    await user.click(cardButton(/用已有的/));
    const input = screen.getByPlaceholderText("楼栋号，如 21");
    expect(input).toBeDisabled();
  });

  it("提交 create 时把归一后的名称放进请求体", async () => {
    const user = userEvent.setup();
    const { client } = await import("@/lib/api-client");
    renderModal();
    await waitFor(() => expect(pickerProps.current).not.toBeNull());
    (pickerProps.current?.onAvailabilityChange as (v: string) => void)("empty");

    const input = await screen.findByPlaceholderText("楼栋号，如 21");
    await waitFor(() => expect(input).not.toBeDisabled());
    await user.clear(input);
    await user.type(input, "金杨路660弄22号");
    await user.click(screen.getByRole("button", { name: "提交结果" }));

    await waitFor(() => {
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/admin/building-dictionary/review/{entry_id}/resolve",
        expect.objectContaining({
          body: expect.objectContaining({
            action: "create",
            name: "金杨路660弄22",
          }),
        }),
      );
    });
  });

  it("名称清空后提交按钮禁用（禁止空名落库）", async () => {
    const user = userEvent.setup();
    renderModal();
    await waitFor(() => expect(pickerProps.current).not.toBeNull());
    (pickerProps.current?.onAvailabilityChange as (v: string) => void)("empty");

    const input = await screen.findByPlaceholderText("楼栋号，如 21");
    await waitFor(() => expect(input).not.toBeDisabled());
    await user.clear(input);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "提交结果" })).toBeDisabled();
    });
  });
});

describe("ReviewResolveModal · 小区条目（恒 merge 可选，设计稿口径无推荐标）", () => {
  it("小区条目默认 merge 且 merge 卡始终可用（全库搜索恒有目标）", async () => {
    renderModal({ kind: "community", name: "金杨七街坊" });
    await waitFor(() => expect(pickerProps.current).not.toBeNull());
    (pickerProps.current?.onAvailabilityChange as (v: string) => void)("available");

    await waitFor(() => {
      const merge = cardButton(/用已有的/);
      expect(merge).not.toBeDisabled();
      // 设计稿 v2.0 ARTBOARD 04：小区条目三卡无「推荐」标（只有楼栋/户室 merge 卡带）
      expect(merge.textContent).not.toContain("推荐");
    });
  });

  it("小区条目即使收到 empty 也不会禁用 merge（community 恒可全库搜索）", async () => {
    renderModal({ kind: "community", name: "金杨七街坊" });
    await waitFor(() => expect(pickerProps.current).not.toBeNull());
    (pickerProps.current?.onAvailabilityChange as (v: string) => void)("empty");

    await waitFor(() => {
      expect(cardButton(/用已有的/)).not.toBeDisabled();
    });
  });
});
