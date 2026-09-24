import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

import { AssignEmployeeDialog } from "./assign-employee-dialog";

const EMPLOYEES = [{ id: "emp-1", name: "员工甲" }];
const noop = () => {};

describe("AssignEmployeeDialog 打开条件", () => {
  /**
   * 回归：弹窗原以 `leadPhoneMasked === null` 作为「关闭」哨兵，导致估价线索
   * （无手机号，phone_masked 为 null）点击「设置归属」时弹窗永不渲染——
   * 入口静默失效、无任何反馈。打开状态必须由独立的 open 决定。
   */
  it("线索无手机号（phone_masked 为 null）时仍渲染弹窗", () => {
    render(
      <AssignEmployeeDialog
        open
        leadPhoneMasked={null}
        employees={EMPLOYEES}
        submitting={false}
        onConfirm={noop}
        onClose={noop}
      />,
    );

    expect(screen.getByText("设置归属员工")).toBeInTheDocument();
    expect(screen.getByText(/（无手机号）/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认指派" })).toBeInTheDocument();
  });

  it("有手机号时正常渲染并回显脱敏号", () => {
    render(
      <AssignEmployeeDialog
        open
        leadPhoneMasked="138****8000"
        employees={EMPLOYEES}
        submitting={false}
        onConfirm={noop}
        onClose={noop}
      />,
    );

    expect(screen.getByText(/138\*\*\*\*8000/)).toBeInTheDocument();
  });

  it("open=false 时不渲染弹窗", () => {
    render(
      <AssignEmployeeDialog
        open={false}
        leadPhoneMasked="138****8000"
        employees={EMPLOYEES}
        submitting={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText("设置归属员工")).not.toBeInTheDocument();
  });
});
