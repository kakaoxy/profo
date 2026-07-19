import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

import { ActivityList } from "./activity-list";
import type { SalesRecord } from "@/app/(main)/admin/projects/types";

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock @/components/ui/avatar 避免在 jsdom 中加载真实图片
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "avatar" }, children),
  AvatarImage: () => null,
  AvatarFallback: ({ children }: { children: React.ReactNode }) =>
    React.createElement("span", null, children),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRecord(
  overrides: Partial<SalesRecord> = {},
): SalesRecord {
  return {
    id: "r1",
    project_id: "p1",
    record_type: "viewing",
    record_date: "2024-01-15T10:00:00Z",
    customer_name: "客户A",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ActivityList - OperatorCell 渲染", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── viewing 视图：operator 对象含 nickname → 显示 nickname ─────────────────
  it("OperatorCell: 传入 operator 对象（含 nickname）时显示 nickname", () => {
    const records: SalesRecord[] = [
      makeRecord({
        id: "r1",
        record_type: "viewing",
        operator: {
          id: "u1",
          nickname: "张三",
          avatar: null,
        },
      }),
    ];

    render(
      <ActivityList
        type="viewing"
        data={records}
        onDelete={vi.fn()}
        canEditSales={false}
      />,
    );

    // 表格头 "操作人" 列存在
    expect(screen.getByText("操作人")).toBeInTheDocument();
    // operator nickname 渲染
    expect(screen.getByText("张三")).toBeInTheDocument();
  });

  // ─── operator 对象 nickname 为 null → 显示 "未知" ──────────────────────────
  it("OperatorCell: operator.nickname 为 null 时显示 '未知'", () => {
    const records: SalesRecord[] = [
      makeRecord({
        id: "r1",
        record_type: "viewing",
        operator: {
          id: "u1",
          nickname: null,
          avatar: null,
        },
      }),
    ];

    render(
      <ActivityList
        type="viewing"
        data={records}
        onDelete={vi.fn()}
        canEditSales={false}
      />,
    );

    expect(screen.getByText("未知")).toBeInTheDocument();
  });

  // ─── operator 为 null → 不渲染 OperatorCell ────────────────────────────────
  it("OperatorCell: operator 为 null 时不渲染", () => {
    const records: SalesRecord[] = [
      makeRecord({
        id: "r1",
        record_type: "viewing",
        operator: null,
      }),
    ];

    const { container } = render(
      <ActivityList
        type="viewing"
        data={records}
        onDelete={vi.fn()}
        canEditSales={false}
      />,
    );

    // 表格头 "操作人" 仍渲染（列头）
    expect(screen.getByText("操作人")).toBeInTheDocument();
    // 但 nickname "张三" 不应出现
    expect(screen.queryByText("张三")).not.toBeInTheDocument();
    // "未知" 也不应出现（因为 operator 为 null 时 OperatorCell 返回 null）
    expect(screen.queryByText("未知")).not.toBeInTheDocument();
    // Avatar 也不应渲染
    expect(container.querySelectorAll('[data-testid="avatar"]')).toHaveLength(0);
  });

  // ─── operator 为 undefined → 不渲染 OperatorCell ──────────────────────────
  it("OperatorCell: operator 为 undefined 时不渲染", () => {
    const records: SalesRecord[] = [
      makeRecord({
        id: "r1",
        record_type: "viewing",
        // operator 字段缺失
      }),
    ];

    render(
      <ActivityList
        type="viewing"
        data={records}
        onDelete={vi.fn()}
        canEditSales={false}
      />,
    );

    expect(screen.queryByText("张三")).not.toBeInTheDocument();
    expect(screen.queryByText("未知")).not.toBeInTheDocument();
  });

  // ─── offer 视图也渲染 operator ──────────────────────────────────────────────
  it("OperatorCell: offer 视图中传入 operator 对象时显示 nickname", () => {
    const records: SalesRecord[] = [
      makeRecord({
        id: "r1",
        record_type: "offer",
        price: 100,
        operator: { id: "u1", nickname: "李四", avatar: null },
      }),
    ];

    render(
      <ActivityList
        type="offer"
        data={records}
        onDelete={vi.fn()}
        canEditSales={false}
      />,
    );

    expect(screen.getByText("李四")).toBeInTheDocument();
  });

  // ─── negotiation 视图也渲染 operator ────────────────────────────────────────
  it("OperatorCell: negotiation 视图中传入 operator 对象时显示 nickname", () => {
    const records: SalesRecord[] = [
      makeRecord({
        id: "r1",
        record_type: "negotiation",
        operator: { id: "u1", nickname: "王五", avatar: null },
      }),
    ];

    render(
      <ActivityList
        type="negotiation"
        data={records}
        onDelete={vi.fn()}
        canEditSales={false}
      />,
    );

    expect(screen.getByText("王五")).toBeInTheDocument();
  });
});

describe("ActivityList - canEditSales 控制删除按钮显隐", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("canEditSales=true 时：viewing 视图渲染删除按钮", () => {
    const records: SalesRecord[] = [
      makeRecord({ id: "r1", record_type: "viewing" }),
    ];

    render(
      <ActivityList
        type="viewing"
        data={records}
        onDelete={vi.fn()}
        canEditSales={true}
      />,
    );

    // 删除按钮存在（aria-label="删除" 或通过按钮元素）
    const deleteButtons = screen.getAllByRole("button");
    expect(deleteButtons.length).toBeGreaterThan(0);
  });

  it("canEditSales=false 时：viewing 视图不渲染删除按钮", () => {
    const records: SalesRecord[] = [
      makeRecord({ id: "r1", record_type: "viewing" }),
    ];

    const { container } = render(
      <ActivityList
        type="viewing"
        data={records}
        onDelete={vi.fn()}
        canEditSales={false}
      />,
    );

    // 无删除按钮（button 元素为 0）
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("canEditSales 默认为 false（未传 prop 时不显示删除按钮）", () => {
    const records: SalesRecord[] = [
      makeRecord({ id: "r1", record_type: "viewing" }),
    ];

    render(
      <ActivityList
        type="viewing"
        data={records}
        onDelete={vi.fn()}
        // 不传 canEditSales，使用默认值 false（最小权限原则）
      />,
    );

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("空数据时：渲染空状态提示", () => {
    render(
      <ActivityList
        type="viewing"
        data={[]}
        onDelete={vi.fn()}
        canEditSales={true}
      />,
    );

    expect(screen.getByText(/暂无带看记录/)).toBeInTheDocument();
  });
});
