import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── Per-test configurable mocks (hoisted so vi.mock factories can read them) ─
const { mockReplace, mockLogin, searchParamsState } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockLogin: vi.fn(),
  searchParamsState: { query: "" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    refresh: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(searchParamsState.query),
}));

vi.mock("@/lib/auth/client", () => ({
  useAuth: () => ({ login: mockLogin }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fillAndSubmitForm() {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText(/请输入用户名/), "admin");
  await user.type(
    screen.getByPlaceholderText(/请输入密码/),
    process.env.TEST_ADMIN_PASSWORD ?? "test-fake-password",
  );
  await user.click(screen.getByRole("button", { name: /登录/ }));
}

function mockLoginSuccess() {
  mockLogin.mockResolvedValue({
    success: true,
    data: {
      accessToken: "access-token-stub",
      refreshToken: "refresh-token-stub",
      user: { id: 1, username: "admin" },
    },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CLoginPage redirect sanitization", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockLogin.mockReset();
    searchParamsState.query = "";
    mockLoginSuccess();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirect=/my (合法根相对路径) 登录成功后 router.replace 调用 /my", async () => {
    searchParamsState.query = "redirect=/my";
    const { default: CLoginPage } = await import("./page");
    render(<CLoginPage />);

    await fillAndSubmitForm();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/my");
    });
  });

  it("redirect=//evil.com (协议相对攻击) 登录成功后 router.replace 回退到 /", async () => {
    searchParamsState.query = "redirect=//evil.com";
    const { default: CLoginPage } = await import("./page");
    render(<CLoginPage />);

    await fillAndSubmitForm();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/");
    });
  });

  it("redirect=https://evil.com (绝对 URL 攻击) 登录成功后 router.replace 回退到 /", async () => {
    searchParamsState.query = "redirect=https://evil.com";
    const { default: CLoginPage } = await import("./page");
    render(<CLoginPage />);

    await fillAndSubmitForm();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/");
    });
  });
});
