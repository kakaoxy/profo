import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { HasPermission } from "./has-permission";
import type { UsePermissionReturn } from "@/hooks/use-permission";

// ─── Per-test configurable mock (hoisted so vi.mock factory can read it) ─────
const { mockUsePermission } = vi.hoisted(() => ({
  mockUsePermission: vi.fn<[], UsePermissionReturn>(),
}));

// Mock usePermission Hook；具体返回值在每个用例中通过 mockUsePermission.mockReturnValue 配置
vi.mock("@/hooks/use-permission", () => ({
  usePermission: (...args: unknown[]) => mockUsePermission(...(args as [])),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockPermissions(permissions: string[]): UsePermissionReturn {
  const hasPermission = (code: string): boolean =>
    permissions.includes(code);
  const hasAnyPermission = (codes: string[]): boolean =>
    codes.some((c) => permissions.includes(c));
  return {
    permissions,
    hasPermission,
    hasAnyPermission,
    isLoading: false,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("HasPermission", () => {
  beforeEach(() => {
    mockUsePermission.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // SubTask 13.4: 单个 code 持有权限 → 渲染 children
  it("单个 code 持有权限时渲染 children", () => {
    mockUsePermission.mockReturnValue(mockPermissions(["user:read"]));

    render(
      <HasPermission code="user:read">
        <span>content</span>
      </HasPermission>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
  });

  // SubTask 13.4: 单个 code 未持有权限 → 渲染 fallback（默认 null）
  it("单个 code 未持有权限时不渲染 children（默认 fallback 为 null）", () => {
    mockUsePermission.mockReturnValue(mockPermissions(["user:read"]));

    const { container } = render(
      <HasPermission code="user:delete">
        <span>content</span>
      </HasPermission>,
    );

    expect(screen.queryByText("content")).not.toBeInTheDocument();
    // 容器中无任何子节点
    expect(container.innerHTML).toBe("");
  });

  // SubTask 13.4: 数组 code 任一满足 → 渲染 children（OR 语义）
  it("数组 code 任一权限满足时渲染 children（OR 语义）", () => {
    mockUsePermission.mockReturnValue(mockPermissions(["user:read"]));

    render(
      <HasPermission code={["user:delete", "user:read"]}>
        <span>content</span>
      </HasPermission>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
  });

  // SubTask 13.4: 数组 code 全不满足 → 渲染 fallback
  it("数组 code 全不满足时不渲染 children", () => {
    mockUsePermission.mockReturnValue(mockPermissions(["user:read"]));

    render(
      <HasPermission code={["user:delete", "user:update"]}>
        <span>content</span>
      </HasPermission>,
    );

    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  // SubTask 13.4: 空数组 → 渲染 fallback（hasAnyPermission 对空数组返回 false）
  it("空数组 code 时不渲染 children", () => {
    mockUsePermission.mockReturnValue(mockPermissions(["user:read"]));

    const { container } = render(
      <HasPermission code={[]}>
        <span>content</span>
      </HasPermission>,
    );

    expect(screen.queryByText("content")).not.toBeInTheDocument();
    expect(container.innerHTML).toBe("");
  });

  // SubTask 13.4: 自定义 fallback → 渲染自定义内容
  it("权限不通过时渲染自定义 fallback", () => {
    mockUsePermission.mockReturnValue(mockPermissions([]));

    render(
      <HasPermission code="user:read" fallback={<span>no-access</span>}>
        <span>content</span>
      </HasPermission>,
    );

    expect(screen.queryByText("content")).not.toBeInTheDocument();
    expect(screen.getByText("no-access")).toBeInTheDocument();
  });

  // SubTask 13.4: 无权限时 children 不在 DOM 中（而非 disabled/hidden）
  it("无权限时 children 不出现在 DOM 中（而非 disabled/hidden）", () => {
    mockUsePermission.mockReturnValue(mockPermissions([]));

    const { container } = render(
      <HasPermission code="user:read">
        <button type="button">dangerous-action</button>
      </HasPermission>,
    );

    expect(
      screen.queryByText("dangerous-action"),
    ).not.toBeInTheDocument();
    // 确保 DOM 中确实没有 button 元素残留
    expect(container.querySelector("button")).toBeNull();
  });
});
