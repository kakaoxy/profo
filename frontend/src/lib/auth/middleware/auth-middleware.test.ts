import { describe, it, expect } from "vitest";
import { matchesPath, patternToRegex } from "./auth-middleware";

describe("patternToRegex", () => {
  it("returns identical RegExp instance for the same pattern (cache hit)", () => {
    const r1 = patternToRegex("/dashboard/:path*");
    const r2 = patternToRegex("/dashboard/:path*");
    expect(r1).toBe(r2);
  });
});

describe("matchesPath", () => {
  it("matches a nested path against a :path* pattern", () => {
    expect(matchesPath("/dashboard/settings", ["/dashboard/:path*"])).toBe(true);
  });

  it("does not match an unrelated path", () => {
    expect(matchesPath("/other", ["/dashboard/:path*"])).toBe(false);
  });
});
