/**
 * DecorationCostSection 软装明细附件展示回归测试.
 *
 * 回归：附件由手填链接改为上传后，只读/编辑态一度把任意非空值渲染成 MiniLink，
 * 遗留手填文本（如「详见纸质合同」）会产生无效 href。修复后：
 * URL（含相对路径）→ 预览链接；非 URL 文本 → 纯文本；空值 → 占位「-」。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DecorationCostSection } from "./contract-sections";
import type { RenovationContractFormValues } from "./schema";
import type { UseFormSetValue } from "react-hook-form";

vi.mock("@/components/common/upload", () => ({
  FileUploader: () => <div data-testid="file-uploader" />,
}));

vi.mock("@/components/has-permission", () => ({
  HasPermission: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const noopSetValue = (() => {}) as unknown as UseFormSetValue<RenovationContractFormValues>;

function renderSection(attachment: string | undefined, isEditing: boolean) {
  const values = { soft_detail_attachment: attachment } as RenovationContractFormValues;
  return render(
    <DecorationCostSection values={values} setValue={noopSetValue} isEditing={isEditing} />,
  );
}

describe("DecorationCostSection 软装明细附件展示", () => {
  it("只读态：URL 附件渲染为预览链接", () => {
    renderSection("/static/uploads/20260921_abcd1234.pdf", false);
    const link = screen.getByRole("link", { name: /预览/ });
    expect(link).toHaveAttribute("href", "/static/uploads/20260921_abcd1234.pdf");
  });

  it("只读态：遗留手填非 URL 文本按纯文本展示，不渲染链接（回归：无效 href）", () => {
    renderSection("详见纸质合同", false);
    expect(screen.getByText("详见纸质合同")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("只读态：空值显示占位符 -", () => {
    renderSection("", false);
    // 各金额字段同样以 - 占位，断言附件行也有占位即可
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("编辑态：遗留非 URL 文本展示文本与移除按钮，不渲染预览链接", () => {
    renderSection("详见纸质合同", true);
    expect(screen.getByText("详见纸质合同")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("button", { name: "移除" })).toBeInTheDocument();
  });

  it("编辑态：URL 附件保留预览链接与移除按钮", () => {
    renderSection("/static/uploads/20260921_abcd1234.pdf", true);
    const link = screen.getByRole("link", { name: /预览已保存附件/ });
    expect(link).toHaveAttribute("href", "/static/uploads/20260921_abcd1234.pdf");
    expect(screen.getByRole("button", { name: "移除" })).toBeInTheDocument();
  });
});
