import { describe, it, expect, vi, beforeEach } from "vitest";
import { downloadCsvTemplate } from "./file-utils";

function setupDomMocks() {
  const mockClick = vi.fn();
  const mockAnchor = {
    href: "",
    download: "",
    click: mockClick,
  };

  const mockCreateElement = vi.fn().mockReturnValue(mockAnchor);
  const mockAppendChild = vi.fn();
  const mockRemoveChild = vi.fn();
  const mockCreateObjectURL = vi.fn().mockReturnValue("blob:mock-url");
  const mockRevokeObjectURL = vi.fn();

  vi.stubGlobal("document", {
    createElement: mockCreateElement,
    body: {
      appendChild: mockAppendChild,
      removeChild: mockRemoveChild,
    },
  });
  vi.stubGlobal("URL", {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  });
  vi.stubGlobal("Blob", vi.fn((parts, options) => ({ parts, options })));

  return {
    mockClick,
    mockCreateElement,
    mockAppendChild,
    mockRemoveChild,
    mockCreateObjectURL,
    mockRevokeObjectURL,
    mockAnchor,
  };
}

describe("downloadCsvTemplate", () => {
  let mocks: ReturnType<typeof setupDomMocks>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mocks = setupDomMocks();
  });

  it("应生成包含 BOM 的 CSV Blob", () => {
    downloadCsvTemplate();

    const BlobConstructor = vi.mocked(globalThis.Blob);
    expect(BlobConstructor).toHaveBeenCalledOnce();
    const [parts, options] = BlobConstructor.mock.calls[0] as [unknown[], Record<string, unknown>];
    // 第一部分是 BOM
    expect(parts[0]).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
    expect(options.type).toBe("text/csv;charset=utf-8");
  });

  it("CSV 内容应包含表头行", () => {
    downloadCsvTemplate();

    const BlobConstructor = vi.mocked(globalThis.Blob);
    const csvContent = (BlobConstructor.mock.calls[0][0] as unknown[])[1] as string;
    const firstLine = csvContent.split("\n")[0];
    expect(firstLine).toContain("数据源");
    expect(firstLine).toContain("房源ID");
    expect(firstLine).toContain("状态");
    expect(firstLine).toContain("小区名");
  });

  it("CSV 内容应包含必填/可选行", () => {
    downloadCsvTemplate();

    const BlobConstructor = vi.mocked(globalThis.Blob);
    const csvContent = (BlobConstructor.mock.calls[0][0] as unknown[])[1] as string;
    const secondLine = csvContent.split("\n")[1];
    expect(secondLine).toContain("必填");
    expect(secondLine).toContain("可选");
  });

  it("CSV 内容应包含示例数据行", () => {
    downloadCsvTemplate();

    const BlobConstructor = vi.mocked(globalThis.Blob);
    const csvContent = (BlobConstructor.mock.calls[0][0] as unknown[])[1] as string;
    const lines = csvContent.split("\n");
    expect(lines.length).toBe(4); // 表头 + 必填行 + 在售示例 + 成交示例
    expect(lines[2]).toContain("链家");
    expect(lines[3]).toContain("贝壳");
  });

  it("应创建下载链接并触发点击", () => {
    downloadCsvTemplate();

    expect(mocks.mockCreateObjectURL).toHaveBeenCalledOnce();
    expect(mocks.mockCreateElement).toHaveBeenCalledWith("a");
    expect(mocks.mockAnchor.href).toBe("blob:mock-url");
    expect(mocks.mockClick).toHaveBeenCalledOnce();
    expect(mocks.mockAppendChild).toHaveBeenCalledOnce();
    expect(mocks.mockRemoveChild).toHaveBeenCalledOnce();
    expect(mocks.mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("下载文件名应包含日期", () => {
    downloadCsvTemplate();

    expect(mocks.mockAnchor.download).toMatch(/^房源导入示例模板_\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
