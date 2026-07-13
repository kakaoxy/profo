import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, renderHook } from "@testing-library/react";
import React from "react";
import type {
  ClientSessionData,
  SessionActionData,
  ActionResult,
} from "../types";
import type { AuthActions } from "./provider";
import { AuthProvider, useSession, useAuth } from "./provider";

// ─── Per-test configurable mocks (hoisted so vi.mock factories can read them) ─
const { mockRefresh, mockPush, mockReplace, mockBack } =
  vi.hoisted(() => ({
    mockRefresh: vi.fn(),
    mockPush: vi.fn(),
    mockReplace: vi.fn(),
    mockBack: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    refresh: mockRefresh,
    push: mockPush,
    back: mockBack,
  }),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const authenticatedSession: ClientSessionData = {
  user: { id: "u-1", email: "user@example.com" },
};

// ─── Test consumer to read session state via context ─────────────────────────

function SessionStatusText() {
  const session = useSession();
  return <span data-testid="session-status">{session.status}</span>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setVisibilityState(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
    writable: true,
  });
}

function buildMockActions(
  fetchSessionImpl: () => Promise<ActionResult<SessionActionData | null>>,
): AuthActions {
  return {
    login: vi.fn(),
    logout: vi.fn(),
    fetchSession: vi.fn(fetchSessionImpl),
    updateSessionToken: vi.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AuthProvider visibilitychange focus revalidation", () => {
  let originalVisibilityDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "visibilityState",
    );
    setVisibilityState("visible");
    mockRefresh.mockClear();
    mockPush.mockClear();
    mockReplace.mockClear();
    mockBack.mockClear();
  });

  afterEach(() => {
    // Restore the original visibilityState descriptor (or delete the override
    // to fall back to the prototype getter).
    if (originalVisibilityDescriptor) {
      Object.defineProperty(
        document,
        "visibilityState",
        originalVisibilityDescriptor,
      );
    } else {
      // @ts-expect-error -- deleting an instance property to restore prototype getter
      delete document.visibilityState;
    }
    vi.clearAllMocks();
  });

  // SubTask 7.1: RED — when focus revalidation succeeds with a still-valid
  // session, router.refresh() must NOT be called (current code always calls it).
  it("does not call router.refresh when focus revalidation succeeds with a valid session", async () => {
    const fetchSessionMock = vi.fn(
      async (): Promise<ActionResult<SessionActionData | null>> => ({
        success: true,
        data: authenticatedSession,
      }),
    );
    const onSessionExpired = vi.fn();
    const actions = buildMockActions(fetchSessionMock);

    render(
      <AuthProvider
        initialSession={authenticatedSession}
        actions={actions}
        onSessionExpired={onSessionExpired}
      >
        <SessionStatusText />
      </AuthProvider>,
    );

    expect(screen.getByTestId("session-status").textContent).toBe(
      "authenticated",
    );

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      // Flush the microtask queue so the async handler resumes after its
      // `await fetchSession()` and calls setSession / router.refresh.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchSessionMock).toHaveBeenCalledTimes(1);
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(screen.getByTestId("session-status").textContent).toBe(
      "authenticated",
    );
  });

  // SubTask 7.2: characterization test — when focus revalidation finds the
  // session expired (data: null) for a previously-authenticated user, both
  // router.refresh() and onSessionExpired MUST fire. This passes on the current
  // code and must keep passing after the fix.
  it("calls router.refresh and onSessionExpired when focus revalidation finds session expired", async () => {
    const fetchSessionMock = vi.fn(
      async (): Promise<ActionResult<SessionActionData | null>> => ({
        success: true,
        data: null,
      }),
    );
    const onSessionExpired = vi.fn();
    const actions = buildMockActions(fetchSessionMock);

    render(
      <AuthProvider
        initialSession={authenticatedSession}
        actions={actions}
        onSessionExpired={onSessionExpired}
      >
        <SessionStatusText />
      </AuthProvider>,
    );

    expect(screen.getByTestId("session-status").textContent).toBe(
      "authenticated",
    );

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchSessionMock).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("session-status").textContent).toBe(
      "unauthenticated",
    );
  });
});

// ─── useAuth oauthLogin conditional exposure (Task 10) ───────────────────────

function makeWrapper(actions: AuthActions, hasOAuth = false) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    // initialSession={null} skips the mount fetch — we only care about useAuth().
    return (
      <AuthProvider actions={actions} initialSession={null} hasOAuth={hasOAuth}>
        {children}
      </AuthProvider>
    );
  };
}

describe("useAuth oauthLogin conditional exposure", () => {
  it("does not expose oauthLogin when OAuth providers list is empty", () => {
    const actions = buildMockActions(async () => ({
      success: true as const,
      data: null,
    }));
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(actions, false),
    });

    expect(result.current.oauthLogin).toBeUndefined();
  });

  it("exposes oauthLogin when OAuth providers are configured", () => {
    const actions = buildMockActions(async () => ({
      success: true as const,
      data: null,
    }));
    const { result } = renderHook(() => useAuth(), {
      wrapper: makeWrapper(actions, true),
    });

    expect(result.current.oauthLogin).toBeDefined();
    expect(typeof result.current.oauthLogin).toBe("function");
  });
});
