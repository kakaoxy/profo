import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadFileAction } from "./files";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/token-refresh-server", () => ({
  getValidAccessToken: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  apiPaths: { files: { upload: "/api/v1/files/upload" } },
  getApiUrl: vi.fn((path: string) => `http://localhost:8000${path}`),
}));

// ── Tests ──────────────────────────────────────────────────────────────────

describe("files actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认恢复 global.fetch mock
    vi.stubGlobal("fetch", vi.fn());
  });

  // ── uploadFileAction ───────────────────────────────────────────────────

  describe("uploadFileAction", () => {
    const mockFormData = new FormData();
    mockFormData.append("file", new Blob(["test"]), "test.png");

    it("成功上传文件", async () => {
      const { getValidAccessToken } = await import("@/lib/token-refresh-server");
      (getValidAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue("valid-token");

      const responseJson = { url: "https://cdn.example.com/test.png", filename: "test.png" };
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseJson),
      } as Response);

      const result = await uploadFileAction(mockFormData);

      expect(result).toEqual({ success: true, data: responseJson });
      expect(fetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/v1/files/upload",
        expect.objectContaining({
          method: "POST",
          body: mockFormData,
          headers: { Authorization: "Bearer valid-token" },
        }),
      );
    });

    it("token 为空时返回登录过期", async () => {
      const { getValidAccessToken } = await import("@/lib/token-refresh-server");
      (getValidAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await uploadFileAction(mockFormData);

      expect(result).toEqual({ success: false, message: "登录已过期，请重新登录" });
      expect(fetch).not.toHaveBeenCalled();
    });

    it("HTTP 401 时返回登录过期", async () => {
      const { getValidAccessToken } = await import("@/lib/token-refresh-server");
      (getValidAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue("token");

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      } as unknown as Response);

      const result = await uploadFileAction(mockFormData);

      expect(result).toEqual({ success: false, message: "登录已过期，请重新登录" });
    });

    it("HTTP 413 时返回文件过大提示", async () => {
      const { getValidAccessToken } = await import("@/lib/token-refresh-server");
      (getValidAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue("token");

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 413,
        text: () => Promise.resolve("Payload Too Large"),
      } as unknown as Response);

      const result = await uploadFileAction(mockFormData);

      expect(result).toEqual({ success: false, message: "文件大小超过服务器限制 (10MB)" });
    });

    it("HTTP 其他错误且响应体为 JSON 时解析 detail", async () => {
      const { getValidAccessToken } = await import("@/lib/token-refresh-server");
      (getValidAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue("token");

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve(JSON.stringify({ detail: "服务器内部错误" })),
      } as unknown as Response);

      const result = await uploadFileAction(mockFormData);

      expect(result).toEqual({ success: false, message: "服务器内部错误" });
    });

    it("HTTP 其他错误且响应体非 JSON 时使用状态码消息", async () => {
      const { getValidAccessToken } = await import("@/lib/token-refresh-server");
      (getValidAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue("token");

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 502,
        text: () => Promise.resolve("Bad Gateway"),
      } as unknown as Response);

      const result = await uploadFileAction(mockFormData);

      expect(result).toEqual({ success: false, message: "上传失败 (502)" });
    });

    it("HTTP 错误响应体 JSON 无 detail 时使用状态码消息", async () => {
      const { getValidAccessToken } = await import("@/lib/token-refresh-server");
      (getValidAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue("token");

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve(JSON.stringify({ error: "bad" })),
      } as unknown as Response);

      const result = await uploadFileAction(mockFormData);

      expect(result).toEqual({ success: false, message: "上传失败 (400)" });
    });

    it("成功响应但格式无效（缺少 url）时返回格式无效", async () => {
      const { getValidAccessToken } = await import("@/lib/token-refresh-server");
      (getValidAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue("token");

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ filename: "test.png" }),
      } as unknown as Response);

      const result = await uploadFileAction(mockFormData);

      expect(result).toEqual({ success: false, message: "服务器返回的数据格式无效" });
    });

    it("成功响应但 url 为空字符串时返回格式无效", async () => {
      const { getValidAccessToken } = await import("@/lib/token-refresh-server");
      (getValidAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue("token");

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ url: "", filename: "test.png" }),
      } as unknown as Response);

      const result = await uploadFileAction(mockFormData);

      expect(result).toEqual({ success: false, message: "服务器返回的数据格式无效" });
    });

    it("成功响应但响应体非对象时返回格式无效", async () => {
      const { getValidAccessToken } = await import("@/lib/token-refresh-server");
      (getValidAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue("token");

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(null),
      } as unknown as Response);

      const result = await uploadFileAction(mockFormData);

      expect(result).toEqual({ success: false, message: "服务器返回的数据格式无效" });
    });

    it("网络异常时返回网络连接错误", async () => {
      const { getValidAccessToken } = await import("@/lib/token-refresh-server");
      (getValidAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue("token");

      vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

      const result = await uploadFileAction(mockFormData);

      expect(result).toEqual({ success: false, message: "网络连接错误，请检查后端服务是否启动" });
    });
  });
});
